/**
 * EMA Crossover Indicator Trading Interface
 */

class TradingInterface {
    constructor() {
        this.chart = null;
        this.socket = null;
        this.candleData = [];
        this.indicators = new Map();
        this.trendLines = new Map();
        this.isDrawingMode = false;
        this.currentDrawingLine = null;
        this.selectedIndicator = 'ema_9_21';
        
        this.init();
    }
    
    init() {
        this.setupChart();
        this.setupWebSocket();
        this.setupEventListeners();
        this.loadIndicators();
        this.showConnectionStatus('Connecting...', 'info');
    }
    
    setupChart() {
        // Initialize with Plotly for advanced charting
        const layout = {
            title: {
                text: 'EMA Crossover Trading Chart',
                font: { color: '#00d4ff', size: 18 }
            },
            xaxis: {
                title: 'Time',
                gridcolor: '#2a3f5f',
                color: '#b0b8c4'
            },
            yaxis: {
                title: 'Price',
                gridcolor: '#2a3f5f',
                color: '#b0b8c4'
            },
            plot_bgcolor: '#0a0e1a',
            paper_bgcolor: '#1a1f3a',
            font: { color: '#ffffff' },
            showlegend: true,
            legend: {
                x: 0,
                y: 1,
                bgcolor: 'rgba(26, 31, 58, 0.8)'
            },
            margin: { t: 50, b: 50, l: 60, r: 20 }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
            displaylogo: false
        };
        
        Plotly.newPlot('trading-chart', [], layout, config);
        
        // Add click event for trend line drawing
        document.getElementById('trading-chart').on('plotly_click', (data) => {
            if (this.isDrawingMode) {
                this.handleChartClick(data);
            }
        });
    }
    
