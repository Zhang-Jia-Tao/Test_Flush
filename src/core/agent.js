// 规则 Agent：确定性输入 → 确定性输出；护栏措辞模板化，禁止编造因果
import { scoreFactor, confidenceBand } from './evidence.js';

export const FIXED_TEXTS = {
  insufficient: '该交易日未检索到达到证据标准的可核实事件，无法给出可信归因。无明显消息面的异动也可能与资金面、市场情绪或技术因素有关，本演示未纳入这些数据。',
  normalDay: '该交易日未达到异动判定标准（±7%），如需分析请在 K 线图上选择高亮的异动日。',
  causalTpl: '可能与《{title}》有关：该事件于{rawTime}（{phaseReason}）映射至{date}，与{directionText}{movePctText}在时间上相邻。依据：{evidenceText}。不确定性：{uncertainty}。该判断为因果假设，尚未经证实。',
  correlation: '同期发生，仅构成时间相关性，不构成因果关系。',
  disclaimer: '本页面为虚构模拟数据的教学演示，不构成任何投资建议。',
};

const UNCERTAINTY_POOL = [
  '时间相邻不等于因果，同期可能存在未纳入数据的影响因素（资金面、市场情绪、大盘联动等）。',
  '该判断基于模拟数据中的有限证据，实际市场中的因果关系需要更完整的验证。',
  '存在其他可能的竞争解释，本因素仅为其中之一，且尚未经证实。',
];

const DIR_TEXT = { up: '上涨', down: '下跌' };

function fmtPct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function buildFactor(event, anomaly, dayOffset, offsetLabel, idx) {
  const { score, confidence, band } = scoreFactor(event, anomaly, dayOffset);
  const isOpinion = (event.contentTags || []).includes('opinion');
  const hasFactEvidence = (event.evidence || []).some(e => (e.sourceTier === 'A' || e.sourceTier === 'B'))
    || (!isOpinion && event.source?.tier !== 'C');

  const tags = ['causal_hypothesis', 'correlation'];
  const directionText = DIR_TEXT[anomaly.direction] || '波动';
  const evidenceText = (event.evidence || []).map(e => e.text).join('；') || event.summary || '（无原文摘录）';
  const uncertainty = UNCERTAINTY_POOL[idx % UNCERTAINTY_POOL.length];

  const text = FIXED_TEXTS.causalTpl
    .replace('{title}', event.title)
    .replace('{rawTime}', event.occurredAtRaw || event.occurredAt || '')
    .replace('{phaseReason}', event.mappingReason || '')
    .replace('{date}', event.mappedTradeDate)
    .replace('{directionText}', directionText)
    .replace('{movePctText}', fmtPct(anomaly.movePct))
    .replace('{evidenceText}', evidenceText)
    .replace('{uncertainty}', uncertainty);

  return {
    eventId: event.id,
    title: event.title,
    tags,
    text,
    reasoning: evidenceText,
    confidence,
    band,
    uncertainty,
    evidenceIds: (event.evidence || []).map((_, i) => `${event.id}#e${i}`),
    direction: event.direction,
    dayOffset,
    offsetLabel,
    // 证据不足护栏：仅有观点/传闻时明示
    unverified: isOpinion || !hasFactEvidence,
  };
}

/**
 * 规则 Agent 主入口
 * @param {string} date 选中的交易日 YYYY-MM-DD
 * @param {object} ctx { anomalyOn(date), eventsInWindow(date) -> [{...event, dayOffset, offsetLabel}] }
 */
export function analyze(date, ctx) {
  const a = ctx.anomalyOn(date);
  if (!a) {
    return { kind: 'normal-day', factors: [], message: FIXED_TEXTS.normalDay, disclaimer: FIXED_TEXTS.disclaimer };
  }

  const cands = ctx.eventsInWindow(date);
  // 护栏：窗口内没有任何"事实类"证据 → 证据不足，禁止编造
  // （财务类事件无 evidence 数组，其本体即 A 级事实，不因缺 evidence 被判证据不足）
  const hasFact = cands.some(e =>
    !(e.contentTags || []).includes('opinion') && e.source?.tier !== 'C'
    && ((e.evidence || []).length > 0 || e.type === 'financial')
  );
  if (!hasFact) {
    return { kind: 'evidence-insufficient', factors: [], message: FIXED_TEXTS.insufficient, disclaimer: FIXED_TEXTS.disclaimer };
  }

  const factors = cands
    .map((e, i) => buildFactor(e, a, e.dayOffset ?? 0, e.offsetLabel ?? '当日', i))
    .sort((x, y) => y.confidence - x.confidence)
    .slice(0, 3);

  return { kind: 'anomaly', factors, anomaly: a, disclaimer: FIXED_TEXTS.disclaimer };
}
