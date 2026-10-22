// ECharts K 线 + 成交量 + 异动标记 + 事件散点
const UP_COLOR = '#e05252';
const DOWN_COLOR = '#2ea86b';
const UP_GRADIENT = ['#f07a72', '#d43f3f'];
const DOWN_GRADIENT = ['#4ec98f', '#1f8a58'];
const MA_COLORS = { ma5: '#f5c542', ma10: '#4c8dff', ma20: '#c77dff' };
const MA_NAMES = { ma5: 'MA5', ma10: 'MA10', ma20: 'MA20' };
const EVENT_COLORS = { announcement: '#4c8dff', financial: '#9aa7ff', industry: '#3bbfc9', news: '#e6913c' };

export function createChart(el) {
  const chart = echarts.init(el, null, { renderer: 'canvas' });

  let bars = [];
  let anomalies = [];
  let eventMarks = []; // {date, type, id}
  let selectedDate = null;

  window.addEventListener('resize', () => chart.resize());

  function dateIndexMap() {
    const m = new Map();
    bars.forEach((b, i) => m.set(b.date, i));
    return m;
  }

  // 计算简单移动平均线
  function computeMA(period) {
    const result = [];
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i].close;
      if (i >= period) sum -= bars[i - period].close;
      result.push(i >= period - 1 ? +(sum / period).toFixed(2) : null);
    }
    return result;
  }

  function fmtPct(v) {
    return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
  }

  function fmtVolume(v) {
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
    return String(v);
  }

  // 标题行 OHLC 读数条：跟随选中/悬停的交易日
  function updateReadout(i) {
    const box = document.getElementById('chart-ohlc');
    if (!box) return;
    if (i === undefined || i < 0 || !bars[i]) {
      box.innerHTML = '<span class="ohlc-readout__placeholder">--</span>';
      return;
    }
    const b = bars[i];
    const prev = i > 0 ? bars[i - 1].close : b.open;
    const chg = b.close / prev - 1;
    const cls = chg >= 0 ? 'up' : 'down';
    box.innerHTML = [
      `<span class="ohlc-readout__item"><span class="ohlc-readout__label">${b.date}</span></span>`,
      `<span class="ohlc-readout__item"><span class="ohlc-readout__label">开</span><span class="ohlc-readout__value">${b.open.toFixed(2)}</span></span>`,
      `<span class="ohlc-readout__item"><span class="ohlc-readout__label">高</span><span class="ohlc-readout__value">${b.high.toFixed(2)}</span></span>`,
      `<span class="ohlc-readout__item"><span class="ohlc-readout__label">低</span><span class="ohlc-readout__value">${b.low.toFixed(2)}</span></span>`,
      `<span class="ohlc-readout__item ohlc-readout__item--${cls}"><span class="ohlc-readout__label">收</span><span class="ohlc-readout__value ohlc-readout__chg">${b.close.toFixed(2)} ${fmtPct(chg)}</span></span>`,
    ].join('');
  }

  function buildOption() {
    const dates = bars.map(b => b.date);
    const kdata = bars.map(b => [b.open, b.close, b.low, b.high]);
    const mas = { ma5: computeMA(5), ma10: computeMA(10), ma20: computeMA(20) };

    // 涨跌颜色 + 渐变蜡烛
    const candleItems = bars.map((b, i) => {
      const prev = i > 0 ? bars[i - 1].close : b.open;
      const up = b.close >= prev;
      const [c1, c2] = up ? UP_GRADIENT : DOWN_GRADIENT;
      return {
        value: [b.open, b.close, b.low, b.high],
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: c1 }, { offset: 1, color: c2 },
          ]),
          borderColor: up ? UP_COLOR : DOWN_COLOR,
          borderWidth: 1,
        },
      };
    });

    // 量柱：涨跌配色 + 顶部亮、底部暗的渐变，异动日加亮
    const anomalySet = new Set(anomalies.map(a => a.date));
    const vols = bars.map((b, i) => {
      const prev = i > 0 ? bars[i - 1].close : b.close;
      const up = b.close >= prev;
      const [c1, c2] = up ? UP_GRADIENT : DOWN_GRADIENT;
      const isAnomaly = anomalySet.has(b.date);
      return {
        value: b.volume,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: c1 }, { offset: 1, color: c2 },
          ]),
          opacity: isAnomaly ? 0.95 : 0.6,
          borderRadius: [1, 1, 0, 0],
        },
      };
    });

    // 异动日 markPoint：带阴影的精修图钉
    const markPoints = anomalies.map(a => {
      const i = bars.findIndex(b => b.date === a.date);
      if (i < 0) return null;
      const isUp = a.direction === 'up';
      const color = isUp ? UP_COLOR : DOWN_COLOR;
      return {
        name: `anomaly-${a.date}`,
        coord: [i, isUp ? bars[i].low : bars[i].high],
        symbol: 'pin',
        symbolSize: 38,
        symbolOffset: [0, isUp ? 18 : -18],
        itemStyle: {
          color,
          shadowColor: color,
          shadowBlur: 10,
          shadowOffsetY: 2,
          borderColor: 'rgba(255,255,255,0.85)',
          borderWidth: 1.5,
        },
        label: {
          show: true,
          formatter: fmtPct(a.movePct),
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          position: isUp ? 'bottom' : 'top',
          textBorderColor: 'rgba(0,0,0,0.5)',
          textBorderWidth: 2,
        },
      };
    }).filter(Boolean);

    // 事件散点：外圈光晕 + 内芯
    const eventScatter = eventMarks.map(m => {
      const i = bars.findIndex(b => b.date === m.date);
      if (i < 0) return null;
      const color = EVENT_COLORS[m.type] || '#8a94ad';
      return {
        name: `event-${m.id}`,
        coord: [i, bars[i].high],
        symbol: 'circle',
        symbolSize: 10,
        itemStyle: {
          color,
          borderColor: 'rgba(255,255,255,0.9)',
          borderWidth: 1.5,
          shadowColor: color,
          shadowBlur: 6,
        },
      };
    }).filter(Boolean);

    // 选中日背景带：上亮下淡的垂直渐变
    const markAreas = [];
    if (selectedDate) {
      const i = bars.findIndex(b => b.date === selectedDate);
      if (i >= 0) {
        markAreas.push([
          {
            xAxis: i - 0.5,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(76, 141, 255, 0.20)' },
                { offset: 1, color: 'rgba(76, 141, 255, 0.04)' },
              ]),
            },
          },
          { xAxis: i + 0.5 },
        ]);
      }
    }

    // 选中日竖向高亮线
    const markLines = [];
    if (selectedDate) {
      const i = bars.findIndex(b => b.date === selectedDate);
      if (i >= 0) {
        markLines.push({
          xAxis: i,
          lineStyle: { color: 'rgba(76, 141, 255, 0.55)', type: 'dashed', width: 1.2 },
          label: { show: false },
          symbol: 'none',
        });
      }
    }

    const maSeries = Object.keys(mas).map(key => ({
      name: MA_NAMES[key],
      type: 'line',
      data: mas[key],
      xAxisIndex: 0,
      yAxisIndex: 0,
      symbol: 'none',
      smooth: true,
      lineStyle: { width: 1.2, color: MA_COLORS[key], opacity: 0.9 },
      emphasis: { lineStyle: { width: 2 } },
      z: 5,
    }));

    return {
      animation: false,
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        lineStyle: { color: 'rgba(138, 148, 173, 0.5)', type: 'dashed' },
        crossStyle: { color: 'rgba(138, 148, 173, 0.5)' },
        label: {
          backgroundColor: '#24325a',
          color: '#d8e0f0',
          fontSize: 11,
          padding: [3, 6],
        },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(22, 29, 46, 0.96)',
        borderColor: '#2c3a5e',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: '#d8e0f0', fontSize: 12 },
        extraCssText: 'box-shadow: 0 6px 20px rgba(0,0,0,0.5); border-radius: 8px; backdrop-filter: blur(4px);',
        formatter: (params) => {
          const i = params[0]?.dataIndex;
          if (i === undefined || !bars[i]) return '';
          const b = bars[i];
          const prev = i > 0 ? bars[i - 1].close : b.open;
          const chg = b.close / prev - 1;
          const up = b.close >= prev;
          const chgColor = up ? UP_COLOR : DOWN_COLOR;
          const dayEvents = eventMarks.filter(m => m.date === b.date);
          const isAnomaly = anomalySet.has(b.date);
          const rows = [
            `<div style="font-weight:600;margin-bottom:4px;">${b.date}${isAnomaly ? ' <span style="color:#c9a227;font-size:11px;">⚡ 异动</span>' : ''}</div>`,
            `<div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;">`,
            `<span style="color:#8a94ad;">开</span><span>${b.open.toFixed(2)}</span>`,
            `<span style="color:#8a94ad;">高</span><span>${b.high.toFixed(2)}</span>`,
            `<span style="color:#8a94ad;">低</span><span>${b.low.toFixed(2)}</span>`,
            `<span style="color:#8a94ad;">收</span><span style="color:${chgColor};font-weight:600;">${b.close.toFixed(2)} <small>${fmtPct(chg)}</small></span>`,
            `</div>`,
            `<div style="margin-top:4px;color:#8a94ad;">成交量 <span style="color:${chgColor};">${fmtVolume(b.volume)}</span></div>`,
          ];
          if (dayEvents.length) {
            rows.push(`<div style="margin-top:4px;padding-top:4px;border-top:1px solid #2c3a5e;color:#8a94ad;">事件 ×${dayEvents.length}</div>`);
          }
          return rows.join('');
        },
      },
      legend: {
        top: 2,
        right: 16,
        itemWidth: 14,
        itemHeight: 8,
        icon: 'roundRect',
        textStyle: { color: '#8a94ad', fontSize: 11 },
        data: ['MA5', 'MA10', 'MA20'],
      },
      grid: [
        { left: 56, right: 20, top: 30, height: '56%' },
        { left: 56, right: 20, top: '74%', height: '16%' },
      ],
      xAxis: [
        {
          type: 'category', data: dates, gridIndex: 0, boundaryGap: true,
          axisLine: { lineStyle: { color: '#26304a' } },
          axisTick: { show: false },
          axisLabel: { color: '#8a94ad', fontSize: 11 },
          splitLine: { show: false },
        },
        {
          type: 'category', data: dates, gridIndex: 1,
          axisLabel: { show: false }, axisTick: { show: false },
          axisLine: { lineStyle: { color: '#26304a' } },
        },
      ],
      yAxis: [
        {
          scale: true, gridIndex: 0,
          splitLine: { lineStyle: { color: 'rgba(38, 48, 74, 0.6)', type: 'dashed' } },
          axisLabel: { color: '#8a94ad', fontSize: 11 },
        },
        {
          gridIndex: 1,
          splitLine: { show: false },
          axisLabel: { color: '#8a94ad', fontSize: 10, formatter: (v) => fmtVolume(v) },
          splitNumber: 2,
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
        {
          type: 'slider', xAxisIndex: [0, 1], top: '93%', height: 18,
          borderColor: 'transparent',
          backgroundColor: 'rgba(38, 48, 74, 0.35)',
          fillerColor: 'rgba(76, 141, 255, 0.18)',
          handleStyle: { color: '#4c8dff', borderColor: '#4c8dff' },
          moveHandleStyle: { color: '#3a5a9a' },
          dataBackground: {
            lineStyle: { color: '#3a5a9a' },
            areaStyle: { color: 'rgba(58, 90, 154, 0.25)' },
          },
          selectedDataBackground: {
            lineStyle: { color: '#4c8dff' },
            areaStyle: { color: 'rgba(76, 141, 255, 0.25)' },
          },
          textStyle: { color: '#8a94ad', fontSize: 10 },
        },
      ],
      series: [
        {
          name: '日K',
          type: 'candlestick',
          data: candleItems,
          xAxisIndex: 0,
          yAxisIndex: 0,
          markPoint: { data: markPoints, animation: false },
          markArea: { silent: true, data: markAreas },
          markLine: { silent: true, symbol: 'none', data: markLines, animation: false },
          z: 3,
        },
        ...maSeries,
        {
          name: '成交量',
          type: 'bar',
          data: vols,
          xAxisIndex: 1,
          yAxisIndex: 1,
          z: 3,
        },
        {
          name: '事件',
          type: 'scatter',
          data: eventScatter,
          xAxisIndex: 0,
          yAxisIndex: 0,
          z: 10,
          silent: false,
        },
      ],
    };
  }

  function render() {
    chart.setOption(buildOption(), { notMerge: true });
    // 读数条：优先选中日，否则最新交易日
    const i = selectedDate ? bars.findIndex(b => b.date === selectedDate) : bars.length - 1;
    updateReadout(i);
  }

  chart.on('click', (params) => {
    const i = params.dataIndex;
    if (i === undefined || !bars[i]) return;
    // 事件散点点击 → 交给 app 层处理（通过自定义事件区分）
    if (params.seriesName === '事件' && params.name?.startsWith('event-')) {
      el.dispatchEvent(new CustomEvent('eventclick', { detail: { eventId: params.name.slice(6) } }));
      return;
    }
    el.dispatchEvent(new CustomEvent('dateclick', { detail: { date: bars[i].date } }));
  });

  chart.on('mouseover', (params) => {
    if (params.seriesName === '日K' && params.dataIndex !== undefined) updateReadout(params.dataIndex);
  });

  return {
    setData(newBars, newAnomalies, newEventMarks) {
      bars = newBars;
      anomalies = newAnomalies;
      eventMarks = newEventMarks;
      selectedDate = null;
      render();
    },
    selectDate(date) {
      selectedDate = date;
      render();
    },
    focusDate(date) {
      const i = bars.findIndex(b => b.date === date);
      if (i < 0) return;
      const start = Math.max(0, Math.min(i - 10, bars.length - 20));
      chart.dispatchAction({ type: 'dataZoom', startValue: Math.max(0, start), endValue: Math.min(bars.length - 1, start + 25) });
    },
    resize() { chart.resize(); },
  };
}
