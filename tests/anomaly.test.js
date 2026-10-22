// T6: anomaly 测试 —— 阈值边界、量比、手工预标记
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies } from '../src/core/anomaly.js';

const RULES = {
  priceMovePctThreshold: 0.07,
  volumeRatioThreshold: 3.0,
  volumeAvgWindow: 30,
  eventWindowDays: [-1, 0, 1],
  cumulativeMovePct3d: 0.20,
};

function barsFromCloses(closes, volumes) {
  return closes.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: c * 0.99, high: c * 1.01, low: c * 0.98, close: c,
    volume: volumes ? volumes[i] : 1000000,
    anomalyTag: null,
  }));
}

test('T6a 涨幅 +8.6% 命中 up，triggers 含 threshold+7%', () => {
  const closes = Array(35).fill(11.84);
  closes[34] = 12.86; // +8.6%
  const bars = barsFromCloses(closes);
  const result = detectAnomalies(bars, RULES);
  const hit = result.find(a => a.date === bars[34].date);
  assert.ok(hit, '应检出异动');
  assert.equal(hit.direction, 'up');
  assert.ok(hit.triggers.includes('threshold+7%'));
});

test('T6b 边界：−7.0% 整命中（含等号），−6.99% 不命中', () => {
  const down7 = barsFromCloses(Array(34).fill(10.0).concat([9.30]));  // −7.0%
  const r1 = detectAnomalies(down7, RULES);
  assert.ok(r1.find(a => a.direction === 'down'), '−7.0% 应命中');

  const down699 = barsFromCloses(Array(34).fill(10.0).concat([9.301])); // −6.99%
  const r2 = detectAnomalies(down699, RULES);
  assert.ok(!r2.find(a => a.direction === 'down'), '−6.99% 不应命中阈值');
});

test('T6c 量比：3.0 整命中 volumeSurge，2.99 不命中', () => {
  const closes = Array(35).fill(10);
  const volumes = Array(34).fill(1000000);
  volumes[34] = 3000000; // 恰好 3.0
  const r1 = detectAnomalies(barsFromCloses(closes, volumes), RULES);
  const hit1 = r1.find(a => a.date === barsFromCloses(closes, volumes)[34].date);
  assert.ok(hit1 && hit1.volumeSurge, '量比 3.0 应命中 volumeSurge');

  volumes[34] = 2990000; // 2.99
  const r2 = detectAnomalies(barsFromCloses(closes, volumes), RULES);
  const hit2 = r2.find(a => a.date === barsFromCloses(closes, volumes)[34].date);
  assert.ok(!hit2 || !hit2.volumeSurge, '量比 2.99 不应命中');
});

test('T6d 手工 anomalyTag="down" 而规则未命中 → 仍输出，triggers 含 manualTag', () => {
  const bars = barsFromCloses(Array(35).fill(10));
  bars[34].anomalyTag = 'down'; // 涨跌幅 0，规则不命中
  const result = detectAnomalies(bars, RULES);
  const hit = result.find(a => a.date === bars[34].date);
  assert.ok(hit, '手工标记应输出');
  assert.ok(hit.triggers.includes('manualTag'));
  assert.equal(hit.direction, 'down');
});

test('前 30 日不足时按可得窗口计算均量', () => {
  // 仅 5 根 K 线
  const closes = [10, 10, 10, 10, 10.8]; // +8%
  const volumes = [1000, 1000, 1000, 1000, 4000];
  const bars = barsFromCloses(closes, volumes);
  const result = detectAnomalies(bars, RULES);
  const hit = result.find(a => a.date === bars[4].date);
  assert.ok(hit, '应命中 up');
  assert.equal(hit.volumeRatio, 4);
});
