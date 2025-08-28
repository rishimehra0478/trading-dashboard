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

		// MACD variables
		let macdChart = null;
		let macdSeries = null;
		let macdSignalSeries = null;
		let macdHistogramSeries = null;
		let macdEnabled = false;
		let lastMacdCross = null;

		// ADX variables
		let adxChart = null;
		let adxSeries = null;
		let adxEnabled = false;
		let lastAdxCross = null;

		// EMA Cross variables
		let ema9Series = null;
		let ema21Series = null;
		let emaCrossEnabled = false;
		let lastEmaCross = null;

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

		// MACD calculation function
		function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
			if (data.length < slowPeriod) return { macd: [], signal: [], histogram: [], crosses: [] };
			
			// Calculate EMAs
			const fastEMA = calculateEMA(data, fastPeriod);
			const slowEMA = calculateEMA(data, slowPeriod);
			
			if (fastEMA.length === 0 || slowEMA.length === 0) return { macd: [], signal: [], histogram: [], crosses: [] };
			
			// Calculate MACD line
			const macdLine = [];
			const startIndex = Math.max(fastEMA.length - slowEMA.length, 0);
			
			for (let i = startIndex; i < fastEMA.length; i++) {
				const macdValue = fastEMA[i].value - slowEMA[i - startIndex].value;
				macdLine.push({
					time: fastEMA[i].time,
					value: macdValue
				});
			}
			
			// Calculate Signal line (EMA of MACD)
			const signalLine = calculateEMA(macdLine, signalPeriod);
			
			// Calculate Histogram and detect crosses
			const histogram = [];
			const crosses = [];
			let lastHistogram = null;
			
			for (let i = 0; i < Math.min(macdLine.length, signalLine.length); i++) {
				const macdVal = macdLine[macdLine.length - signalLine.length + i].value;
				const signalVal = signalLine[i].value;
				const histValue = macdVal - signalVal;
				
				histogram.push({
					time: signalLine[i].time,
					value: histValue
				});
				
				// Detect histogram crosses (zero line)
				if (lastHistogram !== null) {
					if (lastHistogram <= 0 && histValue > 0) {
						crosses.push({ time: signalLine[i].time, direction: 'up' });
					} else if (lastHistogram >= 0 && histValue < 0) {
						crosses.push({ time: signalLine[i].time, direction: 'down' });
					}
				}
				lastHistogram = histValue;
			}
			
			return { 
				macd: macdLine.slice(-signalLine.length), 
				signal: signalLine, 
				histogram: histogram,
				crosses: crosses
			};
		}

		// EMA calculation function
		function calculateEMA(data, period) {
			if (data.length < period) return [];
			
			const emaData = [];
			const multiplier = 2 / (period + 1);
			
			// First EMA is SMA
			let sum = 0;
			for (let i = 0; i < period; i++) {
				sum += data[i].close || data[i].value;
			}
			let ema = sum / period;
			
			emaData.push({
				time: data[period - 1].time,
				value: ema
			});
			
			// Calculate subsequent EMAs
			for (let i = period; i < data.length; i++) {
				const price = data[i].close || data[i].value;
				ema = (price * multiplier) + (ema * (1 - multiplier));
				emaData.push({
					time: data[i].time,
					value: ema
				});
			}
			
			return emaData;
		}

		// ADX calculation function
		function calculateADX(data, period = 14) {
			if (data.length < period + 1) return { adx: [], crosses: [] };
			
			const trueRanges = [];
			const plusDMs = [];
			const minusDMs = [];
			
			// Calculate True Range, +DM, -DM
			for (let i = 1; i < data.length; i++) {
				const high = data[i].high;
				const low = data[i].low;
				const prevClose = data[i - 1].close;
				const prevHigh = data[i - 1].high;
				const prevLow = data[i - 1].low;
				
				// True Range
				const tr = Math.max(
					high - low,
					Math.abs(high - prevClose),
					Math.abs(low - prevClose)
				);
				trueRanges.push(tr);
				
				// +DM and -DM
				const upMove = high - prevHigh;
				const downMove = prevLow - low;
				
				let plusDM = 0;
				let minusDM = 0;
				
				if (upMove > downMove && upMove > 0) {
					plusDM = upMove;
				}
				if (downMove > upMove && downMove > 0) {
					minusDM = downMove;
				}
				
				plusDMs.push(plusDM);
				minusDMs.push(minusDM);
			}
			
			// Calculate smoothed TR, +DM, -DM using Wilder's smoothing
			if (trueRanges.length < period) return { adx: [], crosses: [] };
			
			let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
			let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
			let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
			
			const diPlus = [];
			const diMinus = [];
			
			// Calculate DI+ and DI-
			for (let i = period; i < trueRanges.length; i++) {
				smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
				smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
				smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];
				
				const diPlusValue = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
				const diMinusValue = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
				
				diPlus.push(diPlusValue);
				diMinus.push(diMinusValue);
			}
			
			// Calculate DX and ADX
			const dx = [];
			for (let i = 0; i < diPlus.length; i++) {
				const sum = diPlus[i] + diMinus[i];
				const dxValue = sum > 0 ? Math.abs(diPlus[i] - diMinus[i]) / sum * 100 : 0;
				dx.push(dxValue);
			}
			
			if (dx.length < period) return { adx: [], crosses: [] };
			
			// Calculate ADX (smoothed DX)
			let adxValue = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
			const adxData = [];
			const crosses = [];
			
			adxData.push({
				time: data[period * 2].time,
				value: adxValue
			});
			
			let lastAdx = adxValue;
			
			for (let i = period; i < dx.length; i++) {
				adxValue = (adxValue * (period - 1) + dx[i]) / period;
				adxData.push({
					time: data[period + i + 1].time,
					value: adxValue
				});
				
				// Detect ADX crosses above/below 25
				if (lastAdx <= 25 && adxValue > 25) {
					crosses.push({ time: data[period + i + 1].time, direction: 'up' });
				} else if (lastAdx >= 25 && adxValue < 25) {
					crosses.push({ time: data[period + i + 1].time, direction: 'down' });
				}
				
				lastAdx = adxValue;
			}
			
			return { adx: adxData, crosses: crosses };
		}

		// EMA Cross calculation function
		function calculateEMACross(data) {
			const ema9 = calculateEMA(data, 9);
			const ema21 = calculateEMA(data, 21);
			const crosses = [];
			
			if (ema9.length === 0 || ema21.length === 0) return { ema9: [], ema21: [], crosses: [] };
			
			// Align arrays
			const minLength = Math.min(ema9.length, ema21.length);
			const alignedEma9 = ema9.slice(-minLength);
			const alignedEma21 = ema21.slice(-minLength);
			
			// Detect crosses
			for (let i = 1; i < minLength; i++) {
				const prev9 = alignedEma9[i - 1].value;
				const prev21 = alignedEma21[i - 1].value;
				const curr9 = alignedEma9[i].value;
				const curr21 = alignedEma21[i].value;
				
				// Bullish cross: 9 EMA crosses above 21 EMA
				if (prev9 <= prev21 && curr9 > curr21) {
					crosses.push({ time: alignedEma9[i].time, direction: 'up', type: 'bullish' });
				}
				// Bearish cross: 9 EMA crosses below 21 EMA
				else if (prev9 >= prev21 && curr9 < curr21) {
					crosses.push({ time: alignedEma9[i].time, direction: 'down', type: 'bearish' });
				}
			}
			
			return { ema9: alignedEma9, ema21: alignedEma21, crosses: crosses };
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

		// Toggle MACD indicator
		function toggleMACD() {
			const macdToggle = document.getElementById('macd-toggle');
			if (macdEnabled) {
				disableMACD();
			} else {
				enableMACD();
			}
		}

		function enableMACD() {
			if (!chart || !candleData.length) return;
			
			try {
				macdEnabled = true;
				const macdToggle = document.getElementById('macd-toggle');
				if (macdToggle) macdToggle.classList.add('active');
				
				const macdContainer = document.getElementById('macd-chart');
				if (macdContainer) macdContainer.style.display = 'block';
				
				if (!macdChart) {
					macdChart = LightweightCharts.createChart(macdContainer, {
						layout: { background: { type: 'solid', color: '#0f1115' }, textColor: '#c7d0dc' },
						grid: { vertLines: { color: '#1b1f2a' }, horzLines: { color: '#1b1f2a' } },
						rightPriceScale: { borderVisible: false },
						timeScale: { borderVisible: false, visible: false },
						height: 120,
					});
					
					macdSeries = macdChart.addLineSeries({ color: '#2196F3', lineWidth: 2 });
					macdSignalSeries = macdChart.addLineSeries({ color: '#FF9800', lineWidth: 2 });
					macdHistogramSeries = macdChart.addHistogramSeries({
						color: '#4CAF50',
						priceFormat: { type: 'volume' },
					});
					
					// Add zero line
					macdChart.addLineSeries({
						color: '#555',
						lineWidth: 1,
						priceLineVisible: false,
						lastValueVisible: false,
					}).setData([{ time: candleData[0].time, value: 0 }, { time: candleData[candleData.length - 1].time, value: 0 }]);
				}
				
				updateMACDData();
			} catch (error) {
				console.error('Error enabling MACD:', error);
			}
		}

		function disableMACD() {
			try {
				macdEnabled = false;
				const macdToggle = document.getElementById('macd-toggle');
				if (macdToggle) macdToggle.classList.remove('active');
				
				const macdContainer = document.getElementById('macd-chart');
				if (macdContainer) macdContainer.style.display = 'none';
				
				if (macdChart) {
					macdChart.remove();
					macdChart = null;
					macdSeries = null;
					macdSignalSeries = null;
					macdHistogramSeries = null;
				}
			} catch (error) {
				console.error('Error disabling MACD:', error);
			}
		}

		function updateMACDData() {
			if (!macdEnabled || !macdSeries || !candleData.length) return;
			
			const macdData = calculateMACD(candleData);
			if (macdData.macd.length > 0) {
				macdSeries.setData(macdData.macd);
				macdSignalSeries.setData(macdData.signal);
				
				// Color histogram based on value
				const coloredHistogram = macdData.histogram.map(point => ({
					time: point.time,
					value: point.value,
					color: point.value >= 0 ? '#4CAF50' : '#F44336'
				}));
				macdHistogramSeries.setData(coloredHistogram);
				
				// Store latest cross for alerts
				if (macdData.crosses.length > 0) {
					lastMacdCross = macdData.crosses[macdData.crosses.length - 1];
				}
			}
		}

		// Toggle ADX indicator
		function toggleADX() {
			const adxToggle = document.getElementById('adx-toggle');
			if (adxEnabled) {
				disableADX();
			} else {
				enableADX();
			}
		}

		function enableADX() {
			if (!chart || !candleData.length) return;
			
			try {
				adxEnabled = true;
				const adxToggle = document.getElementById('adx-toggle');
				if (adxToggle) adxToggle.classList.add('active');
				
				const adxContainer = document.getElementById('adx-chart');
				if (adxContainer) adxContainer.style.display = 'block';
				
				if (!adxChart) {
					adxChart = LightweightCharts.createChart(adxContainer, {
						layout: { background: { type: 'solid', color: '#0f1115' }, textColor: '#c7d0dc' },
						grid: { vertLines: { color: '#1b1f2a' }, horzLines: { color: '#1b1f2a' } },
						rightPriceScale: { borderVisible: false },
						timeScale: { borderVisible: false, visible: false },
						height: 120,
					});
					
					adxSeries = adxChart.addLineSeries({ color: '#E91E63', lineWidth: 2 });
					
					// Add 25 level line
					adxChart.addLineSeries({
						color: '#FFC107',
						lineWidth: 1,
						priceLineVisible: false,
						lastValueVisible: false,
					}).setData([{ time: candleData[0].time, value: 25 }, { time: candleData[candleData.length - 1].time, value: 25 }]);
				}
				
				updateADXData();
			} catch (error) {
				console.error('Error enabling ADX:', error);
			}
		}

		function disableADX() {
			try {
				adxEnabled = false;
				const adxToggle = document.getElementById('adx-toggle');
				if (adxToggle) adxToggle.classList.remove('active');
				
				const adxContainer = document.getElementById('adx-chart');
				if (adxContainer) adxContainer.style.display = 'none';
				
				if (adxChart) {
					adxChart.remove();
					adxChart = null;
					adxSeries = null;
				}
			} catch (error) {
				console.error('Error disabling ADX:', error);
			}
		}

		function updateADXData() {
			if (!adxEnabled || !adxSeries || !candleData.length) return;
			
			const adxData = calculateADX(candleData);
			if (adxData.adx.length > 0) {
				adxSeries.setData(adxData.adx);
				
				// Store latest cross for alerts
				if (adxData.crosses.length > 0) {
					lastAdxCross = adxData.crosses[adxData.crosses.length - 1];
				}
			}
		}

		// Toggle EMA Cross indicator
		function toggleEMACross() {
			const emaCrossToggle = document.getElementById('ema-cross-toggle');
			if (emaCrossEnabled) {
				disableEMACross();
			} else {
				enableEMACross();
			}
		}

		function enableEMACross() {
			if (!chart || !candleData.length) return;
			
			try {
				emaCrossEnabled = true;
				const emaCrossToggle = document.getElementById('ema-cross-toggle');
				if (emaCrossToggle) emaCrossToggle.classList.add('active');
				
				if (!ema9Series) {
					ema9Series = chart.addLineSeries({
						color: '#FF5722',
						lineWidth: 2,
						title: 'EMA 9'
					});
				}
				
				if (!ema21Series) {
					ema21Series = chart.addLineSeries({
						color: '#3F51B5',
						lineWidth: 2,
						title: 'EMA 21'
					});
				}
				
				updateEMACrossData();
			} catch (error) {
				console.error('Error enabling EMA Cross:', error);
			}
		}

		function disableEMACross() {
			try {
				emaCrossEnabled = false;
				const emaCrossToggle = document.getElementById('ema-cross-toggle');
				if (emaCrossToggle) emaCrossToggle.classList.remove('active');
				
				if (ema9Series) {
					chart.removeSeries(ema9Series);
					ema9Series = null;
				}
				
				if (ema21Series) {
					chart.removeSeries(ema21Series);
					ema21Series = null;
				}
			} catch (error) {
				console.error('Error disabling EMA Cross:', error);
			}
		}

		function updateEMACrossData() {
			if (!emaCrossEnabled || !ema9Series || !ema21Series || !candleData.length) return;
			
			const emaCrossData = calculateEMACross(candleData);
			if (emaCrossData.ema9.length > 0 && emaCrossData.ema21.length > 0) {
				ema9Series.setData(emaCrossData.ema9);
				ema21Series.setData(emaCrossData.ema21);
				
				// Store latest cross for alerts
				if (emaCrossData.crosses.length > 0) {
					lastEmaCross = emaCrossData.crosses[emaCrossData.crosses.length - 1];
				}
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
			
			// Re-enable indicators if they were active
			if (rsiEnabled) {
				setTimeout(() => enableRSI(), 100);
			}
			if (macdEnabled) {
				setTimeout(() => enableMACD(), 100);
			}
			if (adxEnabled) {
				setTimeout(() => enableADX(), 100);
			}
			if (emaCrossEnabled) {
				setTimeout(() => enableEMACross(), 100);
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
						// Update MACD if enabled
						if (macdEnabled) {
							updateMACDData();
						}
						// Update ADX if enabled
						if (adxEnabled) {
							updateADXData();
						}
						// Update EMA Cross if enabled
						if (emaCrossEnabled) {
							updateEMACrossData();
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
						// Update MACD if enabled
						if (macdEnabled) {
							updateMACDData();
						}
						// Update ADX if enabled
						if (adxEnabled) {
							updateADXData();
						}
						// Update EMA Cross if enabled
						if (emaCrossEnabled) {
							updateEMACrossData();
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

		// Add indicator toggle event listeners
		if (rsiToggle) {
			rsiToggle.addEventListener('click', toggleRSI);
			console.log('RSI toggle event listener added');
		} else {
			console.error('RSI toggle button not found');
		}

		const macdToggle = document.getElementById('macd-toggle');
		if (macdToggle) {
			macdToggle.addEventListener('click', toggleMACD);
			console.log('MACD toggle event listener added');
		}

		const adxToggle = document.getElementById('adx-toggle');
		if (adxToggle) {
			adxToggle.addEventListener('click', toggleADX);
			console.log('ADX toggle event listener added');
		}

		const emaCrossToggle = document.getElementById('ema-cross-toggle');
		if (emaCrossToggle) {
			emaCrossToggle.addEventListener('click', toggleEMACross);
			console.log('EMA Cross toggle event listener added');
		}

		window.addEventListener('resize', () => {
			if (chart) chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
			if (rsiChart && rsiContainer) rsiChart.applyOptions({ width: rsiContainer.clientWidth, height: rsiContainer.clientHeight });
			if (macdChart) {
				const macdContainer = document.getElementById('macd-chart');
				if (macdContainer) macdChart.applyOptions({ width: macdContainer.clientWidth, height: macdContainer.clientHeight });
			}
			if (adxChart) {
				const adxContainer = document.getElementById('adx-chart');
				if (adxContainer) adxChart.applyOptions({ width: adxContainer.clientWidth, height: adxContainer.clientHeight });
			}
		});

		// Initialize
		connect();
	});
})();
