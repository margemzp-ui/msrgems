(() => {
  const api = window.electronAPI;
  const grid = document.getElementById('sourceGrid');
  const help = document.getElementById('tabsHelp');
  const start = document.getElementById('start');
  const includeAudio = document.getElementById('includeAudio');
  let sources = [];
  let kind = 'screen';
  let selectedId = '';
  let status = 'loading';
  let statusMessage = '';
  let statusDetail = '';

  function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
  function visibleSources() { return sources.filter((source) => source.kind === kind); }
  function statusView() {
    if (status === 'loading') return '<div class="source-status loading" role="status"><span class="spinner" aria-hidden="true"></span><strong>Finding screens and windows…</strong><small>This usually takes a moment.</small></div>';
    const action = status === 'error' || status === 'empty' ? '<button class="secondary inline-retry" data-action="retry">Try again</button>' : '';
    return '<div class="source-status ' + escapeHtml(status) + '" role="status"><strong>' + escapeHtml(statusMessage) + '</strong><small>' + escapeHtml(statusDetail) + '</small>' + action + '</div>';
  }
  function render() {
    const visible = visibleSources();
    help.hidden = kind !== 'tab';
    grid.hidden = kind === 'tab';
    document.getElementById('screenCount').textContent = sources.filter((source) => source.kind === 'screen').length;
    document.getElementById('windowCount').textContent = sources.filter((source) => source.kind === 'window').length;
    if (kind === 'tab') { start.disabled = true; return; }
    grid.setAttribute('aria-busy', String(status === 'loading'));
    if (status !== 'ready') {
      selectedId = '';
      start.disabled = true;
      grid.innerHTML = statusView();
      grid.querySelector('[data-action="retry"]')?.addEventListener('click', refresh);
      return;
    }
    if (!visible.some((source) => source.id === selectedId)) selectedId = visible[0]?.id || '';
    start.disabled = !selectedId;
    grid.innerHTML = visible.length ? visible.map((source) => '<button class="source-card' + (source.id === selectedId ? ' selected' : '') + '" data-id="' + escapeHtml(source.id) + '" title="' + escapeHtml(source.name) + '"><span class="thumb">' + (source.thumbnail ? '<img alt="" src="' + source.thumbnail + '">' : '<span class="preview-unavailable">Preview unavailable</span>') + '</span><span class="source-name">' + escapeHtml(source.name) + '</span></button>').join('') : '<div class="source-status empty" role="status"><strong>No sources in this category</strong><small>Open a window or connect another display, then refresh.</small><button class="secondary inline-retry" data-action="retry">Refresh</button></div>';
    grid.querySelectorAll('.source-card').forEach((card) => {
      card.addEventListener('click', () => { selectedId = card.dataset.id; render(); });
      card.addEventListener('dblclick', confirm);
    });
    grid.querySelector('[data-action="retry"]')?.addEventListener('click', refresh);
  }
  function refresh() {
    status = 'loading';
    statusMessage = '';
    statusDetail = '';
    render();
    api.refreshCaptureSources();
  }
  function choose(nextKind) {
    kind = nextKind;
    selectedId = '';
    document.querySelectorAll('.tab').forEach((tab) => { const active = tab.dataset.kind === kind; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
    render();
  }
  function confirm() { if (selectedId) api.selectCaptureSource({ id: selectedId, includeAudio: includeAudio.checked }); }
  api.onCaptureSourcesState((payload = {}) => {
    status = ['loading', 'ready', 'empty', 'error'].includes(payload.status) ? payload.status : 'error';
    sources = status === 'ready' && Array.isArray(payload.sources) ? payload.sources : [];
    statusMessage = payload.message || (status === 'error' ? 'FaceScreen could not load capture sources.' : 'No capture sources found.');
    statusDetail = payload.detail || (status === 'error' ? 'Try again or restart FaceScreen.' : 'Open the source you want to record, then refresh.');
    render();
  });
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => choose(tab.dataset.kind)));
  document.getElementById('showWindows').addEventListener('click', () => choose('window'));
  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('start').addEventListener('click', confirm);
  ['close', 'cancel'].forEach((id) => document.getElementById(id).addEventListener('click', () => api.cancelCaptureSource()));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') api.cancelCaptureSource(); if (event.key === 'Enter' && !start.disabled) confirm(); });
  render();
  api.capturePickerReady();
})();
