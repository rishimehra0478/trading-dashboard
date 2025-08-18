import asyncio
import json
import contextlib
import logging
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone

import websockets
import httpx
from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)


class Resolution(Enum):
	MINUTE = "1MIN"
	HOUR = "1HOUR"
	DAY = "1DAY"


def resolution_from_str(value: str) -> Optional[Resolution]:
	v = value.strip().lower()
	if v in ("1m", "m", "min", "1min", "minute"):
		return Resolution.MINUTE
	if v in ("1h", "h", "hour", "1hour"):
		return Resolution.HOUR
	if v in ("1d", "d", "day", "1day"):
		return Resolution.DAY
	return None


def iso_to_epoch_seconds(iso_ts: str) -> int:
	# Handle trailing 'Z'
	if iso_ts.endswith("Z"):
		iso_ts = iso_ts[:-1] + "+00:00"
	return int(datetime.fromisoformat(iso_ts).timestamp())


def normalize_candle(c: Dict[str, Any]) -> Dict[str, Any]:
	return {
		"time": iso_to_epoch_seconds(c.get("startedAt") or c.get("started_at")),
		"open": float(c["open"]),
		"high": float(c["high"]),
		"low": float(c["low"]),
		"close": float(c["close"]),
	}


async def safe_send_json(websocket: WebSocket, payload: Dict[str, Any]) -> bool:
	if websocket.client_state != WebSocketState.CONNECTED:
		return False
	try:
		await websocket.send_json(payload)
		return True
	except Exception as e:
		logger.info("Downstream websocket send failed, stopping stream: %s", e)
		with contextlib.suppress(Exception):
			await websocket.close()
		return False


def bucket_start_epoch(ts: datetime, resolution: Resolution) -> int:
	if resolution is Resolution.MINUTE:
		return int(ts.replace(second=0, microsecond=0).timestamp())
	if resolution is Resolution.HOUR:
		return int(ts.replace(minute=0, second=0, microsecond=0).timestamp())
	# DAY
	return int(ts.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())


async def fetch_candles_v4(market: str, resolution: str, limit: int) -> List[Dict[str, Any]]:
	url = f"https://indexer.dydx.trade/v4/candles/perpetualMarkets/{market}"
	params = {"resolution": resolution, "limit": str(limit)}
	logger.info(f"Fetching v4 candles: %s params=%s", url, params)
	async with httpx.AsyncClient(timeout=15.0) as client_http:
		res = await client_http.get(url, params=params)
		res.raise_for_status()
		body = res.json() or {}
		candles = body.get("candles", body)
		return candles if isinstance(candles, list) else []


async def fetch_candles_v3(market: str, resolution: str, limit: int) -> List[Dict[str, Any]]:
	params = {"market": market, "resolution": resolution, "limit": str(limit)}
	logger.info("Fetching v3 candles: params=%s", params)
	async with httpx.AsyncClient(timeout=15.0) as client_http:
		res = await client_http.get("https://api.dydx.exchange/v3/candles", params=params)
		res.raise_for_status()
		body = res.json() or {}
		return (body or {}).get("candles", [])


async def fetch_current_price_v4(market: str) -> Optional[float]:
	# Try dedicated market, then markets list, then latest 1min candle close
	async with httpx.AsyncClient(timeout=10.0) as client_http:
		for url in [
			f"https://indexer.dydx.trade/v4/perpetualMarkets/{market}",
			"https://indexer.dydx.trade/v4/perpetualMarkets",
			f"https://indexer.dydx.trade/v4/candles/perpetualMarkets/{market}?resolution=1MIN&limit=1",
		]:
			try:
				res = await client_http.get(url)
				if res.status_code != 200:
					continue
				data = res.json() or {}
				if "market" in data:
					m = data["market"] or {}
					p = float(m.get("oraclePrice") or 0) or float(m.get("indexPrice") or 0)
					if p > 0:
						return p
				elif "markets" in data and market in data["markets"]:
					m = data["markets"][market] or {}
					p = float(m.get("oraclePrice") or 0) or float(m.get("indexPrice") or 0)
					if p > 0:
						return p
				elif "candles" in data and data["candles"]:
					c = data["candles"][0]
					p = float(c.get("close") or 0)
					if p > 0:
						return p
			except Exception:
				continue
	return None


