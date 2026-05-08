'use strict';

(() => {
  const LOG_PREFIX = '[note-abstract]';
  const HOST_ELEMENT_ID = 'note-abstract-host';
  const NOTE_ARTICLE_RE = /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/;

  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});
  let panelInstance = null;
  let cachedArticle = null;

  const isNoteArticleUrl = (url) => NOTE_ARTICLE_RE.test(url);

  const HOST_INLINE_STYLE = [
    // CRITICAL: positioning must be set as inline styles because inline beats
    // shadow `:host` rules in CSS specificity. Setting just `all: initial`
    // would reset every :host declaration and the panel would fall back into
    // document flow (this was the bug observed at L=255 instead of right:0).
    'all: initial',
    'position: fixed',
    'top: 0',
    'right: 0',
    'left: auto',
    'bottom: auto',
    'width: auto',
    'height: 100vh',
    'display: block',
    'visibility: visible',
    'opacity: 1',
    'margin: 0',
    'padding: 0',
    'border: 0',
    'background: transparent',
    'z-index: 2147483647',
    'pointer-events: none',
    'overflow: visible',
  ].join('; ') + ';';

  const ensureShadowHost = () => {
    let host = document.getElementById(HOST_ELEMENT_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ELEMENT_ID;
      host.style.cssText = HOST_INLINE_STYLE;
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
    } else {
      // Re-apply inline style in case note.com or another script mutated it.
      host.style.cssText = HOST_INLINE_STYLE;
      if (!host.shadowRoot) {
        host.attachShadow({ mode: 'open' });
      }
    }
    return host;
  };

  const getArticle = () => {
    if (cachedArticle) return cachedArticle;
    if (!ns.NoteParser) return { ok: false, reason: 'parser-missing' };
    cachedArticle = ns.NoteParser.extractArticle();
    return cachedArticle;
  };

  const wirePanelHandlers = (panel) => {
    if (panel.__noteAbstractHandlersWired) return;
    panel.__noteAbstractHandlersWired = true;

    if (typeof panel.setPredictionHandler === 'function') {
      panel.setPredictionHandler(async (templateId) => {
        const article = getArticle();
        if (!article || !article.ok) {
          throw new Error('記事の本文を取得できませんでした。ページを再読み込みしてください。');
        }
        if (!ns.Predictor) {
          throw new Error('予測モジュールを読み込めませんでした。拡張機能を再読み込みしてください。');
        }
        const result = await ns.Predictor.generatePrediction(article, templateId);
        // Provide the section order from the template (Predictor returns sections
        // keyed by name; we need a stable order for rendering).
        const templates = await ns.Predictor.getTemplates();
        const tpl = templates.find((t) => t.id === result.templateId) || templates[0];
        return {
          ...result,
          outputSections: tpl ? tpl.outputSections : Object.keys(result.sections || {}),
        };
      });
    }

    if (typeof panel.setRelatedHandler === 'function') {
      panel.setRelatedHandler(async () => {
        const article = getArticle();
        if (!article || !article.ok) {
          throw new Error('記事の本文を取得できませんでした。ページを再読み込みしてください。');
        }
        if (!ns.KeywordSuggester) {
          throw new Error('関連キーワードモジュールを読み込めませんでした。拡張機能を再読み込みしてください。');
        }
        return ns.KeywordSuggester.suggestKeywords(article);
      });
    }
  };

  const ensurePanel = () => {
    const host = ensureShadowHost();
    // If the cached instance was attached to a host that is no longer in the
    // document (note.com SPA removed it), drop it and remount on the fresh host.
    if (panelInstance && panelInstance.host && !panelInstance.host.isConnected) {
      console.warn(`${LOG_PREFIX} previous host disconnected; remounting panel`);
      panelInstance = null;
    }
    if (panelInstance) {
      wirePanelHandlers(panelInstance);
      return panelInstance;
    }
    panelInstance = ns.SidePanel.mount(host);
    wirePanelHandlers(panelInstance);
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

  // Idempotent message-listener guard. Kept on globalThis with its own key so
  // it survives even if `__noteAbstractContentInitialized` gets cleared (e.g.
  // by a re-injection that resets state). Without this guard, executeScript
  // re-running content.js after a partial state wipe creates a *second*
  // listener; one TOGGLE message then fires handleToggle twice and the panel
  // opens-then-closes within milliseconds — the symptom users see as "icon
  // does nothing." See tests/e2e/diagnose-icon-click.spec.js for the
  // reproduction.
  const ensureMessageListener = () => {
    if (globalThis.__noteAbstractMessageListenerInstalled) return;
    globalThis.__noteAbstractMessageListenerInstalled = true;

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

  const init = () => {
    // Register the message listener FIRST and idempotently. This guarantees
    // that PING / TOGGLE_SIDE_PANEL keep working even if subsequent panel
    // setup throws, AND that re-injection never installs a duplicate listener.
    ensureMessageListener();

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

    try {
      ensureShadowHost();
      ensurePanel();
      watchHost();
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} panel bootstrap failed`,
        err && err.message ? err.message : err
      );
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
