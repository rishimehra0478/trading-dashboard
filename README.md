# 🚀 EMA Crossover Trading Indicator System

A professional-grade EMA (Exponential Moving Average) crossover indicator with advanced trend line analysis, real-time signal detection, and power measurement for cryptocurrency trading.

## 🎯 Features

### Core Indicators
- **9/21 EMA Crossover**: Classic fast/slow EMA crossover strategy
- **Customizable Periods**: Create multiple indicators with different EMA periods
- **Signal Power Calculation**: Advanced signal strength measurement based on:
  - EMA distance percentage
  - Volume analysis
  - Price momentum factors

### Signal Types
- 🟢 **Bullish Signal**: Fast EMA crosses above Slow EMA (Buy signal)
- 🔴 **Bearish Signal**: Fast EMA crosses below Slow EMA (Sell signal)
- 📊 **Power Rating**: 0-100% strength indicator for each signal

### Advanced Features
- **Interactive Trend Lines**: Draw support and resistance lines directly on the chart
- **Multiple Indicators**: Run several EMA indicators simultaneously
- **Real-time Data**: Live WebSocket connection to dYdX exchange
- **Professional UI**: TradingView-inspired interface with dark theme
- **Responsive Design**: Works on desktop and mobile devices

## 🛠 Installation

### Prerequisites
- Python 3.8+
- pip package manager

### Quick Start

1. **Clone or navigate to the project directory**
   ```bash
   cd /workspace
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**
   ```bash
   python run.py
   ```

4. **Access the application**
   - Main charts: http://localhost:8000
   - EMA Indicators: http://localhost:8000/indicators

## 📈 Usage Guide

### Basic Operation

1. **Access the EMA Interface**
   - Navigate to http://localhost:8000/indicators
   - The default 9/21 EMA indicator is pre-loaded

2. **Market Selection**
   - Choose your trading pair (BTC-USD, ETH-USD, SOL-USD, AVAX-USD)
   - Select timeframe (1m, 1h, 1d)

3. **Reading Signals**
   - Green triangles (↑) = Bullish crossover signals
   - Red triangles (↓) = Bearish crossover signals
   - Signal power shows strength (0-100%)

### Creating Custom Indicators

1. **Set Parameters**
   - Enter a unique indicator name
   - Set Fast EMA period (default: 9)
   - Set Slow EMA period (default: 21)

2. **Popular Configurations**
   - Conservative: 12/26 (similar to MACD)
   - Aggressive: 5/15 (faster signals)
   - Long-term: 21/50 (trend following)

### Drawing Trend Lines

1. **Enable Drawing Mode**
   - Click "Draw Trend Line" button
   - Select line type (Support/Resistance)
   - Choose line color

2. **Draw on Chart**
   - Click first point on the chart
   - Click second point to complete the line
   - Lines persist across sessions

### Signal Power Interpretation

- **70-100%**: Very strong signal, high confidence
- **40-69%**: Moderate signal, consider other factors
- **0-39%**: Weak signal, use caution

## 🔧 API Endpoints

### Indicators Management
```
POST   /api/indicators                     - Create new indicator
GET    /api/indicators                     - List all indicators
DELETE /api/indicators/{name}              - Delete indicator
POST   /api/indicators/{name}/calculate    - Calculate signals
```

### Trend Lines
```
POST   /api/indicators/{name}/trendlines   - Add trend line
GET    /api/indicators/{name}/trendlines   - Get trend lines
DELETE /api/indicators/{name}/trendlines/{id} - Remove trend line
```

### WebSocket
```
ws://localhost:8000/ws/candles?market=BTC-USD&timeframe=1m
```

## 📊 Technical Details

### EMA Calculation
The system uses the standard EMA formula:
```
EMA = (Price × Multiplier) + (Previous EMA × (1 - Multiplier))
Multiplier = 2 / (Period + 1)
```

### Signal Detection
Crossover detection logic:
- **Bullish**: Previous(Fast ≤ Slow) AND Current(Fast > Slow)
- **Bearish**: Previous(Fast ≥ Slow) AND Current(Fast < Slow)

### Power Calculation
```python
power = distance_percentage × volume_factor × momentum_factor
distance_percentage = |fast_ema - slow_ema| / slow_ema × 100
```

## 🎨 UI Components

### Chart Features
- **Candlestick charts** with OHLCV data
- **EMA overlay lines** (blue=fast, yellow=slow)
- **Signal markers** (triangles for crossovers)
- **Trend lines** (solid=support, dashed=resistance)
- **Real-time updates** via WebSocket

### Control Panel
- **Market settings** for pair and timeframe selection
- **Indicator management** for creating/deleting indicators
- **Trend line tools** for technical analysis
- **Live signal display** with power ratings

## 🔧 Configuration

### Default Settings
- Fast EMA: 9 periods
- Slow EMA: 21 periods
- Chart: 200 candles maximum
- Update frequency: Real-time via WebSocket

### Customization
- Modify periods in the UI or via API
- Add custom color schemes in CSS
- Extend indicator types in `indicators.py`

## 🚀 Advanced Usage

### Multiple Timeframe Analysis
Run the application on different timeframes simultaneously:
```bash
# Terminal 1 - 1-minute data
python run.py

# Terminal 2 - 1-hour data (different port)
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### Custom Indicators
Extend the `EMAIndicator` class in `app/indicators.py`:
```python
class CustomIndicator(EMAIndicator):
    def __init__(self, fast_period, slow_period, custom_param):
        super().__init__(fast_period, slow_period)
        self.custom_param = custom_param
```

### Backtesting
Use the calculated signals for historical analysis:
```python
signals = indicator.detect_crossovers(historical_df)
for signal in signals:
    print(f"{signal.timestamp}: {signal.signal_type} (Power: {signal.power}%)")
```

## 📱 Mobile Support

The interface is fully responsive:
- Touch-friendly controls
- Optimized chart interactions
- Collapsible control panel
- Swipe gestures for navigation

## 🛡 Error Handling

- **WebSocket reconnection** on connection loss
- **API error messages** with user feedback
- **Data validation** for indicator parameters
- **Graceful degradation** for missing data

## 🎯 Trading Strategies

### Basic Strategy
1. **Entry**: Wait for crossover signal with power > 50%
2. **Confirmation**: Check trend line support/resistance
3. **Exit**: Opposite signal or trend line break

### Advanced Strategy
1. **Multiple timeframes**: Confirm signals across timeframes
2. **Volume analysis**: Higher power = stronger conviction
3. **Trend lines**: Use as dynamic support/resistance
4. **Risk management**: Set stop-losses near trend lines

## 📈 Performance Optimization

- **Data limiting**: Only keeps last 200 candles in memory
- **Efficient calculations**: Vectorized operations with pandas/numpy
- **Lazy loading**: Indicators calculated on demand
- **Caching**: WebSocket data cached for multiple indicators

## 🔒 Security Notes

- **API validation**: All inputs validated with Pydantic
- **Error handling**: No sensitive data exposed in errors
- **CORS**: Configure for production deployment
- **Rate limiting**: Consider adding for production use

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- dYdX for market data API
- Plotly for interactive charting
- FastAPI for the web framework
- TradingView for UI inspiration

---

**⚠️ Disclaimer**: This tool is for educational and informational purposes only. Always conduct your own research and consider consulting with a financial advisor before making trading decisions. Past performance does not guarantee future results.