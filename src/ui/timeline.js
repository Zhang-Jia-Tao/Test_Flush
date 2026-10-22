// 纵向事件时间线：按映射交易日分组，范围外事件灰显分组
const TYPE_LABEL = { announcement: '公告', news: '新闻', industry: '行业', financial: '财务' };
const TAG_LABEL = { fact: '事实', opinion: '观点', correlation: '时间相关', causal_hypothesis: '因果假设' };
const DIR_LABEL = { positive: '利好', negative: '利空', neutral: '中性' };

export function createTimeline(el, bus) {
  let groups = [];       // [{date, bars, events, isAnomaly, direction, outOfRange}]
  let selectedDate = null;
  let selectedEventId = null;

  function eventCard(ev) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tl-event tl-event--${ev.type}`;
    btn.dataset.eventId = ev.id;

    const row = document.createElement('div');
    row.className = 'tl-event__row';
    const typeTag = document.createElement('span');
    typeTag.className = 'tag tag--type';
    typeTag.textContent = TYPE_LABEL[ev.type] || ev.type;
    row.appendChild(typeTag);
    for (const t of ev.contentTags || []) {
      const tag = document.createElement('span');
      tag.className = `tag tag--${t}`;
      tag.textContent = TAG_LABEL[t] || t;
      row.appendChild(tag);
    }
    if (ev.direction && ev.direction !== 'neutral') {
      const d = document.createElement('span');
      d.className = `tag tag--dir-${ev.direction}`;
      d.textContent = DIR_LABEL[ev.direction];
      row.appendChild(d);
    }
    const title = document.createElement('span');
    title.className = 'tl-event__title';
    title.textContent = ev.title;
    row.appendChild(title);
    btn.appendChild(row);

    const meta = document.createElement('div');
    meta.className = 'tl-event__meta';
    meta.textContent = `${ev.occurredAtRaw || ev.occurredAt} · ${ev.source?.name || ''} · ${ev.mappingReason || ''}`;
    btn.appendChild(meta);

    btn.addEventListener('click', () => bus.emit('selectEvent', { eventId: ev.id }));
    return btn;
  }

  function render() {
    el.innerHTML = '';
    for (const g of groups) {
      const group = document.createElement('div');
      group.className = 'tl-group' + (g.outOfRange ? ' tl-group--outofrange' : '');
      group.dataset.date = g.date || 'outofrange';

      const head = document.createElement('div');
      head.className = 'tl-group__head' + (g.date === selectedDate ? ' selected' : '');
      const badge = document.createElement('span');
      if (g.isAnomaly) {
        badge.className = `tl-group__badge tl-group__badge--${g.direction === 'up' ? 'up' : 'down'}`;
        badge.textContent = `${g.direction === 'up' ? '涨' : '跌'} ${(g.movePct * 100).toFixed(1)}%`;
      } else if (!g.outOfRange) {
        badge.className = 'tl-group__badge tl-group__badge--flat';
        badge.textContent = g.date ? '—' : '区间外';
      } else {
        badge.className = 'tl-group__badge tl-group__badge--flat';
        badge.textContent = '区间外';
      }
      head.appendChild(badge);

      const dateText = document.createElement('span');
      dateText.className = 'tl-group__date';
      dateText.textContent = g.outOfRange ? '映射日超出 K 线区间' : g.date;
      head.appendChild(dateText);

      if (g.outOfRange) {
        const note = document.createElement('span');
        note.className = 'tl-group__note';
        note.textContent = '以下事件不参与当前区间归因';
        head.appendChild(note);
      } else if (g.events.length === 0) {
        const note = document.createElement('span');
        note.className = 'tl-group__note';
        note.textContent = '无关联事件';
        head.appendChild(note);
      }
      head.addEventListener('click', () => { if (g.date) bus.emit('selectDate', { date: g.date }); });
      group.appendChild(head);

      if (g.events.length > 0) {
        const list = document.createElement('div');
        list.className = 'tl-events';
        for (const ev of g.events) list.appendChild(eventCard(ev));
        group.appendChild(list);
      }
      el.appendChild(group);
    }
    markSelectedEvent();
  }

  function markSelectedEvent() {
    el.querySelectorAll('.tl-event').forEach(n => {
      n.classList.toggle('selected', n.dataset.eventId === selectedEventId);
    });
  }

  return {
    setGroups(newGroups) { groups = newGroups; selectedDate = null; selectedEventId = null; render(); },
    selectDate(date) {
      selectedDate = date;
      el.querySelectorAll('.tl-group__head').forEach(n => n.classList.remove('selected'));
      const g = el.querySelector(`.tl-group[data-date="${date}"] .tl-group__head`);
      if (g) { g.classList.add('selected'); g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    },
    selectEvent(eventId, { flash = false } = {}) {
      selectedEventId = eventId;
      markSelectedEvent();
      const node = el.querySelector(`.tl-event[data-event-id="${eventId}"]`);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (flash) {
          node.classList.remove('flash');
          void node.offsetWidth; // 重启动画
          node.classList.add('flash');
        }
      }
    },
  };
}
