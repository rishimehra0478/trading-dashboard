"""
EMA Crossover and Technical Indicators Module
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum

class SignalType(Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"

@dataclass
class CrossoverSignal:
    timestamp: str
    signal_type: SignalType
    fast_ema: float
    slow_ema: float
    power: float
    price: float

@dataclass
class TrendLine:
    id: str
    start_point: Tuple[str, float]  # (timestamp, price)
    end_point: Tuple[str, float]    # (timestamp, price)
    trend_type: str  # 'support' or 'resistance'
    color: str

class EMAIndicator:
    def __init__(self, fast_period: int = 9, slow_period: int = 21):
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.signals = []
        self.trend_lines = []
        
    def calculate_ema(self, prices: List[float], period: int) -> List[float]:
        """Calculate Exponential Moving Average"""
        if len(prices) < period:
            return [np.nan] * len(prices)
        
        ema_values = []
        multiplier = 2 / (period + 1)
        
        # Initialize with SMA for first value
        sma = sum(prices[:period]) / period
        ema_values.extend([np.nan] * (period - 1))
        ema_values.append(sma)
        
        # Calculate EMA for remaining values
        for i in range(period, len(prices)):
            ema = (prices[i] * multiplier) + (ema_values[-1] * (1 - multiplier))
            ema_values.append(ema)
            
        return ema_values
    
    def calculate_signal_power(self, fast_ema: float, slow_ema: float, 
                             volume: float = 1.0, price: float = 1.0) -> float:
        """Calculate signal strength/power"""
        if fast_ema == 0 or slow_ema == 0:
            return 0.0
        
        # Distance between EMAs as percentage
        distance_pct = abs(fast_ema - slow_ema) / slow_ema * 100
        
        # Volume factor (normalized)
        volume_factor = min(volume / 1000000, 2.0)  # Cap at 2x
        
        # Price momentum (simple approach)
        momentum_factor = 1.0
        
        # Combined power calculation
        power = distance_pct * volume_factor * momentum_factor
        
        # Normalize to 0-100 scale
        return min(power * 10, 100.0)
    
    def detect_crossovers(self, df: pd.DataFrame) -> List[CrossoverSignal]:
        """Detect EMA crossover signals"""
        if len(df) < max(self.fast_period, self.slow_period):
            return []
        
        # Calculate EMAs
        fast_ema = self.calculate_ema(df['close'].tolist(), self.fast_period)
        slow_ema = self.calculate_ema(df['close'].tolist(), self.slow_period)
        
        signals = []
        
        for i in range(1, len(df)):
            if pd.isna(fast_ema[i]) or pd.isna(slow_ema[i]):
                continue
                
            prev_fast = fast_ema[i-1]
            prev_slow = slow_ema[i-1]
            curr_fast = fast_ema[i]
            curr_slow = slow_ema[i]
            
            if pd.isna(prev_fast) or pd.isna(prev_slow):
                continue
            
            signal_type = SignalType.NEUTRAL
            
            # Bullish crossover: fast EMA crosses above slow EMA
            if prev_fast <= prev_slow and curr_fast > curr_slow:
                signal_type = SignalType.BULLISH
            # Bearish crossover: fast EMA crosses below slow EMA
            elif prev_fast >= prev_slow and curr_fast < curr_slow:
                signal_type = SignalType.BEARISH
            
            if signal_type != SignalType.NEUTRAL:
                volume = df.iloc[i].get('volume', 1000000)
                power = self.calculate_signal_power(
                    curr_fast, curr_slow, volume, df.iloc[i]['close']
                )
                
                signal = CrossoverSignal(
                    timestamp=df.iloc[i]['timestamp'],
                    signal_type=signal_type,
                    fast_ema=curr_fast,
                    slow_ema=curr_slow,
                    power=power,
                    price=df.iloc[i]['close']
                )
                signals.append(signal)
        
        return signals
    
    def add_trend_line(self, trend_line: TrendLine):
        """Add a trend line to the indicator"""
        self.trend_lines.append(trend_line)
    
    def remove_trend_line(self, trend_line_id: str):
        """Remove a trend line by ID"""
        self.trend_lines = [tl for tl in self.trend_lines if tl.id != trend_line_id]
    
    def get_indicator_data(self, df: pd.DataFrame) -> Dict:
        """Get complete indicator data for charting"""
        if len(df) < max(self.fast_period, self.slow_period):
            return {
                'timestamps': [],
                'prices': [],
                'fast_ema': [],
                'slow_ema': [],
                'signals': [],
                'trend_lines': []
            }
        
        fast_ema = self.calculate_ema(df['close'].tolist(), self.fast_period)
        slow_ema = self.calculate_ema(df['close'].tolist(), self.slow_period)
        signals = self.detect_crossovers(df)
        
        return {
            'timestamps': df['timestamp'].tolist(),
            'prices': df['close'].tolist(),
            'fast_ema': fast_ema,
            'slow_ema': slow_ema,
            'signals': [
                {
                    'timestamp': s.timestamp,
                    'type': s.signal_type.value,
                    'fast_ema': s.fast_ema,
                    'slow_ema': s.slow_ema,
                    'power': s.power,
                    'price': s.price
                } for s in signals
            ],
            'trend_lines': [
                {
                    'id': tl.id,
                    'start_point': tl.start_point,
                    'end_point': tl.end_point,
                    'trend_type': tl.trend_type,
                    'color': tl.color
                } for tl in self.trend_lines
            ]
        }

class MultiIndicatorManager:
    """Manager for multiple indicators"""
    
    def __init__(self):
        self.indicators = {}
    
    def add_ema_indicator(self, name: str, fast_period: int, slow_period: int):
        """Add an EMA indicator"""
        self.indicators[name] = EMAIndicator(fast_period, slow_period)
        return self.indicators[name]
    
    def get_indicator(self, name: str) -> Optional[EMAIndicator]:
        """Get an indicator by name"""
        return self.indicators.get(name)
    
    def remove_indicator(self, name: str):
        """Remove an indicator"""
        if name in self.indicators:
            del self.indicators[name]
    
    def get_all_signals(self, df: pd.DataFrame) -> Dict:
        """Get signals from all indicators"""
        all_signals = {}
        for name, indicator in self.indicators.items():
            all_signals[name] = indicator.get_indicator_data(df)
        return all_signals

# Global indicator manager instance
indicator_manager = MultiIndicatorManager()

# Add default 9/21 EMA indicator
indicator_manager.add_ema_indicator("ema_9_21", 9, 21)