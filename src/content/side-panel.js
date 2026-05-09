'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const MIN_WIDTH = 300;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 380;
  const STORAGE_KEY = 'panelWidth';

  const TABS = [
    { id: 'summary', label: '要約', enabled: true },
    { id: 'prediction', label: '予測', enabled: true },
    { id: 'related', label: '関連', enabled: true },
    // History defaults to locked; the panel re-evaluates after license check.
    { id: 'history', label: '履歴', enabled: false, requiresPremium: true, locked: '有料層で開放されます' },
    { id: 'settings', label: '設定', enabled: true },
  ];

  const LOCK_GLYPH = '\u{1F512}';

  const STAGES = {
    idle: '待機中',
    analyzing: '記事を解析中…',
    generating: '要約を生成中…',
    done: '完了',
    error: 'エラー',
  };

  const HISTORY_DISPLAY_LIMIT = 20;

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
    .settings-section { margin-bottom: 18px; }
    .settings-section h3 { margin: 0 0 6px; }
    .settings-section .lead {
      font-size: 12px;
      color: #475569;
      margin: 0 0 8px;
    }
    .api-key-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      background: #fff7ed;
      color: #b45309;
      border: 1px solid #fed7aa;
    }
    .api-key-status[data-state='set'] {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }
    .api-key-status[data-state='unknown'] {
      background: #f1f5f9;
      color: #475569;
      border-color: #e2e8f0;
    }
    .api-key-status .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      flex: 0 0 auto;
    }
    .open-options-btn {
      appearance: none;
      border: 1px solid #1a73e8;
      background: #1a73e8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      margin-top: 10px;
    }
    .open-options-btn:hover { background: #155bbb; border-color: #155bbb; }
    .open-options-btn:focus-visible {
      outline: 2px solid #93c5fd;
      outline-offset: 2px;
    }
    .byok-notice {
      padding: 12px 14px;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.6;
    }
    .byok-notice h4 {
      margin: 0 0 6px;
      font-size: 12px;
      color: #92400e;
    }
    .byok-notice p { margin: 0 0 8px; }
    .byok-notice a {
      color: #1d4ed8;
      text-decoration: underline;
    }
    .byok-notice .open-options-btn {
      margin-top: 4px;
    }
    .controls-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .template-select {
      flex: 1 1 auto;
      padding: 6px 8px;
      font-size: 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #ffffff;
      color: #1f2937;
      min-width: 130px;
    }
    .run-btn {
      appearance: none;
      border: 1px solid #1a73e8;
      background: #1a73e8;
      color: #ffffff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    .run-btn:hover { background: #155bbb; border-color: #155bbb; }
    .run-btn[disabled] {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .inline-loader {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 12px;
    }
    .inline-loader[data-active='true'] { display: inline-flex; }
    .inline-error {
      display: none;
      padding: 10px 12px;
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 12px;
      white-space: pre-wrap;
    }
    .inline-error[data-active='true'] { display: block; }
    .prediction-section {
      margin-bottom: 14px;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #f9fafb;
    }
    .prediction-section h4 {
      margin: 0 0 6px;
      font-size: 12px;
      color: #1d4ed8;
      letter-spacing: 0.04em;
    }
    .prediction-section p {
      margin: 0;
      white-space: pre-wrap;
      color: #1f2937;
      font-size: 13px;
      line-height: 1.6;
    }
    .keyword-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .keyword-list li { margin: 0; }
    .keyword-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #ffffff;
      color: #1f2937;
      text-decoration: none;
      font-size: 13px;
      transition: border-color 120ms ease, background 120ms ease;
    }
    .keyword-link:hover {
      border-color: #1a73e8;
      background: #eff6ff;
      color: #1d4ed8;
    }
    .keyword-link .arrow {
      color: #94a3b8;
      font-size: 12px;
    }
    .keyword-link:hover .arrow { color: #1a73e8; }
    .related-meta {
      font-size: 11px;
      color: #64748b;
      margin: 0 0 10px;
    }
    .history-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
    }
    .history-header h3 { margin: 0; }
    .history-count-badge {
      display: inline-block;
      padding: 1px 7px;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 999px;
      font-size: 11px;
    }
    .history-list {
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .history-entry {
      padding: 9px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #ffffff;
      cursor: pointer;
      transition: border-color 120ms ease;
    }
    .history-entry:hover {
      border-color: #1a73e8;
      background: #eff6ff;
    }
    .history-entry-title {
      font-size: 12px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .history-entry-meta {
      font-size: 11px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .history-type-badge {
      display: inline-block;
      padding: 0px 5px;
      border-radius: 999px;
      font-size: 10px;
      background: #f1f5f9;
      color: #475569;
    }
    .history-empty {
      padding: 12px;
      background: #f8fafc;
      color: #64748b;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
    }
    .history-see-all-btn {
      appearance: none;
      border: 1px solid #d1d5db;
      background: #ffffff;
      color: #1a73e8;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      width: 100%;
      text-align: center;
      margin-top: 4px;
    }
    .history-see-all-btn:hover { background: #eff6ff; }
    /* History detail modal */
    .history-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
    }
    .history-modal-overlay[hidden] { display: none; }
    .history-modal {
      background: #ffffff;
      border-radius: 10px;
      padding: 20px;
      max-width: min(520px, calc(100vw - 32px));
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      position: relative;
    }
    .history-modal h3 {
      margin: 0 0 12px;
      font-size: 14px;
      color: #1a1a1a;
      padding-right: 28px;
    }
    .history-modal-close {
      position: absolute;
      top: 14px;
      right: 14px;
      appearance: none;
      border: none;
      background: transparent;
      font-size: 18px;
      cursor: pointer;
      color: #555;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      line-height: 1;
    }
    .history-modal-close:hover { background: #f1f5f9; color: #111; }
    .history-modal-field {
      margin-bottom: 10px;
    }
    .history-modal-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 2px;
    }
    .history-modal-value {
      font-size: 12px;
      color: #1f2937;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .history-modal-value a {
      color: #1a73e8;
      word-break: break-all;
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
      this._refreshLicense().catch(() => {
        // best-effort; ignore failures so the panel still renders
      });
      this._installLicenseStorageListener();
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
            <button type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === 'summary'}" ${t.enabled ? '' : 'disabled'} title="${t.locked || ''}" data-requires-premium="${t.requiresPremium ? 'true' : 'false'}">
              <span class="tab-label">${t.label}</span>${t.enabled ? '' : ` <span class="lock-glyph" aria-hidden="true">${LOCK_GLYPH}</span>`}
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
            <div class="byok-notice" data-role="prediction-byok-notice" hidden>
              <h4>Google AI Studio API キーが必要です</h4>
              <p>将来予測・含意分析を生成するには、無料で取得できる Google AI Studio の API キーが必要です。<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">取得手順を開く</a></p>
              <button type="button" class="open-options-btn" data-role="prediction-open-options">設定ページを開く</button>
            </div>
            <div data-role="prediction-main" hidden>
              <div class="controls-row">
                <label class="visually-hidden" for="prediction-template-select" style="display:none">テンプレート</label>
                <select class="template-select" data-role="prediction-template" id="prediction-template-select" aria-label="予測テンプレート"></select>
                <button type="button" class="run-btn" data-role="prediction-run">予測する</button>
              </div>
              <div class="inline-loader" data-role="prediction-loader" role="status" aria-live="polite">
                <span class="spinner"></span>
                <span data-role="prediction-loader-text">予測を生成中…</span>
              </div>
              <div class="inline-error" data-role="prediction-error" role="alert"></div>
              <div data-role="prediction-result">
                <div class="placeholder">テンプレートを選んで「予測する」ボタンを押すと、3 セクション構造の批判的分析が表示されます。</div>
              </div>
            </div>
          </section>
          <section class="tab-panel" data-tab="related">
            <div class="byok-notice" data-role="related-byok-notice" hidden>
              <h4>Google AI Studio API キーが必要です</h4>
              <p>関連キーワードを提案するには、無料で取得できる Google AI Studio の API キーが必要です。<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">取得手順を開く</a></p>
              <button type="button" class="open-options-btn" data-role="related-open-options">設定ページを開く</button>
            </div>
            <div data-role="related-main" hidden>
              <div class="controls-row">
                <button type="button" class="run-btn" data-role="related-run">キーワードを提案</button>
              </div>
              <div class="inline-loader" data-role="related-loader" role="status" aria-live="polite">
                <span class="spinner"></span>
                <span>関連キーワードを生成中…</span>
              </div>
              <div class="inline-error" data-role="related-error" role="alert"></div>
              <p class="related-meta" data-role="related-meta" hidden></p>
              <div data-role="related-result">
                <div class="placeholder">「キーワードを提案」ボタンを押すと、関連キーワード 5 つと note 検索リンクが表示されます。</div>
              </div>
            </div>
          </section>
          <section class="tab-panel" data-tab="history">
            <div data-role="history-locked">
              <div class="placeholder">
                履歴機能は<strong>有料層で開放</strong>されます。記事ごとの要約と分析結果を端末内に保存し、後から見返せるようになります。
                <div class="lock-hint">設定ページからライセンスコードを入力すると有効化できます。</div>
              </div>
              <button type="button" class="open-options-btn" data-role="history-open-options">設定ページを開く</button>
            </div>
            <div data-role="history-unlocked" hidden>
              <div class="history-header">
                <h3>履歴</h3>
                <span class="history-count-badge" data-role="history-count">0</span>
                <span style="font-size:11px;color:#64748b;">(最新 20 件)</span>
              </div>
              <ul class="history-list" data-role="history-list"></ul>
              <div class="history-empty" data-role="history-empty" hidden>
                履歴はまだありません。記事を要約すると自動で保存されます。
              </div>
              <button type="button" class="history-see-all-btn" data-role="history-see-all">すべての履歴を見る</button>
            </div>
            <!-- History detail modal (inside Shadow DOM) -->
            <div class="history-modal-overlay" data-role="history-modal-overlay" hidden>
              <div class="history-modal" data-role="history-modal" role="dialog" aria-modal="true" aria-label="履歴詳細">
                <button type="button" class="history-modal-close" data-role="history-modal-close" aria-label="閉じる">×</button>
                <h3 data-role="history-modal-title">詳細</h3>
                <div data-role="history-modal-body"></div>
              </div>
            </div>
          </section>
          <section class="tab-panel" data-tab="settings">
            <div class="settings-section">
              <h3>API キー</h3>
              <p class="lead">Google AI Studio の API キーを設定すると、Sprint 4 以降の予測・関連機能が利用できるようになります。</p>
              <div class="api-key-status" data-role="api-key-status" data-state="unknown" role="status">
                <span class="dot" aria-hidden="true"></span>
                <span data-role="api-key-status-text">確認中…</span>
              </div>
              <div>
                <button type="button" class="open-options-btn" data-role="open-options">設定ページを開く</button>
              </div>
            </div>
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
        apiKeyStatus: panel.querySelector('[data-role="api-key-status"]'),
        apiKeyStatusText: panel.querySelector('[data-role="api-key-status-text"]'),
        openOptionsBtn: panel.querySelector('[data-role="open-options"]'),
        predictionByokNotice: panel.querySelector('[data-role="prediction-byok-notice"]'),
        predictionMain: panel.querySelector('[data-role="prediction-main"]'),
        predictionTemplate: panel.querySelector('[data-role="prediction-template"]'),
        predictionRun: panel.querySelector('[data-role="prediction-run"]'),
        predictionLoader: panel.querySelector('[data-role="prediction-loader"]'),
        predictionLoaderText: panel.querySelector('[data-role="prediction-loader-text"]'),
        predictionError: panel.querySelector('[data-role="prediction-error"]'),
        predictionResult: panel.querySelector('[data-role="prediction-result"]'),
        predictionOpenOptions: panel.querySelector('[data-role="prediction-open-options"]'),
        relatedByokNotice: panel.querySelector('[data-role="related-byok-notice"]'),
        relatedMain: panel.querySelector('[data-role="related-main"]'),
        relatedRun: panel.querySelector('[data-role="related-run"]'),
        relatedLoader: panel.querySelector('[data-role="related-loader"]'),
        relatedError: panel.querySelector('[data-role="related-error"]'),
        relatedMeta: panel.querySelector('[data-role="related-meta"]'),
        relatedResult: panel.querySelector('[data-role="related-result"]'),
        relatedOpenOptions: panel.querySelector('[data-role="related-open-options"]'),
        historyLocked: panel.querySelector('[data-role="history-locked"]'),
        historyUnlocked: panel.querySelector('[data-role="history-unlocked"]'),
        historyOpenOptions: panel.querySelector('[data-role="history-open-options"]'),
        historyList: panel.querySelector('[data-role="history-list"]'),
        historyEmpty: panel.querySelector('[data-role="history-empty"]'),
        historyCount: panel.querySelector('[data-role="history-count"]'),
        historySeeAll: panel.querySelector('[data-role="history-see-all"]'),
        historyModalOverlay: panel.querySelector('[data-role="history-modal-overlay"]'),
        historyModalClose: panel.querySelector('[data-role="history-modal-close"]'),
        historyModalTitle: panel.querySelector('[data-role="history-modal-title"]'),
        historyModalBody: panel.querySelector('[data-role="history-modal-body"]'),
      };
      this._predictionTemplatesLoaded = false;
      this._predictionRunning = false;
      this._relatedRunning = false;
      this._predictionHandler = null;
      this._relatedHandler = null;
      this._currentTemplateId = 'standard';
      this._articleContext = { url: '', title: '' };
      this._historyEntries = [];
    }

    _bindEvents() {
      this.elements.closeBtn.addEventListener('click', () => this.close());

      this.elements.tabs.forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          this._activateTab(btn.dataset.tab);
        });
      });

      if (this.elements.openOptionsBtn) {
        this.elements.openOptionsBtn.addEventListener('click', () => {
          this._openOptionsPage();
        });
      }

      if (this.elements.predictionOpenOptions) {
        this.elements.predictionOpenOptions.addEventListener('click', () => {
          this._openOptionsPage();
        });
      }

      if (this.elements.relatedOpenOptions) {
        this.elements.relatedOpenOptions.addEventListener('click', () => {
          this._openOptionsPage();
        });
      }

      if (this.elements.historyOpenOptions) {
        this.elements.historyOpenOptions.addEventListener('click', () => {
          this._openOptionsPage();
        });
      }

      if (this.elements.predictionRun) {
        this.elements.predictionRun.addEventListener('click', () => {
          this._invokePrediction();
        });
      }

      if (this.elements.predictionTemplate) {
        this.elements.predictionTemplate.addEventListener('change', (e) => {
          this._currentTemplateId = e.target.value;
        });
      }

      if (this.elements.relatedRun) {
        this.elements.relatedRun.addEventListener('click', () => {
          this._invokeRelated();
        });
      }

      if (this.elements.historySeeAll) {
        this.elements.historySeeAll.addEventListener('click', () => {
          this._openOptionsPage();
        });
      }

      if (this.elements.historyModalClose) {
        this.elements.historyModalClose.addEventListener('click', () => {
          this._closeHistoryModal();
        });
      }

      if (this.elements.historyModalOverlay) {
        this.elements.historyModalOverlay.addEventListener('click', (e) => {
          if (e.target === this.elements.historyModalOverlay) {
            this._closeHistoryModal();
          }
        });
      }

      this._docKeyHandler = (e) => {
        if (e.key === 'Escape') {
          if (this.elements.historyModalOverlay && !this.elements.historyModalOverlay.hidden) {
            this._closeHistoryModal();
          } else if (this.opened) {
            this.close();
          }
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
      if (id === 'settings') {
        this.refreshSettings().catch((err) => {
          console.warn('[note-abstract] refreshSettings failed', err && err.message ? err.message : err);
        });
      }
      if (id === 'prediction') {
        this._refreshPredictionTab().catch((err) => {
          console.warn('[note-abstract] refreshPredictionTab failed', err && err.message ? err.message : err);
        });
      }
      if (id === 'related') {
        this._refreshRelatedTab().catch((err) => {
          console.warn('[note-abstract] refreshRelatedTab failed', err && err.message ? err.message : err);
        });
      }
      if (id === 'history') {
        this._refreshLicense().catch((err) => {
          console.warn('[note-abstract] refreshLicense failed', err && err.message ? err.message : err);
        });
        this._loadHistoryEntries().catch((err) => {
          console.warn('[note-abstract] loadHistoryEntries failed', err && err.message ? err.message : err);
        });
      }
    }

    async _refreshLicense() {
      const ns = globalThis.__noteAbstract || {};
      let isPremium = false;
      if (ns.License && typeof ns.License.isPremium === 'function') {
        try {
          isPremium = await ns.License.isPremium();
        } catch (_) {
          isPremium = false;
        }
      }
      this._applyLicenseState(isPremium);
    }

    _applyLicenseState(isPremium) {
      const tabBtn = Array.from(this.elements.tabs).find(
        (b) => b.dataset.tab === 'history'
      );
      if (tabBtn) {
        if (isPremium) {
          tabBtn.disabled = false;
          tabBtn.removeAttribute('disabled');
          tabBtn.title = '';
          const lock = tabBtn.querySelector('.lock-glyph');
          if (lock) lock.remove();
        } else {
          tabBtn.disabled = true;
          tabBtn.setAttribute('disabled', '');
          tabBtn.title = '有料層で開放されます';
          if (!tabBtn.querySelector('.lock-glyph')) {
            const span = document.createElement('span');
            span.className = 'lock-glyph';
            span.setAttribute('aria-hidden', 'true');
            span.textContent = ` ${LOCK_GLYPH}`;
            tabBtn.appendChild(span);
          }
          // If the user is currently viewing the history tab when premium
          // gets revoked, fall back to the summary tab.
          if (this.activeTab === 'history') {
            this._activateTab('summary');
          }
        }
      }
      if (this.elements.historyLocked) {
        this.elements.historyLocked.hidden = !!isPremium;
      }
      if (this.elements.historyUnlocked) {
        this.elements.historyUnlocked.hidden = !isPremium;
      }
      if (isPremium) {
        this._loadHistoryEntries().catch(() => {});
      } else {
        // Clear the history DOM when premium is revoked.
        this._renderHistoryEntries([]);
      }
    }

    _installLicenseStorageListener() {
      try {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          if (!changes || !('license' in changes)) return;
          this._refreshLicense().catch(() => {});
        });
      } catch (_) {
        // ignore
      }
    }

    setPredictionHandler(fn) {
      this._predictionHandler = fn;
    }

    setRelatedHandler(fn) {
      this._relatedHandler = fn;
    }

    async _refreshPredictionTab() {
      const ns = globalThis.__noteAbstract || {};
      const hasKey = ns.Storage ? await ns.Storage.hasApiKey().catch(() => false) : false;
      this._togglePredictionGate(hasKey);
      if (hasKey && !this._predictionTemplatesLoaded && ns.Predictor) {
        try {
          const templates = await ns.Predictor.getTemplates();
          this._populateTemplateSelect(templates);
          this._predictionTemplatesLoaded = true;
        } catch (err) {
          this._showPredictionError(
            'テンプレート定義を読み込めませんでした。拡張機能を再読み込みしてください。'
          );
        }
      }
    }

    async _refreshRelatedTab() {
      const ns = globalThis.__noteAbstract || {};
      const hasKey = ns.Storage ? await ns.Storage.hasApiKey().catch(() => false) : false;
      this._toggleRelatedGate(hasKey);
    }

    _togglePredictionGate(hasKey) {
      if (this.elements.predictionByokNotice) {
        this.elements.predictionByokNotice.hidden = !!hasKey;
      }
      if (this.elements.predictionMain) {
        this.elements.predictionMain.hidden = !hasKey;
      }
    }

    _toggleRelatedGate(hasKey) {
      if (this.elements.relatedByokNotice) {
        this.elements.relatedByokNotice.hidden = !!hasKey;
      }
      if (this.elements.relatedMain) {
        this.elements.relatedMain.hidden = !hasKey;
      }
    }

    _populateTemplateSelect(templates) {
      const select = this.elements.predictionTemplate;
      if (!select) return;
      select.innerHTML = '';
      const list = Array.isArray(templates) ? templates : [];
      list.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name || t.id;
        select.appendChild(opt);
      });
      const preferred = list.find((t) => t.id === this._currentTemplateId)
        ? this._currentTemplateId
        : (list[0] && list[0].id) || 'standard';
      select.value = preferred;
      this._currentTemplateId = preferred;
    }

    _showPredictionError(message) {
      if (!this.elements.predictionError) return;
      this.elements.predictionError.textContent = message;
      this.elements.predictionError.dataset.active = 'true';
    }

    _clearPredictionError() {
      if (!this.elements.predictionError) return;
      this.elements.predictionError.textContent = '';
      this.elements.predictionError.dataset.active = 'false';
    }

    _setPredictionLoading(loading, message) {
      this._predictionRunning = !!loading;
      if (this.elements.predictionLoader) {
        this.elements.predictionLoader.dataset.active = loading ? 'true' : 'false';
      }
      if (loading && message && this.elements.predictionLoaderText) {
        this.elements.predictionLoaderText.textContent = message;
      }
      if (this.elements.predictionRun) {
        this.elements.predictionRun.disabled = !!loading;
      }
      if (this.elements.predictionTemplate) {
        this.elements.predictionTemplate.disabled = !!loading;
      }
    }

    _setRelatedLoading(loading) {
      this._relatedRunning = !!loading;
      if (this.elements.relatedLoader) {
        this.elements.relatedLoader.dataset.active = loading ? 'true' : 'false';
      }
      if (this.elements.relatedRun) {
        this.elements.relatedRun.disabled = !!loading;
      }
    }

    _showRelatedError(message) {
      if (!this.elements.relatedError) return;
      this.elements.relatedError.textContent = message;
      this.elements.relatedError.dataset.active = 'true';
    }

    _clearRelatedError() {
      if (!this.elements.relatedError) return;
      this.elements.relatedError.textContent = '';
      this.elements.relatedError.dataset.active = 'false';
    }

    // -----------------------------------------------------------------------
    // Article context (url + title) set by content.js before summarization.
    // -----------------------------------------------------------------------
    setArticleContext({ url, title } = {}) {
      this._articleContext = {
        url: url || this._articleContext.url || '',
        title: title || this._articleContext.title || '',
      };
    }

    // -----------------------------------------------------------------------
    // History helpers
    // -----------------------------------------------------------------------
    async _loadHistoryEntries() {
      const ns = globalThis.__noteAbstract || {};
      if (!ns.Storage) return;
      try {
        const entries = await ns.Storage.getHistory({ limit: HISTORY_DISPLAY_LIMIT });
        this._historyEntries = entries;
        this._renderHistoryEntries(entries);
      } catch (err) {
        console.warn('[note-abstract] loadHistoryEntries error', err && err.message ? err.message : err);
      }
    }

    _renderHistoryEntries(entries) {
      const list = this.elements.historyList;
      const empty = this.elements.historyEmpty;
      const count = this.elements.historyCount;
      if (!list) return;

      list.innerHTML = '';

      if (!Array.isArray(entries) || entries.length === 0) {
        if (empty) empty.hidden = false;
        if (count) count.textContent = '0';
        return;
      }

      if (empty) empty.hidden = true;
      if (count) count.textContent = String(entries.length);

      entries.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'history-entry';
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');

        const title = document.createElement('div');
        title.className = 'history-entry-title';
        title.textContent = entry.title || entry.url || '(タイトル不明)';

        const meta = document.createElement('div');
        meta.className = 'history-entry-meta';

        if (entry.createdAt) {
          const dateSpan = document.createElement('span');
          try {
            dateSpan.textContent = new Date(entry.createdAt).toLocaleString('ja-JP');
          } catch (_) {
            dateSpan.textContent = entry.createdAt;
          }
          meta.appendChild(dateSpan);
        }

        if (entry.summary) {
          const b = document.createElement('span');
          b.className = 'history-type-badge';
          b.textContent = '要約';
          meta.appendChild(b);
        }
        if (entry.prediction) {
          const b = document.createElement('span');
          b.className = 'history-type-badge';
          b.textContent = '予測';
          meta.appendChild(b);
        }
        if (Array.isArray(entry.keywords) && entry.keywords.length > 0) {
          const b = document.createElement('span');
          b.className = 'history-type-badge';
          b.textContent = '関連';
          meta.appendChild(b);
        }

        li.appendChild(title);
        li.appendChild(meta);

        const openModal = () => this._openHistoryModal(entry);
        li.addEventListener('click', openModal);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal();
          }
        });

        list.appendChild(li);
      });
    }

    _openHistoryModal(entry) {
      const overlay = this.elements.historyModalOverlay;
      const titleEl = this.elements.historyModalTitle;
      const body = this.elements.historyModalBody;
      if (!overlay || !body) return;

      if (titleEl) titleEl.textContent = entry.title || '(タイトル不明)';

      body.innerHTML = '';

      const addField = (label, value) => {
        if (!value && value !== 0) return;
        const wrap = document.createElement('div');
        wrap.className = 'history-modal-field';
        const labelEl = document.createElement('div');
        labelEl.className = 'history-modal-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('div');
        valueEl.className = 'history-modal-value';
        valueEl.textContent = String(value);
        wrap.appendChild(labelEl);
        wrap.appendChild(valueEl);
        body.appendChild(wrap);
      };

      const addLinkField = (label, url) => {
        if (!url) return;
        const wrap = document.createElement('div');
        wrap.className = 'history-modal-field';
        const labelEl = document.createElement('div');
        labelEl.className = 'history-modal-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('div');
        valueEl.className = 'history-modal-value';
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = url;
        valueEl.appendChild(a);
        wrap.appendChild(labelEl);
        wrap.appendChild(valueEl);
        body.appendChild(wrap);
      };

      addLinkField('URL', entry.url);
      try {
        addField('保存日時', entry.createdAt ? new Date(entry.createdAt).toLocaleString('ja-JP') : '');
      } catch (_) {
        addField('保存日時', entry.createdAt || '');
      }
      addField('要約 (アブストラクト)', entry.summary);
      if (Array.isArray(entry.keyPoints) && entry.keyPoints.length > 0) {
        addField('キーポイント', entry.keyPoints.join('\n'));
      }
      addField('予測', entry.prediction);
      if (Array.isArray(entry.keywords) && entry.keywords.length > 0) {
        addField('関連キーワード', entry.keywords.join(', '));
      }
      if (entry.templateId) {
        addField('テンプレート ID', entry.templateId);
      }

      overlay.hidden = false;
    }

    _closeHistoryModal() {
      if (this.elements.historyModalOverlay) {
        this.elements.historyModalOverlay.hidden = true;
      }
    }

    setHistoryEntries(list) {
      this._historyEntries = Array.isArray(list) ? list : [];
      this._renderHistoryEntries(this._historyEntries);
    }

    // -----------------------------------------------------------------------
    // Auto-save helpers (called from content.js after successful operations)
    // -----------------------------------------------------------------------
    async _saveHistoryEntry(entry) {
      const ns = globalThis.__noteAbstract || {};
      if (!ns.Storage || !ns.License) return;
      try {
        const premium = await ns.License.isPremium();
        if (!premium) return;
        await ns.Storage.addHistory(entry);
        // Refresh the panel list if history tab is visible.
        if (this.activeTab === 'history') {
          await this._loadHistoryEntries();
        }
      } catch (err) {
        console.warn('[note-abstract] saveHistoryEntry failed', err && err.message ? err.message : err);
      }
    }

    setPrediction(result) {
      const container = this.elements.predictionResult;
      if (!container) return;
      container.innerHTML = '';
      const sections = (result && result.sections) || {};
      const order = (result && result.outputSections) || Object.keys(sections);
      order.forEach((name) => {
        const wrap = document.createElement('div');
        wrap.className = 'prediction-section';
        wrap.dataset.section = name;
        const h = document.createElement('h4');
        h.textContent = name;
        const p = document.createElement('p');
        p.textContent = sections[name] || '(このセクションのテキストが返りませんでした)';
        wrap.appendChild(h);
        wrap.appendChild(p);
        container.appendChild(wrap);
      });
      if (!order.length) {
        const fallback = document.createElement('div');
        fallback.className = 'placeholder';
        fallback.textContent = (result && result.rawText) || '結果を解釈できませんでした。';
        container.appendChild(fallback);
      }
    }

    setRelated(result) {
      const container = this.elements.relatedResult;
      if (!container) return;
      container.innerHTML = '';
      const items = (result && result.items) || [];
      if (!items.length) {
        const fallback = document.createElement('div');
        fallback.className = 'placeholder';
        fallback.textContent = '関連キーワードを生成できませんでした。';
        container.appendChild(fallback);
        return;
      }
      const ul = document.createElement('ul');
      ul.className = 'keyword-list';
      items.forEach((item) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'keyword-link';
        a.href = item.searchUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.dataset.keyword = item.keyword;
        const label = document.createElement('span');
        label.textContent = item.keyword;
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = 'note 検索 →';
        a.appendChild(label);
        a.appendChild(arrow);
        li.appendChild(a);
        ul.appendChild(li);
      });
      container.appendChild(ul);
      if (this.elements.relatedMeta) {
        this.elements.relatedMeta.hidden = false;
        this.elements.relatedMeta.textContent = `${items.length} 件のキーワードを生成しました。`;
      }
    }

    async _invokePrediction() {
      if (this._predictionRunning) return;
      if (typeof this._predictionHandler !== 'function') {
        this._showPredictionError('予測機能を初期化できませんでした。ページを再読み込みしてください。');
        return;
      }
      this._clearPredictionError();
      // Clear the previous result so a re-run with a different template never
      // shows stale sections while the new request is in flight.
      if (this.elements.predictionResult) {
        this.elements.predictionResult.innerHTML = '';
      }
      this._setPredictionLoading(true, '予測を生成中…');
      try {
        const templateId = this._currentTemplateId
          || (this.elements.predictionTemplate && this.elements.predictionTemplate.value)
          || 'standard';
        const result = await this._predictionHandler(templateId);
        if (result && result.sections) {
          // Ensure section order from caller is preserved.
          this.setPrediction({
            ...result,
            outputSections: result.outputSections || Object.keys(result.sections),
          });
          // Auto-save to history (premium only, fail-soft).
          const predictionText = Object.values(result.sections || {}).join('\n');
          this._saveHistoryEntry({
            url: this._articleContext.url || location.href,
            title: this._articleContext.title || document.title,
            prediction: predictionText || (result.rawText || ''),
            templateId: result.templateId || templateId,
          }).catch(() => {});
        } else {
          this._showPredictionError('結果を取得できませんでした。少し待ってから再度お試しください。');
        }
      } catch (err) {
        const message = (err && err.message)
          ? err.message
          : '予測を生成できませんでした。少し待ってから再度お試しください。';
        this._showPredictionError(message);
      } finally {
        this._setPredictionLoading(false);
      }
    }

    async _invokeRelated() {
      if (this._relatedRunning) return;
      if (typeof this._relatedHandler !== 'function') {
        this._showRelatedError('関連機能を初期化できませんでした。ページを再読み込みしてください。');
        return;
      }
      this._clearRelatedError();
      if (this.elements.relatedMeta) this.elements.relatedMeta.hidden = true;
      if (this.elements.relatedResult) {
        this.elements.relatedResult.innerHTML = '';
      }
      this._setRelatedLoading(true);
      try {
        const result = await this._relatedHandler();
        if (result && Array.isArray(result.items) && result.items.length > 0) {
          this.setRelated(result);
          // Auto-save keywords to history (premium only, fail-soft).
          const keywords = result.items.map((item) => item.keyword || '').filter(Boolean);
          this._saveHistoryEntry({
            url: this._articleContext.url || location.href,
            title: this._articleContext.title || document.title,
            keywords,
          }).catch(() => {});
        } else {
          this._showRelatedError('関連キーワードを取得できませんでした。少し待ってから再度お試しください。');
        }
      } catch (err) {
        const message = (err && err.message)
          ? err.message
          : '関連キーワードを生成できませんでした。少し待ってから再度お試しください。';
        this._showRelatedError(message);
      } finally {
        this._setRelatedLoading(false);
      }
    }

    async refreshSettings() {
      const statusEl = this.elements.apiKeyStatus;
      const textEl = this.elements.apiKeyStatusText;
      if (!statusEl || !textEl) return;
      const ns = globalThis.__noteAbstract || {};
      if (!ns.Storage) {
        statusEl.dataset.state = 'unknown';
        textEl.textContent = '設定モジュールを読み込めませんでした。';
        return;
      }
      try {
        const has = await ns.Storage.hasApiKey();
        if (has) {
          statusEl.dataset.state = 'set';
          textEl.textContent = 'API キーは設定済みです。';
        } else {
          statusEl.dataset.state = 'empty';
          textEl.textContent = 'API キーは未設定です。設定ページから登録してください。';
        }
      } catch (err) {
        statusEl.dataset.state = 'unknown';
        textEl.textContent = '設定状態の取得に失敗しました。';
      }
    }

    _openOptionsPage() {
      try {
        if (chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
          chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' }, () => {
            // ignore response; service worker is responsible for opening the page
            void chrome.runtime.lastError;
          });
        }
      } catch (err) {
        console.warn('[note-abstract] openOptionsPage failed', err && err.message ? err.message : err);
      }
    }

    open() {
      this.opened = true;
      this.panel.dataset.state = 'open';
      // Inline fallback in case the shadow stylesheet failed to load — guarantees
      // the panel slides into view even when CSS rules cannot be evaluated.
      this.panel.style.transform = 'translateX(0)';
    }

    close() {
      this.opened = false;
      this.panel.dataset.state = 'closed';
      this.panel.style.transform = 'translateX(100%)';
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

    // Reset all per-article DOM state so SPA navigation to a different article
    // doesn't leave stale content visible. User-preference state (template
    // choice, panel width, API key) is intentionally preserved.
    resetForNewArticle() {
      this._summaryRan = false;

      // Summary tab: back to the loading-style placeholder.
      if (this.elements.abstract) {
        this.elements.abstract.textContent = '新しい記事を読み込み中…';
      }
      if (this.elements.keyPoints) {
        this.elements.keyPoints.innerHTML = '';
      }
      if (this.elements.readingTime) {
        this.elements.readingTime.textContent = '— 読了時間';
      }
      if (this.elements.fallback) {
        this.elements.fallback.hidden = true;
        this.elements.fallback.textContent = '';
      }
      this.setStage('idle');

      // Prediction tab.
      this._clearPredictionError();
      this._setPredictionLoading(false);
      if (this.elements.predictionResult) {
        this.elements.predictionResult.innerHTML = '';
        const ph = document.createElement('div');
        ph.className = 'placeholder';
        ph.textContent = 'テンプレートを選んで「予測する」ボタンを押すと、3 セクション構造の批判的分析が表示されます。';
        this.elements.predictionResult.appendChild(ph);
      }

      // Related tab.
      this._clearRelatedError();
      this._setRelatedLoading(false);
      if (this.elements.relatedMeta) {
        this.elements.relatedMeta.hidden = true;
        this.elements.relatedMeta.textContent = '';
      }
      if (this.elements.relatedResult) {
        this.elements.relatedResult.innerHTML = '';
        const ph = document.createElement('div');
        ph.className = 'placeholder';
        ph.textContent = '「キーワードを提案」ボタンを押すと、関連キーワード 5 つと note 検索リンクが表示されます。';
        this.elements.relatedResult.appendChild(ph);
      }
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
