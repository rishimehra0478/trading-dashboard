(function () {
	// Wait for DOM to be fully loaded
	document.addEventListener('DOMContentLoaded', function() {
		const chartContainer = document.getElementById('chart');
		const rsiContainer = document.getElementById('rsi-chart');
		const marketSelect = document.getElementById('market-select');
		const tfButtons = Array.from(document.querySelectorAll('.tf'));
		const rsiToggle = document.getElementById('rsi-toggle');

		let chart, series, ws;
		let rsiChart = null;
		let syncingVisibleRange = false;
		let currentMarket = marketSelect.value;
		let currentTf = document.querySelector('.tf.active').dataset.tf;
		let tooltip = null;
		let rsiSeries = null;
		let rsiEnabled = false;
		let candleData = [];

		// RSI calculation function - using Wilder's smoothing method (same as Pine Script)
		function calculateRSI(data, period = 14) {
			if (data.length < period + 1) return [];
			
			const rsiData = [];
			let gains = 0;
			let losses = 0;
			
			// Calculate initial average gain and loss
			for (let i = 1; i <= period; i++) {
				const change = data[i].close - data[i - 1].close;
				if (change > 0) gains += change;
				else losses += Math.abs(change);
			}
			
			let avgGain = gains / period;
			let avgLoss = losses / period;
			
			// Calculate RSI for the first valid point
			const firstRSI = 100 - (100 / (1 + avgGain / avgLoss));
			rsiData.push({
				time: data[period].time,
				value: firstRSI
			});
			
			// Calculate RSI for remaining points using Wilder's smoothing
			for (let i = period + 1; i < data.length; i++) {
				const change = data[i].close - data[i - 1].close;
				let currentGain = 0;
				let currentLoss = 0;
				
				if (change > 0) currentGain = change;
				else currentLoss = Math.abs(change);
				
				// Wilder's smoothing: (prev_avg * (period - 1) + current) / period
				avgGain = (avgGain * (period - 1) + currentGain) / period;
				avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
				
				const rsi = 100 - (100 / (1 + avgGain / avgLoss));
				rsiData.push({
					time: data[i].time,
					value: rsi
				});
			}
			
			return rsiData;
		}

		// Toggle RSI indicator
		function toggleRSI() {
			console.log('RSI toggle clicked, current state:', rsiEnabled);
			if (rsiEnabled) {
				disableRSI();
			} else {
				enableRSI();
			}
		}

		function enableRSI() {
			console.log('Enabling RSI...');
			if (!chart) {
				console.error('Chart not initialized');
				return;
			}
			if (!candleData.length) {
				console.error('No candle data available');
				return;
			}
			
			try {
				rsiEnabled = true;
				rsiToggle.classList.add('active');
				// Show RSI container
				if (rsiContainer) {
					rsiContainer.style.display = 'block';
				}
				
				// Create RSI chart and series if not exists
				if (!rsiChart) {
					console.log('Creating RSI chart...');
					rsiChart = LightweightCharts.createChart(rsiContainer, {
						layout: { background: { type: 'solid', color: '#0f1115' }, textColor: '#c7d0dc' },
						grid: { vertLines: { color: '#1b1f2a' }, horzLines: { color: '#1b1f2a' } },
						rightPriceScale: { borderVisible: false },
						timeScale: { borderVisible: false, timeVisible: true, secondsVisible: currentTf === '1m' },
					});
					// Sync visible range between charts
					const mainTs = chart.timeScale();
					const rsiTs = rsiChart.timeScale();
					mainTs.subscribeVisibleTimeRangeChange((range) => {
						if (syncingVisibleRange) return; syncingVisibleRange = true; try { rsiTs.setVisibleRange(range); } finally { syncingVisibleRange = false; }
					});
					rsiTs.subscribeVisibleTimeRangeChange((range) => {
						if (syncingVisibleRange) return; syncingVisibleRange = true; try { mainTs.setVisibleRange(range); } finally { syncingVisibleRange = false; }
					});
				}
				// Main RSI line
				if (!rsiSeries) {
					rsiSeries = rsiChart.addLineSeries({
						color: '#9c27b0',
						lineWidth: 2,
						priceLineVisible: false,
						lastValueVisible: false
					});
					// Reference lines
					rsiSeries.overboughtLine = rsiChart.addLineSeries({ color: '#ef5350', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
					rsiSeries.oversoldLine = rsiChart.addLineSeries({ color: '#26a69a', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
					rsiSeries.middleLine = rsiChart.addLineSeries({ color: '#8b9bb4', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
					// Background areas
					rsiSeries.overboughtArea = rsiChart.addAreaSeries({
						topColor: 'rgba(239, 83, 80, 0.15)',
						bottomColor: 'rgba(239, 83, 80, 0.15)',
						lineColor: 'rgba(239, 83, 80, 0.3)',
						lineWidth: 1,
						priceLineVisible: false,
						lastValueVisible: false,
					});
					rsiSeries.oversoldArea = rsiChart.addAreaSeries({
						topColor: 'rgba(38, 166, 154, 0.15)',
						bottomColor: 'rgba(38, 166, 154, 0.15)',
						lineColor: 'rgba(38, 166, 154, 0.3)',
						lineWidth: 1,
						priceLineVisible: false,
						lastValueVisible: false,
					});
				}
				
				// Calculate and display RSI
				const rsiData = calculateRSI(candleData);
				if (rsiData.length > 0) {
					rsiSeries.setData(rsiData);
					
					// Update background areas for overbought/oversold zones
					if (rsiSeries.overboughtArea && rsiSeries.oversoldArea) {
						const overboughtData = [];
						const oversoldData = [];
						
						rsiData.forEach(point => {
							if (point.value > 70) {
								overboughtData.push({ time: point.time, value: 70 });
							}
							if (point.value < 30) {
								oversoldData.push({ time: point.time, value: 30 });
							}
						});
						
						rsiSeries.overboughtArea.setData(overboughtData);
						rsiSeries.oversoldArea.setData(oversoldData);
					}
					// Update reference lines
					if (rsiSeries.overboughtLine && rsiSeries.oversoldLine && rsiSeries.middleLine) {
						const ob = rsiData.map(point => ({ time: point.time, value: 70 }));
						const os = rsiData.map(point => ({ time: point.time, value: 30 }));
						const mid = rsiData.map(point => ({ time: point.time, value: 50 }));
						rsiSeries.overboughtLine.setData(ob);
						rsiSeries.oversoldLine.setData(os);
						rsiSeries.middleLine.setData(mid);
					}
				}
				
				console.log('RSI enabled successfully');
			} catch (error) {
				console.error('Error enabling RSI:', error);
				rsiEnabled = false;
				rsiToggle.classList.remove('active');
			}
		}

		function disableRSI() {
			console.log('Disabling RSI...');
			rsiEnabled = false;
			rsiToggle.classList.remove('active');
			try {
				if (rsiChart) {
					rsiChart.remove();
					rsiChart = null;
				}
				rsiSeries = null;
				if (rsiContainer) rsiContainer.style.display = 'none';
				console.log('RSI disabled successfully');
			} catch (error) {
				console.error('Error disabling RSI:', error);
			}
		}

		// Create tooltip element
		function createTooltip() {
			if (tooltip) {
				tooltip.remove();
			}
			tooltip = document.createElement('div');
			tooltip.className = 'chart-tooltip';
			tooltip.style.display = 'none';
			chartContainer.appendChild(tooltip);
		}

		function makeChart() {
			if (chart) {
				chart.remove();
			}
			chart = LightweightCharts.createChart(chartContainer, {
				layout: { background: { type: 'solid', color: '#0f1115' }, textColor: '#c7d0dc' },
				grid: { vertLines: { color: '#1b1f2a' }, horzLines: { color: '#1b1f2a' } },
				rightPriceScale: { borderVisible: false },
				timeScale: { borderVisible: false, timeVisible: true, secondsVisible: currentTf === '1m' },
				crosshair: {
					mode: LightweightCharts.CrosshairMode.Normal,
					vertLine: {
						color: '#2a3244',
						width: 1,
						style: 2,
					},
					horzLine: {
						color: '#2a3244',
						width: 1,
						style: 2,
					},
				},
			});
			series = chart.addCandlestickSeries({
				upColor: '#26a69a',
				downColor: '#ef5350',
				wickUpColor: '#26a69a',
				wickDownColor: '#ef5350',
				borderUpColor: '#26a69a',
				borderDownColor: '#ef5350',
			});

			// Add crosshair move handler
			chart.subscribeCrosshairMove((param) => {
				if (param.time && param.seriesData && param.seriesData.get(series)) {
					const candle = param.seriesData.get(series);
					if (candle) {
						showTooltip(param, candle);
					}
				} else {
					hideTooltip();
				}
			});

			// Create tooltip after chart is created
			createTooltip();

			// Hide tooltip when mouse leaves chart area
			chartContainer.addEventListener('mouseleave', hideTooltip);
			
			// Re-enable RSI if it was active
			if (rsiEnabled) {
				setTimeout(() => enableRSI(), 100);
			}
		}

		function showTooltip(param, candle) {
			if (!tooltip) return;

			const time = new Date(param.time * 1000);
			const timeStr = currentTf === '1m' 
				? time.toLocaleTimeString() 
				: time.toLocaleDateString() + ' ' + time.toLocaleTimeString();

			tooltip.innerHTML = `
				<div class="tooltip-time">${timeStr}</div>
				<div class="tooltip-row">
					<span class="tooltip-label">O</span>
					<span class="tooltip-value">${candle.open.toFixed(2)}</span>
				</div>
				<div class="tooltip-row">
					<span class="tooltip-label">H</span>
					<span class="tooltip-value">${candle.high.toFixed(2)}</span>
				</div>
				<div class="tooltip-row">
					<span class="tooltip-label">L</span>
					<span class="tooltip-value">${candle.low.toFixed(2)}</span>
				</div>
				<div class="tooltip-row">
					<span class="tooltip-label">C</span>
					<span class="tooltip-value">${candle.close.toFixed(2)}</span>
				</div>
			`;

			// Position tooltip
			const rect = chartContainer.getBoundingClientRect();
			const x = param.point.x;
			const y = param.point.y;
			
			tooltip.style.left = Math.min(x + 10, rect.width - tooltip.offsetWidth - 10) + 'px';
			tooltip.style.top = Math.max(y - tooltip.offsetHeight - 10, 10) + 'px';
			tooltip.style.display = 'block';
		}

		function hideTooltip() {
			if (tooltip) {
				tooltip.style.display = 'none';
			}
		}

		function wsUrl(market, tf) {
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			return `${protocol}//${window.location.host}/ws/candles?market=${encodeURIComponent(market)}&timeframe=${encodeURIComponent(tf)}`;
		}

		function connect() {
			if (ws) {
				try { ws.close(); } catch (e) {}
				ws = null;
			}
			// Clean up existing tooltip before creating new chart
			if (tooltip) {
				tooltip.remove();
				tooltip = null;
			}
			makeChart();
			ws = new WebSocket(wsUrl(currentMarket, currentTf));
			ws.onopen = () => {};
			ws.onmessage = (evt) => {
				try {
					const msg = JSON.parse(evt.data);
					if (msg.type === 'snapshot' && Array.isArray(msg.candles)) {
						candleData = msg.candles;
						series.setData(candleData);
						// Update RSI if enabled
						if (rsiEnabled && rsiSeries) {
							const rsiData = calculateRSI(candleData);
							if (rsiData.length > 0) {
								rsiSeries.setData(rsiData);
								
								// Update background areas
								if (rsiSeries.overboughtArea && rsiSeries.oversoldArea) {
									const overboughtData = [];
									const oversoldData = [];
									
									rsiData.forEach(point => {
										if (point.value > 70) {
											overboughtData.push({ time: point.time, value: 70 });
										}
										if (point.value < 30) {
											oversoldData.push({ time: point.time, value: 30 });
										}
									});
									
									rsiSeries.overboughtArea.setData(overboughtData);
									rsiSeries.oversoldArea.setData(oversoldData);
								}
							}
						}
					}
					if (msg.type === 'update' && msg.candle) {
						series.update(msg.candle);
						// Update candle data array
						const existingIndex = candleData.findIndex(c => c.time === msg.candle.time);
						if (existingIndex >= 0) {
							candleData[existingIndex] = msg.candle;
						} else {
							candleData.push(msg.candle);
						}
						// Update RSI if enabled
						if (rsiEnabled && rsiSeries) {
							const rsiData = calculateRSI(candleData);
							if (rsiData.length > 0) {
								rsiSeries.setData(rsiData);
								
								// Update background areas
								if (rsiSeries.overboughtArea && rsiSeries.oversoldArea) {
									const overboughtData = [];
									const oversoldData = [];
									
									rsiData.forEach(point => {
										if (point.value > 70) {
											overboughtData.push({ time: point.time, value: 70 });
										}
										if (point.value < 30) {
											oversoldData.push({ time: point.time, value: 30 });
										}
									});
									
									rsiSeries.overboughtArea.setData(overboughtData);
									rsiSeries.oversoldArea.setData(oversoldData);
								}
							}
						}
					}
					if (msg.type === 'error') {
						console.error('Server error:', msg.message);
					}
				} catch (e) {
					console.error('Bad message', e);
				}
			};
			ws.onclose = () => {};
			ws.onerror = () => {};
		}

		// Event listeners
		marketSelect.addEventListener('change', () => {
			currentMarket = marketSelect.value;
			connect();
		});

		tfButtons.forEach((btn) => {
			btn.addEventListener('click', () => {
				if (btn.classList.contains('active')) return;
				tfButtons.forEach((b) => b.classList.remove('active'));
				btn.classList.add('active');
				currentTf = btn.dataset.tf;
				connect();
			});
		});

		// Add RSI toggle event listener
		if (rsiToggle) {
			rsiToggle.addEventListener('click', toggleRSI);
			console.log('RSI toggle event listener added');
		} else {
			console.error('RSI toggle button not found');
		}

		window.addEventListener('resize', () => {
			if (chart) chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
			if (rsiChart && rsiContainer) rsiChart.applyOptions({ width: rsiContainer.clientWidth, height: rsiContainer.clientHeight });
		});

		// Initialize
		connect();
	});
})();
