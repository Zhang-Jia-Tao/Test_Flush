// 证据分级与因素评分：确定性可计算，置信度上限 0.9
export const TYPE_WEIGHT = { announcement: 0.75, financial: 0.75, industry: 0.55, news: 0.45 };
export const DISTANCE_WEIGHT = { 0: 0.10, [-1]: 0.04, [1]: 0.02 };
export const TIER_CAP = { A: 0.9, B: 0.6, C: 0.3 };

export function confidenceBand(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'mid';
  return 'low';
}

/**
 * 为候选事件计算因素得分与置信度
 * @param {object} event 已映射事件（含 mappedTradeDate, direction, contentTags, evidence）
 * @param {object} anomaly 异动记录 {direction, movePct}
 * @param {number} dayOffset 事件映射日相对异动日的交易日偏移（-1/0/+1）
 * @returns {{score:number, confidence:number, band:string}}
 */
// 事件方向（positive/negative/neutral）与异动方向（up/down）的枚举归一
function directionOf(event, anomaly) {
  // 异动方向归一：up→positive, down→negative
  const aDir = anomaly?.direction === 'up' ? 'positive'
             : anomaly?.direction === 'down' ? 'negative'
             : anomaly?.direction || null;
  const eDir = event.direction || null;
  if (!aDir || !eDir || eDir === 'neutral' || aDir === 'neutral') return 'neutral-match';
  return eDir === aDir ? 'same' : 'opposite';
}

export function scoreFactor(event, anomaly, dayOffset) {
  const isOpinion = (event.contentTags || []).includes('opinion');
  const tier = event.source?.tier || 'C';

  // 基础分：观点/传闻 0.2，其余按类型权重
  let score = isOpinion ? 0.2 : (TYPE_WEIGHT[event.type] ?? 0.45);

  // 距离权重（docs/05）：当日 +0.10 / 前一交易日 +0.04 / 后一交易日 +0.02
  // 同向事件享受全额距离权重；中性事件取一半；反向事件不加分（下方扣分）
  const distW = DISTANCE_WEIGHT[dayOffset] ?? 0;
  const dirMatch = directionOf(event, anomaly);
  if (dirMatch === 'same') score += distW;
  else if (dirMatch === 'neutral-match') score += distW / 2;

  // 独立证据条数加分（每条 +0.1，封顶 0.9）
  const nEvidence = (event.evidence || []).length;
  score = Math.min(score + nEvidence * 0.1, 0.9);

  // 反向/竞争证据扣分：方向与异动相反
  if (dirMatch === 'opposite') score -= 0.15;

  // 来源等级封顶
  const cap = TIER_CAP[tier] ?? 0.3;
  score = Math.min(score, cap);

  // 观点或 C 级封顶 0.3
  if (isOpinion || tier === 'C') score = Math.min(score, 0.3);

  score = Math.round(Math.max(0, Math.min(score, 0.9)) * 100) / 100;
  return { score, confidence: score, band: confidenceBand(score) };
}
