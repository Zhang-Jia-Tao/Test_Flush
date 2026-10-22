// 事件详情面板：6 字段 + 三时间（原始/交易所/映射）+ 映射原因 + 证据列表
const TYPE_LABEL = { announcement: '公告', news: '新闻', industry: '行业事件', financial: '财务数据' };
const TAG_LABEL = { fact: '事实', opinion: '观点', correlation: '时间相关性', causal_hypothesis: '因果假设' };
const DIR_LABEL = { positive: '利好', negative: '利空', neutral: '中性' };
const TIER_LABEL = { A: 'A 级（监管/公司正式文件）', B: 'B 级（主流媒体/第三方）', C: 'C 级（传闻/自媒体）' };

export function createDetail(el) {
  function row(dt, ddHtml, asText = true, mono = false) {
    const dtEl = document.createElement('dt');
    dtEl.textContent = dt;
    const ddEl = document.createElement('dd');
    if (mono) ddEl.className = 'mono';
    if (asText) ddEl.textContent = ddHtml; else ddEl.innerHTML = ddHtml;
    return [dtEl, ddEl];
  }

  function render(ev) {
    el.innerHTML = '';
    if (!ev) {
      el.innerHTML = '<div class="detail__placeholder">点击时间线中的事件查看详情</div>';
      return;
    }

    const title = document.createElement('div');
    title.className = 'detail__title';
    title.textContent = ev.title;
    el.appendChild(title);

    const tags = document.createElement('div');
    tags.className = 'detail__tags';
    const typeTag = document.createElement('span');
    typeTag.className = 'tag tag--type';
    typeTag.textContent = TYPE_LABEL[ev.type] || ev.type;
    tags.appendChild(typeTag);
    for (const t of ev.contentTags || []) {
      const tag = document.createElement('span');
      tag.className = `tag tag--${t}`;
      tag.textContent = TAG_LABEL[t] || t;
      tags.appendChild(tag);
    }
    if (ev.direction && ev.direction !== 'neutral') {
      const d = document.createElement('span');
      d.className = `tag tag--dir-${ev.direction}`;
      d.textContent = DIR_LABEL[ev.direction];
      tags.appendChild(d);
    }
    el.appendChild(tags);

    const grid = document.createElement('dl');
    grid.className = 'detail__grid';
    grid.append(...row('类型', TYPE_LABEL[ev.type] || ev.type));
    grid.append(...row('来源', `${ev.source?.name || ''}（${TIER_LABEL[ev.source?.tier] || ev.source?.tier || ''}）`));
    grid.append(...row('原始时间', ev.occurredAtRaw || ev.occurredAt, true, true));
    grid.append(...row('交易所时区', ev.occurredAtExchange || '—', true, true));
    grid.append(...row('映射交易日', ev.mappedTradeDate || '超出区间', true, true));
    grid.append(...row('映射原因', ev.mappingReason || '—'));
    el.appendChild(grid);

    const st = document.createElement('div');
    st.className = 'detail__section-title';
    st.textContent = '摘要';
    el.appendChild(st);
    const summary = document.createElement('div');
    summary.className = 'detail__summary';
    summary.textContent = ev.summary || '（无摘要）';
    el.appendChild(summary);

    const se = document.createElement('div');
    se.className = 'detail__section-title';
    se.textContent = `证据（${(ev.evidence || []).length} 条）`;
    el.appendChild(se);
    for (const e of ev.evidence || []) {
      const card = document.createElement('div');
      card.className = 'evidence-card';
      const tier = document.createElement('div');
      tier.className = 'evidence-card__tier';
      tier.textContent = `来源等级：${TIER_LABEL[e.sourceTier] || e.sourceTier || '—'}`;
      card.appendChild(tier);
      const text = document.createElement('div');
      text.textContent = e.text;
      card.appendChild(text);
      el.appendChild(card);
    }

    if (ev.source?.url) {
      const link = document.createElement('a');
      link.className = 'detail__link';
      link.href = ev.source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '查看来源（模拟链接）';
      el.appendChild(link);
    }
  }

  return { render };
}
