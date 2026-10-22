// 时间映射规则：盘前/盘中 → 当日；盘后（≥15:00:01）→ 下一交易日；非交易日 → 下一交易日
import { getZonedParts } from '../utils/time.js';

const CUTOFF_SECONDS = 15 * 60 * 60; // 15:00:00（含）归当日

export function mapEventToTradeDate(occurredAt, occurredAtTz, cal, exchangeTz) {
  let parts;
  try {
    parts = getZonedParts(occurredAt, exchangeTz);
  } catch {
    return { mappedTradeDate: null, phase: 'invalid', reason: '时间戳无法解析', inRange: false };
  }
  const { date, secondsOfDay } = parts;

  // 1) 非交易日（周末/节假日/休市）→ 下一交易日，不论时刻
  if (!cal.isTradeDate(date)) {
    const next = cal.nextTradeDate(date);
    return {
      mappedTradeDate: next,
      phase: 'non-trading-day',
      reason: next ? '非交易日发生，顺延至下一交易日' : '超出交易日历范围',
      inRange: next !== null,
    };
  }

  // 2) 交易日 15:00:00 整归当日（phase 标盘后）；15:00:01 起归次日
  if (secondsOfDay < CUTOFF_SECONDS) {
    const phase = secondsOfDay < 9 * 3600 + 15 * 60 ? 'pre-market' : 'trading-hours';
    return {
      mappedTradeDate: date,
      phase,
      reason: phase === 'pre-market' ? '开盘前发生，计入当日' : '交易时段发生，计入当日',
      inRange: true,
    };
  }

  if (secondsOfDay === CUTOFF_SECONDS) {
    return {
      mappedTradeDate: date,
      phase: 'after-hours',
      reason: '收盘整点发生，计入当日',
      inRange: true,
    };
  }

  const next = cal.nextTradeDate(date);
  return {
    mappedTradeDate: next,
    phase: 'after-hours',
    reason: next ? '盘后发生，计入下一交易日' : '超出交易日历范围',
    inRange: next !== null,
  };
}
