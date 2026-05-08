'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const MIN_WIDTH = 300;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 380;
  const STORAGE_KEY = 'panelWidth';

  const TABS = [
    { id: 'summary', label: '要約', enabled: true },
    { id: 'prediction', label: '予測', enabled: false, locked: 'BYOK 設定後に開放 (Sprint 4)' },
    { id: 'related', label: '関連', enabled: false, locked: 'BYOK 設定後に開放 (Sprint 4)' },
    { id: 'history', label: '履歴', enabled: false, locked: '有料層で開放 (Sprint 6)' },
    { id: 'settings', label: '設定', enabled: true },
  ];

  const STAGES = {
    idle: '待機中',
    analyzing: '記事を解析中…',
    generating: '要約を生成中…',
    done: '完了',
  };

  const PANEL_CSS = `
    :host {
      all: initial;
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      z-index: 2147483647;
      font-family: -apple-system, 'Segoe UI', sans-serif;
      color: #1a1a1a;
      pointer-events: none;
    }
    *, *::before, *::after { box-sizing: border-box; }
    .panel {
      position: relative;
      height: 100%;
      width: var(--panel-width, ${DEFAULT_WIDTH}px);
      background: #ffffff;
      box-shadow: -4px 0 18px rgba(0, 0, 0, 0.08);
      transform: translateX(100%);
      transition: transform 280ms ease;
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      font-size: 13px;
      line-height: 1.6;
    }
    .panel[data-state='open'] { transform: translateX(0); }
    .resize-handle {
      position: absolute;
      top: 0;
      left: -3px;
      width: 6px;
      height: 100%;
      cursor: ew-resize;
      background: transparent;
    }
    .resize-handle:hover { background: rgba(41, 128, 185, 0.25); }
    header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(180deg, #f9fafb, #ffffff);
    }
    header .title {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.02em;
    }
    .close-btn {
      appearance: none;
      border: none;
      background: transparent;
      width: 28px;
      height: 28px;
      cursor: pointer;
      font-size: 18px;
      color: #555;
      border-radius: 4px;
    }
    .close-btn:hover { background: #f1f5f9; color: #111; }
    nav.tabs {
      flex: 0 0 auto;
      display: flex;
      gap: 4px;
      padding: 8px 12px 0;
      border-bottom: 1px solid #e5e7eb;
      overflow-x: auto;
    }
    nav.tabs button {
      appearance: none;
      border: none;
      background: transparent;
      padding: 8px 12px;
      font-size: 12px;
      cursor: pointer;
      color: #555;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }
    nav.tabs button[aria-selected='true'] {
      color: #1a73e8;
      border-bottom-color: #1a73e8;
      font-weight: 600;
    }
    nav.tabs button[disabled] {
      cursor: not-allowed;
      color: #94a3b8;
    }
    .stage {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: #f8fafc;
      font-size: 12px;
      color: #475569;
      border-bottom: 1px solid #e5e7eb;
    }
    .stage[data-stage='done'] { background: #ecfdf5; color: #047857; }
    .stage[data-stage='error'] { background: #fef2f2; color: #b91c1c; }
    .spinner {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid #cbd5e1;
      border-top-color: #1a73e8;
      animation: spin 0.9s linear infinite;
    }
    .stage[data-stage='done'] .spinner,
    .stage[data-stage='idle'] .spinner,
    .stage[data-stage='error'] .spinner { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .tab-panels {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 14px 16px 24px;
    }
    .tab-panel { display: none; }
    .tab-panel[data-active='true'] { display: block; }
    .reading-time {
      display: inline-block;
      padding: 3px 8px;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 12px;
      font-size: 11px;
      margin-bottom: 10px;
    }
    h3 {
      font-size: 12px;
      margin: 14px 0 6px;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .abstract-text {
      white-space: pre-wrap;
      color: #1f2937;
      font-size: 13px;
    }
    .key-points {
      margin: 0;
      padding-left: 20px;
    }
    .key-points li {
      margin-bottom: 6px;
      color: #1f2937;
    }
    .fallback {
      padding: 10px 12px;
      background: #fffbeb;
      color: #92400e;
      border: 1px solid #fde68a;
      border-radius: 6px;
      font-size: 12px;
    }
    .placeholder {
      padding: 12px;
      background: #f8fafc;
      color: #64748b;
      border-radius: 6px;
      font-size: 12px;
    }
    .lock-hint {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 4px;
    }
  `;

  class SidePanel {
    constructor(hostEl) {
      this.host = hostEl;
      this.shadowRoot = hostEl.shadowRoot;
      this.width = DEFAULT_WIDTH;
      this.opened = false;
      this.activeTab = 'summary';
      this._summaryRan = false;
      this._docKeyHandler = null;
      this._mouseMoveHandler = null;
      this._mouseUpHandler = null;
      this._build();
      this._bindEvents();
      this._restoreWidth();
    }

    _build() {
      const root = this.shadowRoot;
      const style = document.createElement('style');
      style.textContent = PANEL_CSS;
      root.appendChild(style);

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.dataset.state = 'closed';
      panel.style.setProperty('--panel-width', `${this.width}px`);

      panel.innerHTML = `
        <div class="resize-handle" role="separator" aria-orientation="vertical" aria-label="幅を変更"></div>
        <header>
          <span class="title">note アブストラクト</span>
          <button type="button" class="close-btn" aria-label="閉じる">×</button>
        </header>
        <nav class="tabs" role="tablist">
          ${TABS.map((t) => `
            <button type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === 'summary'}" ${t.enabled ? '' : 'disabled'} title="${t.locked || ''}">
              ${t.label}${t.enabled ? '' : ' \u{1F512}'}
            </button>
          `).join('')}
        </nav>
        <div class="stage" data-stage="idle" role="status" aria-live="polite">
          <span class="spinner"></span>
          <span class="stage-text">${STAGES.idle}</span>
        </div>
        <div class="tab-panels">
          <section class="tab-panel" data-tab="summary" data-active="true">
            <div class="reading-time" data-role="reading-time">— 読了時間</div>
            <h3>アブストラクト</h3>
            <div class="abstract-text" data-role="abstract">記事を開いてサイドパネルを起動すると、ここに要約が表示されます。</div>
            <h3>キーポイント</h3>
            <ul class="key-points" data-role="key-points"></ul>
            <div class="fallback" data-role="fallback" hidden></div>
          </section>
          <section class="tab-panel" data-tab="prediction">
            <div class="placeholder">将来予測機能は Sprint 4 で実装予定です。<div class="lock-hint">BYOK (Google AI Studio API キー) 設定後に開放されます。</div></div>
          </section>
          <section class="tab-panel" data-tab="related">
            <div class="placeholder">関連キーワード機能は Sprint 4 で実装予定です。<div class="lock-hint">BYOK 設定後に開放されます。</div></div>
          </section>
          <section class="tab-panel" data-tab="history">
            <div class="placeholder">履歴機能は Sprint 6 で実装予定です。<div class="lock-hint">有料層で開放されます。</div></div>
          </section>
          <section class="tab-panel" data-tab="settings">
            <div class="placeholder">設定 UI は Sprint 3 (API キー) 以降で順次実装します。</div>
          </section>
        </div>
      `;

      root.appendChild(panel);
      this.panel = panel;
      this.elements = {
        closeBtn: panel.querySelector('.close-btn'),
        resizeHandle: panel.querySelector('.resize-handle'),
        tabs: panel.querySelectorAll('nav.tabs button'),
        tabPanels: panel.querySelectorAll('.tab-panel'),
        stage: panel.querySelector('.stage'),
        stageText: panel.querySelector('.stage-text'),
        readingTime: panel.querySelector('[data-role="reading-time"]'),
        abstract: panel.querySelector('[data-role="abstract"]'),
        keyPoints: panel.querySelector('[data-role="key-points"]'),
        fallback: panel.querySelector('[data-role="fallback"]'),
      };
    }

    _bindEvents() {
      this.elements.closeBtn.addEventListener('click', () => this.close());

      this.elements.tabs.forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          this._activateTab(btn.dataset.tab);
        });
      });

      this._docKeyHandler = (e) => {
        if (e.key === 'Escape' && this.opened) {
          this.close();
        }
      };
      document.addEventListener('keydown', this._docKeyHandler, { capture: true });

      const handle = this.elements.resizeHandle;
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = this.width;
        this._mouseMoveHandler = (move) => {
          const delta = startX - move.clientX;
          const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
          this._setWidth(next);
        };
        this._mouseUpHandler = () => {
          document.removeEventListener('mousemove', this._mouseMoveHandler);
          document.removeEventListener('mouseup', this._mouseUpHandler);
          this._persistWidth();
        };
        document.addEventListener('mousemove', this._mouseMoveHandler);
        document.addEventListener('mouseup', this._mouseUpHandler);
      });
    }

    async _restoreWidth() {
      try {
        if (!chrome?.storage?.sync) return;
        const stored = await chrome.storage.sync.get(STORAGE_KEY);
        const v = stored && stored[STORAGE_KEY];
        if (typeof v === 'number' && v >= MIN_WIDTH && v <= MAX_WIDTH) {
          this._setWidth(v);
        }
      } catch (_) {
        // ignore storage failures
      }
    }

    async _persistWidth() {
      try {
        if (!chrome?.storage?.sync) return;
        await chrome.storage.sync.set({ [STORAGE_KEY]: this.width });
      } catch (_) {
        // ignore
      }
    }

    _setWidth(px) {
      this.width = px;
      this.panel.style.setProperty('--panel-width', `${px}px`);
      this.panel.dataset.width = String(px);
    }

    _activateTab(id) {
      this.activeTab = id;
      this.elements.tabs.forEach((btn) => {
        btn.setAttribute('aria-selected', String(btn.dataset.tab === id));
      });
      this.elements.tabPanels.forEach((sec) => {
        sec.dataset.active = String(sec.dataset.tab === id);
      });
    }

    open() {
      this.opened = true;
      this.panel.dataset.state = 'open';
    }

    close() {
      this.opened = false;
      this.panel.dataset.state = 'closed';
    }

    toggle() {
      if (this.opened) this.close();
      else this.open();
    }

    isOpen() {
      return this.opened;
    }

    setStage(name) {
      const stage = this.elements.stage;
      stage.dataset.stage = name;
      stage.querySelector('.stage-text').textContent = STAGES[name] || name;
    }

    setSummary(text) {
      this.elements.abstract.textContent = text;
      this.elements.fallback.hidden = true;
    }

    setKeyPoints(items) {
      const ul = this.elements.keyPoints;
      ul.innerHTML = '';
      const list = Array.isArray(items) ? items : [];
      list.slice(0, 5).forEach((point) => {
        const li = document.createElement('li');
        li.textContent = point;
        ul.appendChild(li);
      });
    }

    setReadingTime(label) {
      this.elements.readingTime.textContent = label || '—';
    }

    showSummaryFallback(message) {
      this.elements.fallback.textContent = message;
      this.elements.fallback.hidden = false;
    }

    showError(message) {
      this.setStage('error');
      this.elements.stageText.textContent = message;
    }

    hasRunSummary() {
      return this._summaryRan;
    }

    markSummaryRan() {
      this._summaryRan = true;
    }
  }

  ns.SidePanel = {
    mount(hostEl) {
      if (hostEl.__noteAbstractPanel) return hostEl.__noteAbstractPanel;
      const panel = new SidePanel(hostEl);
      hostEl.__noteAbstractPanel = panel;
      return panel;
    },
    constants: { MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH },
  };
})();
