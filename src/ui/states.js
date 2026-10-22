// 状态层：loading / empty / error
export function showLoading(el, text = '正在加载行情与事件…') {
  el.classList.remove('hidden', 'state-layer--empty', 'state-layer--error');
  el.innerHTML = `<div class="spinner"></div><div class="state-text">${text}</div>`;
}

export function showEmpty(el, text) {
  el.classList.remove('hidden', 'state-layer--error');
  el.classList.add('state-layer--empty');
  el.innerHTML = `<div class="state-icon">📭</div><div class="state-text">${text}</div>`;
}

export function showError(el, text, { retry = false } = {}) {
  el.classList.remove('hidden', 'state-layer--empty');
  el.classList.add('state-layer--error');
  el.innerHTML = `<div class="state-icon">⚠️</div><div class="state-text">${text}</div>`
    + (retry ? '<button type="button" class="btn state-retry">重试</button>' : '');
  const btn = el.querySelector('.state-retry');
  if (btn) btn.addEventListener('click', () => window.location.reload());
}

export function hideState(el) {
  el.classList.add('hidden');
  el.innerHTML = '';
}

export function showBanner(text, { warn = false } = {}) {
  const banner = document.getElementById('banner');
  banner.classList.remove('hidden', 'banner--warn');
  if (warn) banner.classList.add('banner--warn');
  banner.textContent = text;
}

export function hideBanner() {
  const banner = document.getElementById('banner');
  banner.classList.add('hidden');
  banner.textContent = '';
}
