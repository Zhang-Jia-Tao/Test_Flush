// 应用装配：数据加载 → 校验 → 规则计算 → 四向联动（事件总线）
import { createCalendar } from './core/calendar.js';
import { mapEventToTradeDate } from './core/timeMapper.js';
import { detectAnomalies } from './core/anomaly.js';
import { analyze } from './core/agent.js';
import { validateKline, validateEvents, validateFinancials, parseJSON } from './core/schema.js';
import { createChart } from './ui/chart.js';
import { createTimeline } from './ui/timeline.js';
import { createDetail } from './ui/detail.js';
import { createAssistant } from './ui/assistant.js';
import { showLoading, showEmpty, showError, hideState, showBanner, hideBanner } from './ui/states.js';

// ---------- 极简事件总线 ----------
function createBus() {
  const handlers = new Map();
  return {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    emit(evt, payload) {
      (handlers.get(evt) || []).forEach(fn => fn(payload));
    },
  };
}
const bus = createBus();

// ---------- URL 参数 ----------
const params = new URLSearchParams(location.search);
const demoMode = params.get('demo'); // empty | broken | loading | outofrange | null
const initialDate = params.get('date');

// ---------- DOM ----------
const chartEl = document.getElementById('chart');
const chartState = document.getElementById('chart-state');
const timelineEl = document.getElementById('timeline');
const timelineState = document.getElementById('timeline-state');
const detailEl = document.getElementById('detail');
const detailState = document.getElementById('detail-state');

const chart = createChart(chartEl);
const timeline = createTimeline(timelineEl, bus);
const detail = createDetail(detailEl);
const assistant = createAssistant(
  document.getElementById('fab'),
  document.getElementById('assistant'),
  bus
);

