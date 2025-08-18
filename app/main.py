from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import asyncio
import contextlib
from typing import Optional

from .dydx_ws import forward_candles_ws, resolution_from_str

app = FastAPI(title="Octobot dYdX Candles")

app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
	return templates.TemplateResponse("index.html", {"request": request})


@app.websocket("/ws/candles")
async def candles_ws(
	websocket: WebSocket,
	market: str = Query("BTC-USD"),
	timeframe: str = Query("1m"),
):
	await websocket.accept()
	resolution = resolution_from_str(timeframe)
	if resolution is None:
		await websocket.send_json({"type": "error", "message": "Invalid timeframe. Use 1m, 1h, or 1d."})
		await websocket.close(code=1008)
		return
	try:
		await forward_candles_ws(websocket, market=market, resolution=resolution)
	except WebSocketDisconnect:
		pass
	except Exception as exc:
		try:
			await websocket.send_json({"type": "error", "message": str(exc)})
		except Exception:
			pass
		finally:
			with contextlib.suppress(Exception):
				await websocket.close()
