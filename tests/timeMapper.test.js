// T1/T2/T4/T5: timeMapper 测试 —— 盘后、非交易日、边界、时区跨日
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/core/calendar.js';
import { mapEventToTradeDate } from '../src/core/timeMapper.js';

// 2026-09-01 ~ 2026-10-30 交易日历（与 data/calendar.json 一致的精简版）
// 9月：工作日全开；10-01~10-07 国庆假期；周末休市
function buildTestCalendar() {
  const days = [];
  for (let d = new Date('2026-09-01T00:00:00Z'); d <= new Date('2026-10-30T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !(iso >= '2026-10-01' && iso <= '2026-10-07')) days.push(iso);
  }
  return createCalendar({ timezone: 'Asia/Shanghai', tradingDays: days, holidays: [] });
}

const cal = buildTestCalendar();
const TZ = 'Asia/Shanghai';

test('T1 盘后事件：交易日 18:32 公告 → 下一交易日', () => {
  // 2026-10-09 是周五；下一交易日为 10-12 周一（10-10/10-11 周末）
  const r = mapEventToTradeDate('2026-10-09T18:32:00+08:00', 'Asia/Shanghai', cal, TZ);
  assert.equal(r.mappedTradeDate, '2026-10-12');
  assert.equal(r.phase, 'after-hours');
  assert.equal(r.inRange, true);
});

test('T2a 非交易日周末：周六 10:00 → 下周一', () => {
  const r = mapEventToTradeDate('2026-10-17T10:00:00+08:00', 'Asia/Shanghai', cal, TZ);
  assert.equal(r.mappedTradeDate, '2026-10-19');
  assert.equal(r.phase, 'non-trading-day');
});

test('T2b 非交易日假期：国庆假期内 → 节后首个交易日', () => {
  const r = mapEventToTradeDate('2026-10-03T10:00:00+08:00', 'Asia/Shanghai', cal, TZ);
  assert.equal(r.mappedTradeDate, '2026-10-08');
  assert.equal(r.phase, 'non-trading-day');
});

test('T4 边界：盘前/盘中/午休归当日；15:00:00 当日；15:00:01 起归次日', () => {
  const cases = [
    ['2026-10-13T08:30:00+08:00', '2026-10-13', 'pre-market'],
    ['2026-10-13T09:15:00+08:00', '2026-10-13', 'trading-hours'],
    ['2026-10-13T12:00:00+08:00', '2026-10-13', 'trading-hours'],
    ['2026-10-13T14:59:59+08:00', '2026-10-13', 'trading-hours'],
    ['2026-10-13T15:00:00+08:00', '2026-10-13', 'after-hours' /* 15:00 整归当日，但 phase 标盘后 */],
    ['2026-10-13T15:00:01+08:00', '2026-10-14', 'after-hours'],
    ['2026-10-13T15:05:00+08:00', '2026-10-14', 'after-hours'],
  ];
  for (const [iso, expectDate, expectPhase] of cases) {
    const r = mapEventToTradeDate(iso, 'Asia/Shanghai', cal, TZ);
    assert.equal(r.mappedTradeDate, expectDate, `mappedTradeDate for ${iso}`);
    assert.equal(r.phase, expectPhase, `phase for ${iso}`);
  }
});

test('T5 时区转换：UTC 事件转北京跨日', () => {
  // 2026-10-09T16:30:00Z → 北京 10-10 00:30（周六）→ 下一交易日 10-12
  const r1 = mapEventToTradeDate('2026-10-09T16:30:00Z', 'UTC', cal, TZ);
  assert.equal(r1.mappedTradeDate, '2026-10-12');
  assert.equal(r1.phase, 'non-trading-day');

  // 2026-10-09T01:30:00Z → 北京 09:30 周五 → 当日
  const r2 = mapEventToTradeDate('2026-10-09T01:30:00Z', 'UTC', cal, TZ);
  assert.equal(r2.mappedTradeDate, '2026-10-09');
  assert.equal(r2.phase, 'trading-hours');
});

test('范围外：日历最后一个交易日之后的盘后事件 → inRange=false', () => {
  // 2026-10-30 是日历最后交易日（周五），盘后 → 下一交易日不存在
  const r = mapEventToTradeDate('2026-10-30T19:00:00+08:00', 'Asia/Shanghai', cal, TZ);
  assert.equal(r.mappedTradeDate, null);
  assert.equal(r.inRange, false);
});
