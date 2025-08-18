(function () {
	const chartContainer = document.getElementById('chart');
	const marketSelect = document.getElementById('market-select');
	const tfButtons = Array.from(document.querySelectorAll('.tf'));

	let chart, series, ws;
	let currentMarket = marketSelect.value;
	let currentTf = document.querySelector('.tf.active').dataset.tf;

	function makeChart() {
		if (chart) {
			chart.remove();
		}
		chart = LightweightCharts.createChart(chartContainer, {
			layout: { background: { type: 'solid', color: '#0f1115' }, textColor: '#c7d0dc' },
			grid: { vertLines: { color: '#1b1f2a' }, horzLines: { color: '#1b1f2a' } },
			rightPriceScale: { borderVisible: false },
			timeScale: { borderVisible: false, timeVisible: true, secondsVisible: currentTf === '1m' },
		});
		series = chart.addCandlestickSeries({
			upColor: '#26a69a',
			downColor: '#ef5350',
			wickUpColor: '#26a69a',
			wickDownColor: '#ef5350',
			borderUpColor: '#26a69a',
			borderDownColor: '#ef5350',
		});
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
		makeChart();
		ws = new WebSocket(wsUrl(currentMarket, currentTf));
		ws.onopen = () => {};
		ws.onmessage = (evt) => {
			try {
				const msg = JSON.parse(evt.data);
				if (msg.type === 'snapshot' && Array.isArray(msg.candles)) {
					series.setData(msg.candles);
				}
				if (msg.type === 'update' && msg.candle) {
					series.update(msg.candle);
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

	window.addEventListener('resize', () => {
		if (chart) chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
	});

	// Initialize
	connect();
})();
