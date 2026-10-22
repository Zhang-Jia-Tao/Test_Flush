// 时区工具：基于 Intl 反解，显式传时区，不依赖运行环境时区
const partsCache = new Map();

function fmtFor(timeZone) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/**
 * 把 ISO 时间戳转换到目标时区，返回 {date:'YYYY-MM-DD', minutesOfDay, secondsOfDay}
 */
export function getZonedParts(isoString, timeZone) {
  const parts = fmtFor(timeZone).formatToParts(new Date(isoString));
  const get = (t) => parts.find(p => p.type === t)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  // Intl hour12:false 在部分环境返回 "24" 表示午夜，归一为 "00"
  let hour = get('hour');
  if (hour === '24') hour = '00';
  const minute = get('minute');
  const second = get('second');
  const date = `${year}-${month}-${day}`;
  const minutesOfDay = Number(hour) * 60 + Number(minute);
  const secondsOfDay = minutesOfDay * 60 + Number(second);
  return { date, minutesOfDay, secondsOfDay };
}