async def fetch_initial_candles(market: str, resolution: Resolution, limit: int = 300) -> List[Dict[str, Any]]:
	candles: List[Dict[str, Any]] = []
	try:
		candles = await fetch_candles_v4(market, resolution.value, limit)
		logger.info("v4 candles count=%d", len(candles))
	except Exception as e:
		logger.warning("v4 candles fetch failed: %s", e)
		try:
			candles = await fetch_candles_v3(market, resolution.value, limit)
			logger.info("v3 candles count=%d", len(candles))
		except Exception as e2:
			logger.error("v3 candles fetch failed: %s", e2)
			candles = []
	candles_sorted = sorted(candles, key=lambda c: iso_to_epoch_seconds(c.get("startedAt") or c.get("started_at")))
	return [normalize_candle(c) for c in candles_sorted]


async def trades_update_loop(websocket: WebSocket, market: str, resolution: Resolution, last_candle: Dict[str, Any]) -> None:
	# Use trades to update forming candle in real-time
	ws_url = "wss://indexer.dydx.trade/v4/ws"
	subscribe_msg = {"type": "subscribe", "channel": "v4_trades", "id": market}
	current_time = last_candle.get("time", 0)
	open_, high_, low_, close_ = last_candle["open"], last_candle["high"], last_candle["low"], last_candle["close"]
	logger.info("Starting trades updater for %s %s", market, resolution.value)
	async with websockets.connect(ws_url, ping_interval=20, ping_timeout=20) as upstream:
		await upstream.send(json.dumps(subscribe_msg))
		while True:
			if websocket.client_state != WebSocketState.CONNECTED:
				return
			msg = await upstream.recv()
			data = json.loads(msg)
			if data.get("type") != "channel_data":
				continue
			contents = data.get("contents") or {}
			trades = contents.get("trades") or []
			# Sometimes a single trade payload
			if not trades and ("price" in contents and "createdAt" in contents):
				trades = [contents]
			if not trades:
				continue
			for t in trades:
				try:
					price = float(t.get("price"))
					created_at = t.get("createdAt") or t.get("created_at")
					if not created_at:
						continue
					trade_ts = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
					bucket = bucket_start_epoch(trade_ts, resolution)
					if current_time == 0:
						current_time = bucket
						open_ = high_ = low_ = close_ = price
					elif bucket > current_time:
						# new candle bucket
						current_time = bucket
						open_ = high_ = low_ = close_ = price
					else:
						# same candle bucket, update OHLC
						close_ = price
						high_ = max(high_, price)
						low_ = min(low_, price)
					norm = {"time": current_time, "open": open_, "high": high_, "low": low_, "close": close_}
					ok = await safe_send_json(websocket, {
						"type": "update",
						"market": market,
						"resolution": resolution.value,
						"candle": norm,
					})
					if not ok:
						return
				except Exception:
					continue


