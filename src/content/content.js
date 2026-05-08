'use strict';

(() => {
  const LOG_PREFIX = '[note-abstract]';
  const HOST_ELEMENT_ID = 'note-abstract-host';
  const NOTE_ARTICLE_RE = /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/;

  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});
  let panelInstance = null;
  let cachedArticle = null;

  const isNoteArticleUrl = (url) => NOTE_ARTICLE_RE.test(url);

  const ensureShadowHost = () => {
    let host = document.getElementById(HOST_ELEMENT_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ELEMENT_ID;
      host.style.all = 'initial';
      host.attachShadow({ mode: 'open' });
      // Append to <html>, not <body>: note.com's React framework re-renders the
      // body subtree during navigation/lazy-load, which would silently remove
      // any element we placed inside it. <html> is outside the React root.
      const parent = document.documentElement || document.body;
      if (parent) {
        parent.appendChild(host);
      } else {
        document.body.appendChild(host);
      }
      console.log(`${LOG_PREFIX} shadow host created and attached to ${parent === document.documentElement ? '<html>' : '<body>'}`);
    } else if (!host.shadowRoot) {
      host.attachShadow({ mode: 'open' });
    }
    return host;
  };

  const getArticle = () => {
    if (cachedArticle) return cachedArticle;
    if (!ns.NoteParser) return { ok: false, reason: 'parser-missing' };
    cachedArticle = ns.NoteParser.extractArticle();
    return cachedArticle;
  };

  const ensurePanel = () => {
    const host = ensureShadowHost();
    // If the cached instance was attached to a host that is no longer in the
    // document (note.com SPA removed it), drop it and remount on the fresh host.
    if (panelInstance && panelInstance.host && !panelInstance.host.isConnected) {
      console.warn(`${LOG_PREFIX} previous host disconnected; remounting panel`);
      panelInstance = null;
    }
    if (panelInstance) return panelInstance;
    panelInstance = ns.SidePanel.mount(host);
    console.log(`${LOG_PREFIX} panel mounted on shadow host`);
    return panelInstance;
  };

  let mutationObserver = null;
  const watchHost = () => {
    if (mutationObserver || typeof MutationObserver !== 'function') return;
    const root = document.documentElement;
    if (!root) return;
    mutationObserver = new MutationObserver(() => {
      const stillThere = document.getElementById(HOST_ELEMENT_ID);
      if (stillThere) return;
      console.warn(`${LOG_PREFIX} host element removed by page; re-mounting panel`);
      panelInstance = null;
      try {
        ensurePanel();
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} re-mount failed`,
          err && err.message ? err.message : err
        );
      }
    });
    mutationObserver.observe(root, { childList: true, subtree: true });
  };

  const parseKeyPointsOutput = (raw) => {
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s\-•・*●○◦▪︎\d.)]+/, '').trim())
      .filter(Boolean);
  };

  const runSummaryWorkflow = async (panel) => {
    const article = getArticle();
    if (!article || !article.ok) {
      panel.setStage('error');
      panel.showSummaryFallback(
        '記事を取得できませんでした。ページを再読み込みしてから再度お試しください。'
      );
      return;
    }

    panel.setStage('analyzing');
    const reading = ns.NoteParser.calculateReadingTime(article.body);
    panel.setReadingTime(`${reading.label}・本文 ${ns.NoteParser.countCharacters(article.body)} 字`);

    if (!ns.NanoSummarizer) {
      panel.setStage('done');
      panel.showSummaryFallback('要約モジュールの読み込みに失敗しました。');
      return;
    }

    const availability = await ns.NanoSummarizer.checkAvailability();
    if (availability.status === 'unsupported' || availability.status === 'no') {
      panel.setStage('done');
      panel.showSummaryFallback(
        'お使いの環境ではローカル AI 機能が利用できません。Sprint 9 で BYOK 誘導を実装予定です。'
      );
      return;
    }

    panel.setStage('generating');

    try {
      const [tldr, keyPointsRaw] = await Promise.all([
        ns.NanoSummarizer.summarize(article.body, { type: 'tldr', length: 'short' }),
        ns.NanoSummarizer.summarize(article.body, { type: 'key-points', length: 'medium' }),
      ]);
      panel.setSummary(tldr || '');
      panel.setKeyPoints(parseKeyPointsOutput(keyPointsRaw).slice(0, 5));
      panel.setStage('done');
    } catch (err) {
      console.warn(`${LOG_PREFIX} summarization error`, err && err.message ? err.message : err);
      panel.setStage('done');
      panel.showSummaryFallback(
        '要約を生成できませんでした。ページを再読み込みするか、Sprint 9 公開後に BYOK で再試行してください。'
      );
    }
  };

  const handleToggle = async () => {
    console.log(`${LOG_PREFIX} handleToggle invoked`);
    let panel;
    try {
      panel = ensurePanel();
    } catch (err) {
      console.error(
        `${LOG_PREFIX} ensurePanel threw — aborting toggle`,
        err && err.message ? err.message : err
      );
      return;
    }
    const wasOpen = panel.isOpen();
    console.log(`${LOG_PREFIX} handleToggle: panel.isOpen()=${wasOpen}`);
    if (wasOpen) {
      panel.close();
      console.log(`${LOG_PREFIX} handleToggle: panel.close() called`);
      return;
    }
    panel.open();
    console.log(`${LOG_PREFIX} handleToggle: panel.open() called`);
    if (!panel.hasRunSummary()) {
      panel.markSummaryRan();
      try {
        await runSummaryWorkflow(panel);
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} runSummaryWorkflow threw`,
          err && err.message ? err.message : err
        );
      }
    }
  };

  const init = () => {
    if (globalThis.__noteAbstractContentInitialized) {
      console.log(`${LOG_PREFIX} init skipped: already initialized`);
      return;
    }
    if (!isNoteArticleUrl(location.href)) {
      console.log(`${LOG_PREFIX} skipped: not a note article URL (${location.href})`);
      return;
    }
    globalThis.__noteAbstractContentInitialized = true;

    console.log(`${LOG_PREFIX} content script loaded on ${location.href}`);

    const article = getArticle();
    if (article.ok) {
      console.log(`${LOG_PREFIX} title: ${article.title}`);
      console.log(
        `${LOG_PREFIX} body extracted: ${article.body.length} chars (selector: ${article.bodySelector})`
      );
    } else {
      console.log(`${LOG_PREFIX} extraction failed: ${article.reason}`);
    }

    ensureShadowHost();
    ensurePanel();
    watchHost();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === 'PING') {
        sendResponse({ ok: true, ready: true });
        return false;
      }
      if (message && message.type === 'TOGGLE_SIDE_PANEL') {
        // Respond synchronously so the message channel does not time out while
        // handleToggle awaits Summarizer availability / generation.
        try {
          sendResponse({ ok: true, dispatched: true });
        } catch (_) {
          // ignore
        }
        handleToggle().catch((err) => {
          console.warn(
            `${LOG_PREFIX} handleToggle failed`,
            err && err.message ? err.message : err
          );
        });
        return false;
      }
      return false;
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