    setupWebSocket() {
        const wsUrl = `ws://${window.location.host}/ws/candles?market=BTC-USD&timeframe=1m`;
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.showConnectionStatus('Connected', 'connected');
        };
        
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleCandleData(data);
        };
        
        this.socket.onclose = () => {
            console.log('WebSocket disconnected');
            this.showConnectionStatus('Disconnected', 'disconnected');
            // Attempt reconnection
            setTimeout(() => this.setupWebSocket(), 5000);
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showConnectionStatus('Connection Error', 'disconnected');
        };
    }
    
    setupEventListeners() {
        // Create Indicator
        document.getElementById('create-indicator-btn').addEventListener('click', () => {
            this.createIndicator();
        });
        
        // Toggle Drawing Mode
        document.getElementById('toggle-drawing-btn').addEventListener('click', () => {
            this.toggleDrawingMode();
        });
        
        // Clear Trend Lines
        document.getElementById('clear-trendlines-btn').addEventListener('click', () => {
            this.clearTrendLines();
        });
        
        // Indicator Selection
        document.getElementById('indicator-select').addEventListener('change', (e) => {
            this.selectedIndicator = e.target.value;
            this.updateChart();
        });
        
        // Market and Timeframe changes
        document.getElementById('market-select').addEventListener('change', () => {
            this.reconnectWebSocket();
        });
        
        document.getElementById('timeframe-select').addEventListener('change', () => {
            this.reconnectWebSocket();
        });
    }
    
    handleCandleData(data) {
        if (data.type === 'candle') {
            // Add new candle data
            this.candleData.push({
                timestamp: data.timestamp,
                open: data.open,
                high: data.high,
                low: data.low,
                close: data.close,
                volume: data.volume || 1000000
            });
            
            // Keep only last 200 candles for performance
            if (this.candleData.length > 200) {
                this.candleData = this.candleData.slice(-200);
            }
            
            this.calculateIndicators();
        }
    }
    
    async calculateIndicators() {
        if (this.candleData.length < 21) return; // Need enough data
        
        try {
            const response = await fetch(`/api/indicators/${this.selectedIndicator}/calculate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.candleData)
            });
            
            if (response.ok) {
                const indicatorData = await response.json();
                this.updateChart(indicatorData);
                this.updateSignalPanel(indicatorData.signals);
            }
        } catch (error) {
            console.error('Error calculating indicators:', error);
        }
    }
    
    updateChart(indicatorData = null) {
        if (this.candleData.length === 0) return;
        
        const traces = [];
        
        // Candlestick trace
        const candlestickTrace = {
            x: this.candleData.map(d => d.timestamp),
            open: this.candleData.map(d => d.open),
            high: this.candleData.map(d => d.high),
            low: this.candleData.map(d => d.low),
            close: this.candleData.map(d => d.close),
            type: 'candlestick',
            name: 'Price',
            increasing: { line: { color: '#00ff88' } },
            decreasing: { line: { color: '#ff3366' } }
        };
        traces.push(candlestickTrace);
        
        if (indicatorData) {
            // Fast EMA trace
            const fastEmaTrace = {
                x: indicatorData.timestamps,
                y: indicatorData.fast_ema,
                type: 'scatter',
                mode: 'lines',
                name: 'Fast EMA (9)',
                line: { color: '#00d4ff', width: 2 }
            };
            traces.push(fastEmaTrace);
            
            // Slow EMA trace
            const slowEmaTrace = {
                x: indicatorData.timestamps,
                y: indicatorData.slow_ema,
                type: 'scatter',
                mode: 'lines',
                name: 'Slow EMA (21)',
                line: { color: '#ffc107', width: 2 }
            };
            traces.push(slowEmaTrace);
            
            // Signal markers
            const bullishSignals = indicatorData.signals.filter(s => s.type === 'bullish');
            const bearishSignals = indicatorData.signals.filter(s => s.type === 'bearish');
            
            if (bullishSignals.length > 0) {
                const bullishTrace = {
                    x: bullishSignals.map(s => s.timestamp),
                    y: bullishSignals.map(s => s.price),
                    type: 'scatter',
                    mode: 'markers',
                    name: 'Bullish Signal',
                    marker: {
                        symbol: 'triangle-up',
                        size: 12,
                        color: '#00ff88'
                    }
                };
                traces.push(bullishTrace);
            }
            
            if (bearishSignals.length > 0) {
                const bearishTrace = {
                    x: bearishSignals.map(s => s.timestamp),
                    y: bearishSignals.map(s => s.price),
                    type: 'scatter',
                    mode: 'markers',
                    name: 'Bearish Signal',
                    marker: {
                        symbol: 'triangle-down',
                        size: 12,
                        color: '#ff3366'
                    }
                };
                traces.push(bearishTrace);
            }
            
            // Trend lines
            indicatorData.trend_lines.forEach(tl => {
                const trendTrace = {
                    x: [tl.start_point[0], tl.end_point[0]],
                    y: [tl.start_point[1], tl.end_point[1]],
                    type: 'scatter',
                    mode: 'lines',
                    name: `${tl.trend_type} Line`,
                    line: {
                        color: tl.color,
                        width: 2,
                        dash: tl.trend_type === 'support' ? 'solid' : 'dash'
                    }
                };
                traces.push(trendTrace);
            });
        }
        
        Plotly.react('trading-chart', traces, {
            title: {
                text: 'EMA Crossover Trading Chart',
                font: { color: '#00d4ff', size: 18 }
            },
            xaxis: {
                title: 'Time',
                gridcolor: '#2a3f5f',
                color: '#b0b8c4'
            },
            yaxis: {
                title: 'Price',
                gridcolor: '#2a3f5f',
                color: '#b0b8c4'
            },
            plot_bgcolor: '#0a0e1a',
            paper_bgcolor: '#1a1f3a',
            font: { color: '#ffffff' },
            showlegend: true,
            legend: {
                x: 0,
                y: 1,
                bgcolor: 'rgba(26, 31, 58, 0.8)'
            },
            margin: { t: 50, b: 50, l: 60, r: 20 }
        });
    }
    
    updateSignalPanel(signals) {
        const signalPanel = document.getElementById('signal-panel');
        signalPanel.innerHTML = '';
        
        if (signals.length === 0) {
            signalPanel.innerHTML = '<div class="signal-card"><div class="signal-type">No Signals</div></div>';
            return;
        }
        
        // Show last 3 signals
        const recentSignals = signals.slice(-3).reverse();
        
        recentSignals.forEach(signal => {
            const signalCard = document.createElement('div');
            signalCard.className = `signal-card ${signal.type}`;
            
            const powerBar = this.createPowerBar(signal.power);
            
            signalCard.innerHTML = `
                <div class="signal-type ${signal.type}">
                    ${signal.type.toUpperCase()}
                </div>
                <div class="signal-power">
                    Power: ${signal.power.toFixed(1)}%
                    ${powerBar}
                </div>
                <div style="font-size: 0.8rem; color: #b0b8c4; margin-top: 5px;">
                    ${new Date(signal.timestamp).toLocaleTimeString()}
                </div>
            `;
            
            signalPanel.appendChild(signalCard);
        });
    }
    
    createPowerBar(power) {
        const width = Math.min(power, 100);
        const color = power > 70 ? '#00ff88' : power > 40 ? '#ffc107' : '#ff3366';
        
        return `
            <div style="background: #2a3f5f; height: 4px; border-radius: 2px; margin-top: 5px;">
                <div style="background: ${color}; height: 100%; width: ${width}%; border-radius: 2px;"></div>
            </div>
        `;
    }
    
    async createIndicator() {
        const name = document.getElementById('indicator-name').value;
        const fastPeriod = parseInt(document.getElementById('fast-period').value);
        const slowPeriod = parseInt(document.getElementById('slow-period').value);
        
        if (!name || !fastPeriod || !slowPeriod) {
            this.showStatus('Please fill all fields', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/indicators', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    fast_period: fastPeriod,
                    slow_period: slowPeriod
                })
            });
            
            if (response.ok) {
                this.showStatus('Indicator created successfully', 'success');
                this.loadIndicators();
                // Clear form
                document.getElementById('indicator-name').value = '';
                document.getElementById('fast-period').value = '9';
                document.getElementById('slow-period').value = '21';
            } else {
                this.showStatus('Error creating indicator', 'error');
            }
        } catch (error) {
            this.showStatus('Error creating indicator', 'error');
        }
    }
    
    async loadIndicators() {
        try {
            const response = await fetch('/api/indicators');
            if (response.ok) {
                const indicators = await response.json();
                this.updateIndicatorList(indicators);
                this.updateIndicatorSelect(indicators);
            }
        } catch (error) {
            console.error('Error loading indicators:', error);
        }
    }
    
    updateIndicatorList(indicators) {
        const indicatorList = document.getElementById('indicator-list');
        indicatorList.innerHTML = '';
        
        Object.entries(indicators).forEach(([name, config]) => {
            const item = document.createElement('div');
            item.className = 'indicator-item';
            
            item.innerHTML = `
                <div class="indicator-info">
                    <div class="indicator-name">${name}</div>
                    <div class="indicator-params">Fast: ${config.fast_period}, Slow: ${config.slow_period}</div>
                </div>
                <div class="indicator-actions">
                    <button class="btn btn-danger btn-small" onclick="tradingInterface.deleteIndicator('${name}')">
                        Delete
                    </button>
                </div>
            `;
            
            indicatorList.appendChild(item);
        });
    }
    
    updateIndicatorSelect(indicators) {
        const select = document.getElementById('indicator-select');
        select.innerHTML = '';
        
        Object.keys(indicators).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        
        if (Object.keys(indicators).length > 0) {
            this.selectedIndicator = Object.keys(indicators)[0];
        }
    }
    
    async deleteIndicator(name) {
        if (!confirm(`Delete indicator "${name}"?`)) return;
        
        try {
            const response = await fetch(`/api/indicators/${name}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showStatus('Indicator deleted successfully', 'success');
                this.loadIndicators();
            } else {
                this.showStatus('Error deleting indicator', 'error');
            }
        } catch (error) {
            this.showStatus('Error deleting indicator', 'error');
        }
    }
    
    toggleDrawingMode() {
        this.isDrawingMode = !this.isDrawingMode;
        const btn = document.getElementById('toggle-drawing-btn');
        const drawingStatus = document.getElementById('drawing-status');
        
        if (this.isDrawingMode) {
            btn.textContent = 'Exit Drawing';
            btn.className = 'btn btn-danger';
            drawingStatus.textContent = 'Click two points on the chart to draw a trend line';
            drawingStatus.className = 'drawing-mode active';
        } else {
            btn.textContent = 'Draw Trend Line';
            btn.className = 'btn btn-primary';
            drawingStatus.textContent = 'Drawing mode disabled';
            drawingStatus.className = 'drawing-mode';
            this.currentDrawingLine = null;
        }
    }
    
    handleChartClick(data) {
        if (!this.isDrawingMode || !data.points || data.points.length === 0) return;
        
        const point = data.points[0];
        const timestamp = point.x;
        const price = point.y;
        
        if (!this.currentDrawingLine) {
            // Start new trend line
            this.currentDrawingLine = {
                start: [timestamp, price],
                end: null
            };
            this.showStatus('Click second point to complete trend line', 'info');
        } else {
            // Complete trend line
            this.currentDrawingLine.end = [timestamp, price];
            this.createTrendLine(this.currentDrawingLine);
            this.currentDrawingLine = null;
        }
    }
    
    async createTrendLine(lineData) {
        const trendType = document.getElementById('trend-type').value;
        const color = document.getElementById('trend-color').value;
        const id = `trendline_${Date.now()}`;
        
        try {
            const response = await fetch(`/api/indicators/${this.selectedIndicator}/trendlines`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: id,
                    start_point: [lineData.start[0], lineData.start[1].toString()],
                    end_point: [lineData.end[0], lineData.end[1].toString()],
                    trend_type: trendType,
                    color: color
                })
            });
            
            if (response.ok) {
                this.showStatus('Trend line created successfully', 'success');
                this.calculateIndicators(); // Refresh chart with new trend line
            } else {
                this.showStatus('Error creating trend line', 'error');
            }
        } catch (error) {
            this.showStatus('Error creating trend line', 'error');
        }
    }
    
    async clearTrendLines() {
        if (!confirm('Clear all trend lines?')) return;
        
        try {
            // Get all trend lines first
            const response = await fetch(`/api/indicators/${this.selectedIndicator}/trendlines`);
            if (response.ok) {
                const trendLines = await response.json();
                
                // Delete each trend line
                for (const tl of trendLines) {
                    await fetch(`/api/indicators/${this.selectedIndicator}/trendlines/${tl.id}`, {
                        method: 'DELETE'
                    });
                }
                
                this.showStatus('All trend lines cleared', 'success');
                this.calculateIndicators(); // Refresh chart
            }
        } catch (error) {
            this.showStatus('Error clearing trend lines', 'error');
        }
    }
    
    reconnectWebSocket() {
        const market = document.getElementById('market-select').value;
        const timeframe = document.getElementById('timeframe-select').value;
        
        if (this.socket) {
            this.socket.close();
        }
        
        this.candleData = []; // Clear existing data
        const wsUrl = `ws://${window.location.host}/ws/candles?market=${market}&timeframe=${timeframe}`;
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            console.log('WebSocket reconnected');
            this.showConnectionStatus('Connected', 'connected');
        };
        
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleCandleData(data);
        };
        
        this.socket.onclose = () => {
            console.log('WebSocket disconnected');
            this.showConnectionStatus('Disconnected', 'disconnected');
        };
    }
    
    showStatus(message, type) {
        const statusDiv = document.getElementById('status-message');
        statusDiv.textContent = message;
        statusDiv.className = `status-message status-${type}`;
        statusDiv.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
    
    showConnectionStatus(message, status) {
        let statusDiv = document.getElementById('connection-status');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'connection-status';
            statusDiv.className = 'connection-status';
            document.body.appendChild(statusDiv);
        }
        
        statusDiv.textContent = message;
        statusDiv.className = `connection-status ${status}`;
    }
}

// Initialize the trading interface when the page loads
let tradingInterface;

document.addEventListener('DOMContentLoaded', () => {
    tradingInterface = new TradingInterface();
});

// Global function for indicator deletion (called from HTML)
window.deleteIndicator = (name) => {
    if (tradingInterface) {
        tradingInterface.deleteIndicator(name);
    }
};