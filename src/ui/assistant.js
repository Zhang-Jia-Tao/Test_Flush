// 浮动 Agent 助手：FAB + 面板，随选中日输出 1~3 个因素
const TAG_LABEL = { fact: '事实', opinion: '观点', correlation: '时间相关', causal_hypothesis: '因果假设' };
const BAND_LABEL = { high: '高', mid: '中', low: '低' };
const DIR_TEXT = { up: '上涨', down: '下跌' };

export function createAssistant(fabEl, panelEl, bus) {
  const body = panelEl.querySelector('#assistant-body');
  const badge = fabEl.querySelector('#fab-badge');

  function open() {
    panelEl.classList.remove('hidden');
    badge.classList.add('hidden');
  }
  function close() {
    panelEl.classList.add('hidden');
  }
  fabEl.addEventListener('click', () => {
    panelEl.classList.contains('hidden') ? open() : close();
  });
  panelEl.querySelector('#assistant-close').addEventListener('click', close);

  function confBar(confidence, band) {
    const wrap = document.createElement('div');
    wrap.className = 'factor-card__conf';
    const bar = document.createElement('div');
    bar.className = 'conf-bar';
    const fill = document.createElement('div');
    fill.className = `conf-bar__fill conf-bar__fill--${band}`;
    fill.style.width = `${Math.round(confidence * 100)}%`;
    bar.appendChild(fill);
    wrap.appendChild(bar);
    const label = document.createElement('span');
    label.className = 'conf-label';
    label.textContent = `置信度 ${BAND_LABEL[band]}（${(confidence * 100).toFixed(0)}）`;
    wrap.appendChild(label);
    return wrap;
  }

  function factorCard(f) {
    const card = document.createElement('div');
    card.className = 'factor-card';

    const head = document.createElement('div');
    head.className = 'factor-card__head';
    for (const t of f.tags) {
      const tag = document.createElement('span');
      tag.className = `tag tag--${t}`;
      tag.textContent = TAG_LABEL[t] || t;
      head.appendChild(tag);
    }
    if (f.unverified) {
      const warn = document.createElement('span');
      warn.className = 'tag tag--opinion';
      warn.textContent = '⚠ 未经证实';
      head.appendChild(warn);
    }
    const title = document.createElement('span');
    title.className = 'factor-card__title';
    title.textContent = f.title;
    head.appendChild(title);
    card.appendChild(head);

    const reasoning = document.createElement('div');
    reasoning.className = 'factor-card__reasoning';
    reasoning.textContent = f.text;
    card.appendChild(reasoning);

    const unc = document.createElement('div');
    unc.className = 'factor-card__uncertainty';
    unc.textContent = `⚠ ${f.uncertainty}`;
    card.appendChild(unc);

    card.appendChild(confBar(f.confidence, f.band));

    const locate = document.createElement('button');
    locate.type = 'button';
    locate.className = 'factor-card__locate';
    locate.textContent = '定位到对应事件 →';
    locate.addEventListener('click', () => bus.emit('locateEvent', { eventId: f.eventId }));
    card.appendChild(locate);

    return card;
  }

  function notice(text) {
    const n = document.createElement('div');
    n.className = 'assistant__notice';
    n.innerHTML = text;
    return n;
  }

  function renderResult(result, dateInfo) {
    body.innerHTML = '';

    if (dateInfo) {
      const day = document.createElement('div');
      day.className = 'assistant__day';
      const chgCls = dateInfo.movePct >= 0 ? 'chg-up' : 'chg-down';
      day.innerHTML = `<b>${dateInfo.date}</b>
        <span class="${chgCls}">${dateInfo.movePct >= 0 ? '+' : ''}${(dateInfo.movePct * 100).toFixed(2)}%</span>
        <span class="vol-ratio">量比 ${dateInfo.volumeRatio ? dateInfo.volumeRatio.toFixed(1) : '—'}×</span>`;
      body.appendChild(day);
    }

    if (result.kind === 'normal-day') {
      body.appendChild(notice(`<b>普通交易日</b><br>${result.message}`));
      return;
    }
    if (result.kind === 'evidence-insufficient') {
      badge.classList.remove('hidden');
      body.appendChild(notice(`<b>证据不足，无法归因</b><br>${result.message}`));
      return;
    }
    if (result.factors.length === 0) {
      body.appendChild(notice('未发现可核实因素。'));
      return;
    }
    for (const f of result.factors) body.appendChild(factorCard(f));
  }

  function guide() {
    body.innerHTML = '';
    badge.classList.add('hidden');
    const g = document.createElement('div');
    g.className = 'assistant__guide';
    g.textContent = '请在 K 线图上点击一个交易日（推荐点击高亮的异动日），助手将基于该日生成可能的影响因素分析。';
    body.appendChild(g);
  }

  return {
    showResult: renderResult,
    guide,
    open,
    close,
  };
}
