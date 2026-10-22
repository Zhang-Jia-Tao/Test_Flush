// T3: agent 测试 —— 证据不足、竞争解释、普通日、因素上限、措辞护栏
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/agent.js';
import { scoreFactor, DISTANCE_WEIGHT } from '../src/core/evidence.js';

function makeCtx({ anomalies = [], mappedEvents = [] } = {}) {
  return {
    anomalyOn: (date) => anomalies.find(a => a.date === date) || null,
    eventsInWindow: (date) => mappedEvents.filter(e => e.mappedTradeDate !== null),
  };
}

const ANOMALY_UP = { date: '2026-10-12', direction: 'up', movePct: 0.086, volumeRatio: 3.4, triggers: ['threshold+7%'] };

test('T3a 证据不足：窗口内仅有 C 级 opinion → evidence-insufficient，禁止因果措辞', () => {
  const ctx = makeCtx({
    anomalies: [ANOMALY_UP],
    mappedEvents: [{
      id: 'EV-WEAK-01', type: 'news', title: '网传大客户砍单截图',
      source: { name: '股吧（虚构）', tier: 'C' },
      contentTags: ['opinion'], direction: 'negative',
      mappedTradeDate: '2026-10-12', occurredAtRaw: '2026-10-12T10:00:00+08:00',
      evidence: [],
    }],
  });
  const r = analyze('2026-10-12', ctx);
  assert.equal(r.kind, 'evidence-insufficient');
  assert.deepEqual(r.factors, []);
  assert.ok(r.message && r.message.length > 10, '必须返回固定文案');
  // 措辞护栏：不得出现确定性归因
  for (const w of ['导致', '推动', '因为']) {
    assert.ok(!r.message.includes(w), `文案不得出现"${w}"`);
  }
});

test('T3a-2 零事件异动日 → evidence-insufficient', () => {
  const ctx = makeCtx({ anomalies: [ANOMALY_UP], mappedEvents: [] });
  const r = analyze('2026-10-12', ctx);
  assert.equal(r.kind, 'evidence-insufficient');
});

test('距离权重：同向当日 +0.10 / 前一日 +0.04 / 后一日 +0.02，反向不加分', () => {
  assert.deepEqual(DISTANCE_WEIGHT, { 0: 0.10, [-1]: 0.04, [1]: 0.02 });
  const anomaly = { direction: 'up', movePct: 0.086 };
  const mk = () => ({ type: 'news', direction: 'positive', contentTags: ['fact'], source: { tier: 'A' }, evidence: [] });

  // 同向：基础 0.45 + 距离权重（A级封顶 0.9 内不受限）
  assert.equal(scoreFactor(mk(), anomaly, 0).confidence, 0.55);   // 0.45+0.10
  assert.equal(scoreFactor(mk(), anomaly, -1).confidence, 0.49);  // 0.45+0.04
  assert.equal(scoreFactor(mk(), anomaly, 1).confidence, 0.47);   // 0.45+0.02

  // 反向：不享受距离权重，且扣 0.15
  const neg = { ...mk(), direction: 'negative' };
  assert.equal(scoreFactor(neg, anomaly, 0).confidence, 0.30);    // 0.45-0.15

  // 中性：享受一半距离权重
  const neutral = { ...mk(), direction: 'neutral' };
  assert.equal(scoreFactor(neutral, anomaly, 0).confidence, 0.50); // 0.45+0.05
});

test('T3b 竞争解释：合同公告（A 级 positive）排序第一，关税利空列为竞争因素', () => {  const ctx = makeCtx({
    anomalies: [ANOMALY_UP],
    mappedEvents: [
      {
        id: 'EV-CONTRACT', type: 'announcement', title: '签订 8.6 亿重大合同',
        source: { name: '上交所公告', tier: 'A' },
        contentTags: ['fact'], direction: 'positive',
        mappedTradeDate: '2026-10-12', occurredAtRaw: '2026-10-09T18:32:00+08:00',
        evidence: [{ text: '合同总金额约 8.6 亿元', sourceTier: 'A' }],
      },
      {
        id: 'EV-TARIFF', type: 'industry', title: '海外加征储能关税',
        source: { name: '环球财讯', tier: 'B' },
        contentTags: ['fact'], direction: 'negative',
        mappedTradeDate: '2026-10-12', occurredAtRaw: '2026-10-10T01:30:00Z',
        evidence: [{ text: '拟加征 15% 关税', sourceTier: 'B' }],
      },
    ],
  });
  const r = analyze('2026-10-12', ctx);
  assert.equal(r.kind, 'anomaly');
  assert.ok(r.factors.length >= 1 && r.factors.length <= 3);
  assert.equal(r.factors[0].eventId, 'EV-CONTRACT', '主因素应为合同公告');
  assert.ok(r.factors[0].confidence >= 0.7, '主因素置信度应为高');
  // 竞争解释必须出现在结果中（因素列表或 alternativeExplanations）
  const all = JSON.stringify(r);
  assert.ok(all.includes('EV-TARIFF'), '竞争解释不得被丢弃');
});

test('T3c 普通日 → normal-day', () => {
  const ctx = makeCtx({ anomalies: [], mappedEvents: [] });
  const r = analyze('2026-09-10', ctx);
  assert.equal(r.kind, 'normal-day');
  assert.deepEqual(r.factors, []);
});

test('因素上限：5 条候选 → 输出 ≤3', () => {
  const events = Array.from({ length: 5 }, (_, i) => ({
    id: `EV-${i}`, type: 'announcement', title: `公告${i}`,
    source: { name: '上交所', tier: 'A' },
    contentTags: ['fact'], direction: 'positive',
    mappedTradeDate: '2026-10-12', occurredAtRaw: '2026-10-12T10:00:00+08:00',
    evidence: [{ text: '证据', sourceTier: 'A' }],
  }));
  const ctx = makeCtx({ anomalies: [ANOMALY_UP], mappedEvents: events });
  const r = analyze('2026-10-12', ctx);
  assert.ok(r.factors.length <= 3);
});

test('措辞护栏：因果因素必须含"可能与""因果假设""尚未经证实"，相关性含"时间相关"', () => {
  const ctx = makeCtx({
    anomalies: [ANOMALY_UP],
    mappedEvents: [{
      id: 'EV-CONTRACT', type: 'announcement', title: '重大合同',
      source: { name: '上交所', tier: 'A' },
      contentTags: ['fact'], direction: 'positive',
      mappedTradeDate: '2026-10-12', occurredAtRaw: '2026-10-09T18:32:00+08:00',
      evidence: [{ text: '合同金额 8.6 亿', sourceTier: 'A' }],
    }],
  });
  const r = analyze('2026-10-12', ctx);
  const f = r.factors[0];
  assert.ok(f.text.includes('可能与'), '因果措辞须为"可能与"');
  assert.ok(f.text.includes('因果假设') || f.text.includes('尚未经证实'));
  assert.ok(f.tags.includes('causal_hypothesis'));
  assert.ok(f.tags.includes('correlation'));
  assert.ok(f.uncertainty && f.uncertainty.length > 0, '必须有不确定性提示');
  assert.ok(f.confidence <= 0.9, '置信度上限 0.9');
});