// ---------- 应用状态 ----------
const state = {
  stock: null,
  cal: null,
  bars: [],
  anomalies: [],
  events: [],        // 已映射事件
  outOfRangeEvents: [],
  financials: [],
  eventById: new Map(),
  selectedDate: null,
};

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 加载失败（HTTP ${res.status}）`);
  return res.text();
}

// ---------- 数据加载与装配 ----------
async function loadData() {
  const delay = demoMode === 'loading' ? 100000 : 800;
  const timer = new Promise(r => setTimeout(r, delay));

  showLoading(chartState);
  showLoading(timelineState);
  showLoading(detailState, '等待选择事件…');

  const [stockText, calText, klineText, eventsText, finText] = await Promise.all([
    fetchJSON('data/stock.json'),
    fetchJSON('data/calendar.json'),
    fetchJSON(demoMode === 'broken' ? 'data/broken/kline.json' : 'data/kline.json'),
    fetchJSON(demoMode === 'broken' ? 'data/broken/events.json' : 'data/events.json'),
    fetchJSON('data/financials.json'),
  ]);
  await timer;

  state.stock = parseJSON(stockText, 'stock.json');
  state.cal = createCalendar(parseJSON(calText, 'calendar.json'));

  // K 线
  const klineRaw = parseJSON(klineText, 'kline.json');
  const k = validateKline(klineRaw.bars || [], state.cal.tradingDays);
  state.bars = k.data;
  if (k.errors.length > 0) {
    showBanner(`行情数据存在异常：已跳过 ${k.errors.length} 条异常记录（${
      k.errors.map(e => `第 ${e.index + 1} 行 ${e.reason}`).join('；')}）`);
  }
  if (state.bars.length === 0) {
    showEmpty(chartState, '暂无 K 线数据');
    showEmpty(timelineState, '暂无事件数据');
    return;
  }
  hideState(chartState);

  // 异动判定
  state.anomalies = detectAnomalies(state.bars, state.stock.anomalyRules);

  // 事件映射
  const eventsRaw = parseJSON(eventsText, 'events.json');
  const ev = validateEvents(eventsRaw.events || []);
  const finRaw = parseJSON(finText, 'financials.json');
  const fin = validateFinancials(finRaw.reports || []);

  const tz = state.stock.exchangeTimezone;
  const allRaw = [...ev.data, ...fin.data];
  state.events = [];
  state.outOfRangeEvents = [];
  for (const e of allRaw) {
    const m = mapEventToTradeDate(e.occurredAt, e.occurredAtTz, state.cal, tz);
    const mapped = {
      ...e,
      occurredAtRaw: e.occurredAt,
      occurredAtExchange: formatExchangeTime(e.occurredAt, tz),
      mappedTradeDate: m.mappedTradeDate,
      mappingReason: m.reason,
      inRange: m.inRange,
    };
    state.eventById.set(e.id, mapped);
    if (m.inRange && m.mappedTradeDate) state.events.push(mapped);
    else state.outOfRangeEvents.push(mapped);
  }
  if (ev.errors.length > 0) {
    showBanner(`事件数据存在异常：已跳过 ${ev.errors.length} 条异常记录（${
      ev.errors.map(e => `${e.id} ${e.reason}`).join('；')}）`, { warn: true });
  }

  renderAll();
}

function formatExchangeTime(iso, tz) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

// ---------- 渲染 ----------
function barOn(date) {
  return state.bars.find(b => b.date === date) || null;
}

function anomalyOn(date) {
  return state.anomalies.find(a => a.date === date) || null;
}

function eventsOn(date) {
  return state.events.filter(e => e.mappedTradeDate === date);
}

function eventsInWindow(date) {
  // T-1 ~ T+1（按交易日偏移）
  const offsets = state.stock.anomalyRules.eventWindowDays;
  const result = [];
  for (const off of offsets) {
    const d = state.cal.tradeDateOffset(date, off);
    if (!d) continue;
    for (const e of eventsOn(d)) {
      result.push({ ...e, dayOffset: off, offsetLabel: off === 0 ? '当日' : off === -1 ? '前一交易日' : '后一交易日' });
    }
  }
  return result;
}

function buildGroups() {
  const groups = state.bars.map(b => {
    const a = anomalyOn(b.date);
    return {
      date: b.date,
      isAnomaly: !!a,
      direction: a?.direction,
      movePct: a?.movePct || 0,
      events: eventsOn(b.date).sort((x, y) => x.occurredAt.localeCompare(y.occurredAt)),
      outOfRange: false,
    };
  });
  if (state.outOfRangeEvents.length > 0) {
    groups.push({ date: null, isAnomaly: false, events: state.outOfRangeEvents, outOfRange: true });
  }
  return groups;
}

function renderAll() {
  // 顶部信息栏
  document.querySelector('.topbar__name').textContent = state.stock.name;
  document.querySelector('.topbar__code').textContent = state.stock.code;
  document.querySelector('.topbar__meta').textContent =
    `${state.stock.exchange} · ${state.stock.exchangeTimezone} · 数据区间 ${state.stock.dataRange.start} ~ ${state.stock.dataRange.end}`;

  // 顶栏最新价读数（最新交易日收盘）
  const lastBar = state.bars[state.bars.length - 1];
  const prevBar = state.bars.length > 1 ? state.bars[state.bars.length - 2] : null;
  if (lastBar) {
    const chg = prevBar ? lastBar.close / prevBar.close - 1 : 0;
    const priceEl = document.getElementById('topbar-price');
    if (priceEl) {
      const cls = chg >= 0 ? 'topbar__price--up' : 'topbar__price--down';
      priceEl.className = `topbar__price ${cls}`;
      priceEl.innerHTML = `<span class="topbar__price-last">${lastBar.close.toFixed(2)}</span>` +
        `<span class="topbar__price-chg">${chg >= 0 ? '+' : ''}${(chg * 100).toFixed(2)}%</span>`;
    }
  }

  // 事件标记（K 线上方散点）
  const eventMarks = state.events
    .filter(e => barOn(e.mappedTradeDate))
    .map(e => ({ date: e.mappedTradeDate, type: e.type, id: e.id }));

  chart.setData(state.bars, state.anomalies, eventMarks);

  timeline.setGroups(buildGroups());

  assistant.guide();
  detail.render(null);
  hideState(detailState);
  hideState(timelineState);
}

// ---------- 联动逻辑 ----------
function selectDate(date, { fromChart = false } = {}) {
  state.selectedDate = date;
  const a = anomalyOn(date);
  const bar = barOn(date);

  chart.selectDate(date);
  if (!fromChart) chart.focusDate(date);
  timeline.selectDate(date);

  // 详情默认展示该日最相关事件（映射到当日、时间最早的一条）
  const dayEvents = eventsOn(date);
  if (dayEvents.length > 0) {
    detail.render(dayEvents[0]);
  } else {
    detail.render(null);
    detailEl.innerHTML = `<div class="detail__placeholder">${date} 无映射事件</div>`;
  }

  // 助手
  const result = analyze(date, { anomalyOn, eventsInWindow });
  assistant.showResult(result, bar ? { date, movePct: (bar.close / (state.bars[state.bars.indexOf(bar) - 1]?.close || bar.close)) - 1, volumeRatio: a?.volumeRatio } : null);
  assistant.open();
}

function selectEvent(eventId) {
  const ev = state.eventById.get(eventId);
  if (!ev) return;
  detail.render(ev);
  timeline.selectEvent(eventId);
  if (ev.mappedTradeDate && barOn(ev.mappedTradeDate)) {
    chart.selectDate(ev.mappedTradeDate);
    chart.focusDate(ev.mappedTradeDate);
    timeline.selectDate(ev.mappedTradeDate);
    state.selectedDate = ev.mappedTradeDate;
  }
}

function locateEvent(eventId) {
  timeline.selectEvent(eventId, { flash: true });
  const ev = state.eventById.get(eventId);
  if (ev) detail.render(ev);
}

// ---------- 事件订阅 ----------
bus.on('selectDate', ({ date }) => selectDate(date));
bus.on('selectEvent', ({ eventId }) => selectEvent(eventId));
bus.on('locateEvent', ({ eventId }) => locateEvent(eventId));
chartEl.addEventListener('dateclick', (e) => selectDate(e.detail.date, { fromChart: true }));
chartEl.addEventListener('eventclick', (e) => selectEvent(e.detail.eventId));

document.getElementById('btn-reset').addEventListener('click', () => {
  state.selectedDate = null;
  chart.setData(state.bars, state.anomalies,
    state.events.filter(e => barOn(e.mappedTradeDate)).map(e => ({ date: e.mappedTradeDate, type: e.type, id: e.id })));
  timeline.setGroups(buildGroups());
  detail.render(null);
  assistant.guide();
});

// ---------- 启动 ----------
loadData().catch(err => {
  if (err.fatal) {
    showError(chartState, `致命错误：${err.message}`, { retry: true });
    showError(timelineState, `致命错误：${err.message}`, { retry: true });
    showBanner(`数据加载失败：${err.message}`);
  } else {
    showError(chartState, `加载失败：${err.message}`, { retry: true });
  }
}).then(() => {
  // 初始选中日期（?date=YYYY-MM-DD）
  if (initialDate && state.bars.length > 0 && barOn(initialDate)) {
    selectDate(initialDate, { fromChart: true });
  }
});
