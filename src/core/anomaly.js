// 异动判定：±7% 阈值 + 量比 3 倍辅助 + 3 日累计 + 手工预标记并集
const EPS = 1e-9;

function pctMove(bar, prevBar) {
  if (!prevBar || !prevBar.close) return 0;
  return bar.close / prevBar.close - 1;
}

export function detectAnomalies(bars, rules) {
  const th = rules.priceMovePctThreshold;
  const vrTh = rules.volumeRatioThreshold;
  const win = rules.volumeAvgWindow;
  const cumTh = rules.cumulativeMovePct3d;
  const results = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const prev = i > 0 ? bars[i - 1] : null;
    const move = pctMove(bar, prev);
    const triggers = [];
    let direction = null;

    // 1) 阈值（含等号）
    if (move >= th - EPS) { triggers.push('threshold+7%'); direction = 'up'; }
    else if (move <= -th + EPS) { triggers.push('threshold-7%'); direction = 'down'; }

    // 2) 量比（辅助信号）
    const windowBars = bars.slice(Math.max(0, i - win), i);
    const avgVol = windowBars.length
      ? windowBars.reduce((s, b) => s + (Number(b.volume) || 0), 0) / windowBars.length
      : 0;
    const volumeRatio = avgVol > 0 ? bar.volume / avgVol : 0;
    const volumeSurge = avgVol > 0 && volumeRatio >= vrTh - EPS;
    if (volumeSurge) triggers.push('volumeSurge');

    // 3) 连续 3 日累计
    let cumulativeFlag = false;
    if (i >= 2) {
      const cum = bars[i].close / bars[i - 2].close - 1;
      if (Math.abs(cum) >= cumTh - EPS) cumulativeFlag = true;
    }

    // 4) 手工预标记并集
    if (bar.anomalyTag === 'up' || bar.anomalyTag === 'down') {
      triggers.push('manualTag');
      if (!direction) direction = bar.anomalyTag;
    }

    if (triggers.length > 0) {
      results.push({
        date: bar.date,
        direction,
        movePct: move,
        volumeRatio,
        volumeSurge,
        cumulativeFlag,
        triggers,
      });
    }
  }
  return results;
}
