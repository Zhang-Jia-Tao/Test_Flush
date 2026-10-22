// 交易日历：纯函数，输入 calendar.json 结构
export function createCalendar(calData) {
  const days = [...calData.tradingDays].sort();
  const daySet = new Set(days);

  function isTradeDate(dateStr) {
    return daySet.has(dateStr);
  }

  function nextTradeDate(dateStr) {
    // 严格大于 dateStr 的第一个交易日
    let lo = 0, hi = days.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] > dateStr) hi = mid; else lo = mid + 1;
    }
    return lo < days.length ? days[lo] : null;
  }

  function prevTradeDate(dateStr) {
    let lo = -1, hi = days.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (days[mid] < dateStr) lo = mid; else hi = mid - 1;
    }
    return lo >= 0 ? days[lo] : null;
  }

  function tradeDateOffset(dateStr, n) {
    const idx = days.indexOf(dateStr);
    if (idx === -1) return null;
    const j = idx + n;
    return j >= 0 && j < days.length ? days[j] : null;
  }

  function listTradeDatesInRange(a, b) {
    return days.filter(d => d >= a && d <= b);
  }

  function firstTradeDate() { return days[0] || null; }
  function lastTradeDate() { return days[days.length - 1] || null; }

  return {
    isTradeDate, nextTradeDate, prevTradeDate,
    tradeDateOffset, listTradeDatesInRange, firstTradeDate, lastTradeDate,
    tradingDays: days,
  };
}