async def subscribe_and_forward(websocket: WebSocket, market: str, resolution: Resolution) -> None:
	endpoints = [
		("wss://indexer.dydx.trade/v4/ws", "v4_candles"),
		("wss://api.dydx.exchange/v3/ws", "candles"),
	]
	for ws_url, channel in endpoints:
		try:
			logger.info("Connecting upstream WS: %s channel=%s id=%s", ws_url, channel, f"{market}/{resolution.value}")
			async with websockets.connect(ws_url, ping_interval=20, ping_timeout=20) as upstream:
				subscribe_msg = {
					"type": "subscribe",
					"channel": channel,
					"id": f"{market}/{resolution.value}",
					"batched": True,
				}
				await upstream.send(json.dumps(subscribe_msg))
				logger.info("Upstream subscribed sent")
				while True:
					if websocket.client_state != WebSocketState.CONNECTED:
						return
					message = await upstream.recv()
					data = json.loads(message)
					type_ = data.get("type")
					if type_ != "channel_data":
						continue
					contents = data.get("contents") or {}
					candles = contents.get("candles") or []
					if not candles and ("open" in contents and "close" in contents):
						candles = [contents]
					if not candles:
						continue
					logger.info("Forwarding %d candle(s)", len(candles))
					for c in candles:
						norm = normalize_candle(c)
						ok = await safe_send_json(websocket, {
							"type": "update",
							"market": market,
							"resolution": resolution.value,
							"candle": norm,
						})
						if not ok:
							return
			return
		except Exception as e:
			logger.warning("Upstream WS failed (%s): %s", ws_url, e)
			continue
	raise RuntimeError("Unable to subscribe to dYdX candle websockets (v4 indexer / v3)")


def poll_interval_for(resolution: Resolution) -> float:
	if resolution is Resolution.MINUTE:
		return 2.0
	if resolution is Resolution.HOUR:
		return 10.0
	return 30.0


async def poll_and_forward(websocket: WebSocket, market: str, resolution: Resolution) -> None:
	interval = poll_interval_for(resolution)
	last_time: Optional[int] = None
	last_ohlc: Optional[Tuple[float, float, float, float]] = None
	logger.info("Starting polling fallback interval=%.1fs", interval)
	while True:
		if websocket.client_state != WebSocketState.CONNECTED:
			return
		try:
			latest = await fetch_initial_candles(market, resolution, limit=2)
			if latest:
				last = latest[-1]
				# Enrich with current price to form candle intra-period
				current_price = await fetch_current_price_v4(market)
				if current_price is not None:
					# Adjust close and high/low relative to current price
					last = dict(last)
					last_close = current_price
					last_high = max(last["high"], last_close)
					last_low = min(last["low"], last_close)
					last["close"], last["high"], last["low"] = last_close, last_high, last_low
				current_ohlc = (last["open"], last["high"], last["low"], last["close"])
				if last_time is None:
					ok = await safe_send_json(websocket, {
						"type": "update",
						"market": market,
						"resolution": resolution.value,
						"candle": last,
					})
					if not ok:
						return
					last_time = last["time"]
					last_ohlc = current_ohlc
				elif last["time"] > last_time:
					ok = await safe_send_json(websocket, {
						"type": "update",
						"market": market,
						"resolution": resolution.value,
						"candle": last,
					})
					if not ok:
						return
					last_time = last["time"]
					last_ohlc = current_ohlc
				else:
					if last_ohlc != current_ohlc:
						ok = await safe_send_json(websocket, {
							"type": "update",
							"market": market,
							"resolution": resolution.value,
							"candle": last,
						})
						if not ok:
							return
		except Exception as e:
			logger.warning("Polling error: %s", e)
		await asyncio.sleep(interval)


async def forward_candles_ws(websocket: WebSocket, market: str, resolution: Resolution) -> None:
	initial = await fetch_initial_candles(market, resolution)
	logger.info("Sending snapshot len=%d market=%s res=%s", len(initial), market, resolution.value)
	await safe_send_json(websocket, {
		"type": "snapshot",
		"market": market,
		"resolution": resolution.value,
		"candles": initial,
	})
	if not initial:
		await safe_send_json(websocket, {"type": "error", "message": "No candles available from upstream."})
	# Try trades-driven real-time updates first (best visual effect), else fallback
	try:
		last = initial[-1] if initial else {"time": 0, "open": 0.0, "high": 0.0, "low": 0.0, "close": 0.0}
		await trades_update_loop(websocket, market, resolution, last)
	except Exception as e:
		logger.warning("Trades updater failed, trying candle WS: %s", e)
		try:
			await subscribe_and_forward(websocket, market, resolution)
		except Exception as e2:
			logger.warning("Switching to polling fallback: %s", e2)
			await poll_and_forward(websocket, market, resolution)
