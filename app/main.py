from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import asyncio
import contextlib
import json
import pandas as pd
from typing import Optional, Dict, List
from pydantic import BaseModel

from .dydx_ws import forward_candles_ws, resolution_from_str
from .indicators import indicator_manager, TrendLine

app = FastAPI(title="Octobot dYdX Candles")

app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
	return templates.TemplateResponse("index.html", {"request": request})


@app.get("/indicators", response_class=HTMLResponse)
async def indicators_page(request: Request):
	return templates.TemplateResponse("indicators.html", {"request": request})


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


# Pydantic models for API requests
class CandleData(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float

class TrendLineRequest(BaseModel):
    id: str
    start_point: List[str]  # [timestamp, price]
    end_point: List[str]    # [timestamp, price]
    trend_type: str  # 'support' or 'resistance'
    color: str

class IndicatorRequest(BaseModel):
    name: str
    fast_period: int
    slow_period: int


@app.post("/api/indicators/{indicator_name}/calculate")
async def calculate_indicator(
    indicator_name: str,
    candles: List[CandleData]
):
    """Calculate indicator signals for given candle data"""
    try:
        # Convert to DataFrame
        df = pd.DataFrame([candle.dict() for candle in candles])
        
        # Get or create indicator
        indicator = indicator_manager.get_indicator(indicator_name)
        if not indicator:
            raise HTTPException(status_code=404, detail=f"Indicator {indicator_name} not found")
        
        # Calculate indicator data
        result = indicator.get_indicator_data(df)
        
        return JSONResponse(content=result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/indicators")
async def create_indicator(request: IndicatorRequest):
    """Create a new EMA indicator"""
    try:
        indicator = indicator_manager.add_ema_indicator(
            request.name, 
            request.fast_period, 
            request.slow_period
        )
        
        return JSONResponse(content={
            "message": f"Indicator {request.name} created successfully",
            "fast_period": request.fast_period,
            "slow_period": request.slow_period
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/indicators")
async def list_indicators():
    """List all available indicators"""
    indicators = {}
    for name, indicator in indicator_manager.indicators.items():
        indicators[name] = {
            "fast_period": indicator.fast_period,
            "slow_period": indicator.slow_period,
            "trend_lines_count": len(indicator.trend_lines)
        }
    
    return JSONResponse(content=indicators)


@app.delete("/api/indicators/{indicator_name}")
async def delete_indicator(indicator_name: str):
    """Delete an indicator"""
    indicator = indicator_manager.get_indicator(indicator_name)
    if not indicator:
        raise HTTPException(status_code=404, detail=f"Indicator {indicator_name} not found")
    
    indicator_manager.remove_indicator(indicator_name)
    return JSONResponse(content={"message": f"Indicator {indicator_name} deleted successfully"})


@app.post("/api/indicators/{indicator_name}/trendlines")
async def add_trend_line(indicator_name: str, trend_line: TrendLineRequest):
    """Add a trend line to an indicator"""
    indicator = indicator_manager.get_indicator(indicator_name)
    if not indicator:
        raise HTTPException(status_code=404, detail=f"Indicator {indicator_name} not found")
    
    # Create TrendLine object
    tl = TrendLine(
        id=trend_line.id,
        start_point=(trend_line.start_point[0], float(trend_line.start_point[1])),
        end_point=(trend_line.end_point[0], float(trend_line.end_point[1])),
        trend_type=trend_line.trend_type,
        color=trend_line.color
    )
    
    indicator.add_trend_line(tl)
    
    return JSONResponse(content={"message": f"Trend line {trend_line.id} added successfully"})


@app.delete("/api/indicators/{indicator_name}/trendlines/{trend_line_id}")
async def remove_trend_line(indicator_name: str, trend_line_id: str):
    """Remove a trend line from an indicator"""
    indicator = indicator_manager.get_indicator(indicator_name)
    if not indicator:
        raise HTTPException(status_code=404, detail=f"Indicator {indicator_name} not found")
    
    indicator.remove_trend_line(trend_line_id)
    return JSONResponse(content={"message": f"Trend line {trend_line_id} removed successfully"})


@app.get("/api/indicators/{indicator_name}/trendlines")
async def get_trend_lines(indicator_name: str):
    """Get all trend lines for an indicator"""
    indicator = indicator_manager.get_indicator(indicator_name)
    if not indicator:
        raise HTTPException(status_code=404, detail=f"Indicator {indicator_name} not found")
    
    trend_lines = [
        {
            'id': tl.id,
            'start_point': tl.start_point,
            'end_point': tl.end_point,
            'trend_type': tl.trend_type,
            'color': tl.color
        } for tl in indicator.trend_lines
    ]
    
    return JSONResponse(content=trend_lines)
