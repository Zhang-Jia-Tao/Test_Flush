// 数据加载与校验：逐条校验、坏行剔除、错误收集
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidISODate(s) {
  if (typeof s !== 'string' || !ISO_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isParseableTimestamp(s) {
  return typeof s === 'string' && !Number.isNaN(new Date(s).getTime());
}

const VALID_TIERS = new Set(['A', 'B', 'C']);
const VALID_TYPES = new Set(['announcement', 'news', 'industry']);

/**
 * 校验 K 线数据，返回 {data, errors:[{index, field, reason}]}
 */
export function validateKline(bars, tradingDays) {
  const data = [];
  const errors = [];
  const daySet = new Set(tradingDays);

  (bars || []).forEach((bar, index) => {
    const fields = ['open', 'high', 'low', 'close', 'volume'];
    let bad = null;

    for (const f of fields) {
      if (bar[f] === undefined || bar[f] === null) {
        bad = { index, field: f, reason: `缺少字段 ${f}` };
        break;
      }
      if (f !== 'volume' && !Number.isFinite(Number(bar[f]))) {
        bad = { index, field: f, reason: `字段 ${f} 非数值` };
        break;
      }
    }
    if (!bad && !isValidISODate(bar.date)) {
      bad = { index, field: 'date', reason: `非法日期 ${JSON.stringify(bar.date)}` };
    }
    if (!bad && !daySet.has(bar.date)) {
      bad = { index, field: 'date', reason: `日期 ${bar.date} 不在交易日历中` };
    }
    if (!bad) {
      const o = Number(bar.open), h = Number(bar.high), l = Number(bar.low), c = Number(bar.close);
      if (!(l <= o && o <= h && l <= c && c <= h)) {
        bad = { index, field: 'ohlc', reason: `价格关系非法（要求 low ≤ open/close ≤ high）` };
      }
    }
    if (!bad && !(Number(bar.volume) >= 0)) {
      bad = { index, field: 'volume', reason: '成交量非法' };
    }

    if (bad) errors.push(bad);
    else data.push({ ...bar, open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume) });
  });

  return { data, errors };
}

/**
 * 校验事件流，返回 {data, errors:[{id, field, reason}]}
 */
export function validateEvents(events) {
  const data = [];
  const errors = [];

  (events || []).forEach((ev) => {
    const id = ev.id || `(未命名#${errors.length})`;
    let bad = null;

    if (!ev.id) bad = { id, field: 'id', reason: '缺少事件 id' };
    else if (!VALID_TYPES.has(ev.type)) bad = { id, field: 'type', reason: `事件类型非法：${ev.type}` };
    else if (!isParseableTimestamp(ev.occurredAt)) bad = { id, field: 'occurredAt', reason: `时间戳无法解析：${JSON.stringify(ev.occurredAt)}` };
    else if (!VALID_TIERS.has(ev.source?.tier)) bad = { id, field: 'source.tier', reason: `来源等级非法：${ev.source?.tier}` };
    else if (!Array.isArray(ev.evidence) || ev.evidence.length === 0) bad = { id, field: 'evidence', reason: '证据列表为空' };

    if (bad) errors.push(bad);
    else data.push(ev);
  });

  return { data, errors };
}

/**
 * 校验财务数据（结构同事件，宽松一些）
 */
export function validateFinancials(reports) {
  const data = [];
  const errors = [];
  (reports || []).forEach((r) => {
    const id = r.id || `(未命名#${errors.length})`;
    if (!isParseableTimestamp(r.occurredAt)) {
      errors.push({ id, field: 'occurredAt', reason: '时间戳无法解析' });
      return;
    }
    data.push({ ...r, type: 'financial' });
  });
  return { data, errors };
}

/**
 * JSON 解析封装：致命错误抛出带文件名的异常
 */
export function parseJSON(text, fileName) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error(`数据文件 ${fileName} 解析失败：${e.message}`);
    err.fatal = true;
    err.file = fileName;
    throw err;
  }
}
