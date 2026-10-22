// T7: schema 测试 —— 坏数据检出与跳过、范围外标记、空数据
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateKline, validateEvents } from '../src/core/schema.js';

const CAL_DAYS = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07'];

test('T7a K 线坏数据：缺 high / 非法日期 / close 非数字 → 各 1 条 error，坏行剔除', () => {
  const bars = [
    { date: '2026-09-01', open: 10, high: 10.5, low: 9.8, close: 10.2, volume: 100 }, // 正常
    { date: '2026-09-02', open: 10, low: 9.8, close: 10.1, volume: 100 },             // 缺 high
    { date: '2026-13-40', open: 10, high: 10.5, low: 9.8, close: 10.2, volume: 100 }, // 非法日期
    { date: '2026-09-03', open: 10, high: 10.5, low: 9.8, close: 'abc', volume: 100 }, // close 非数字
  ];
  const { data, errors } = validateKline(bars, CAL_DAYS);
  assert.equal(errors.length, 3, `应报 3 条错误，实际 ${errors.length}`);
  assert.equal(data.length, 1, '坏行应被剔除');
  assert.equal(data[0].date, '2026-09-01');
  for (const e of errors) {
    assert.ok(e.index !== undefined && e.reason, 'error 须含 index 与 reason');
  }
});

test('T7b 价格关系非法：low > high → 报错', () => {
  const bars = [{ date: '2026-09-01', open: 10, high: 10, low: 11, close: 10, volume: 100 }];
  const { errors } = validateKline(bars, CAL_DAYS);
  assert.ok(errors.length === 1 && errors[0].reason.includes('价格'));
});

test('T7c 事件坏数据：occurredAt 非法、tier 非法、evidence 为空 → 报错定位到 id', () => {
  const events = [
    { id: 'EV-OK-01', type: 'news', occurredAt: '2026-09-01T10:00:00+08:00', occurredAtTz: 'Asia/Shanghai',
      title: '正常', source: { name: 'x', tier: 'B' }, summary: '', evidence: [{ text: 'e', sourceTier: 'B' }], contentTags: ['fact'] },
    { id: 'EV-BAD-TIME', type: 'news', occurredAt: 'not-a-date', occurredAtTz: 'UTC',
      title: '坏时间', source: { name: 'x', tier: 'B' }, summary: '', evidence: [{ text: 'e', sourceTier: 'B' }], contentTags: ['fact'] },
    { id: 'EV-BAD-TIER', type: 'news', occurredAt: '2026-09-02T10:00:00+08:00', occurredAtTz: 'Asia/Shanghai',
      title: '坏等级', source: { name: 'x', tier: 'X' }, summary: '', evidence: [{ text: 'e', sourceTier: 'B' }], contentTags: ['fact'] },
    { id: 'EV-NO-EVID', type: 'news', occurredAt: '2026-09-03T10:00:00+08:00', occurredAtTz: 'Asia/Shanghai',
      title: '无证据', source: { name: 'x', tier: 'B' }, summary: '', evidence: [], contentTags: ['fact'] },
  ];
  const { data, errors } = validateEvents(events);
  assert.equal(data.length, 1);
  assert.equal(errors.length, 3);
  const ids = errors.map(e => e.id);
  assert.ok(ids.includes('EV-BAD-TIME'));
  assert.ok(ids.includes('EV-BAD-TIER'));
  assert.ok(ids.includes('EV-NO-EVID'));
});

test('T7d 空数据（[]）→ 不抛错，返回空数组', () => {
  const k = validateKline([], CAL_DAYS);
  assert.deepEqual(k.data, []);
  assert.deepEqual(k.errors, []);
  const e = validateEvents([]);
  assert.deepEqual(e.data, []);
  assert.deepEqual(e.errors, []);
});
