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
      document.body.appendChild(host);
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
    if (panelInstance) return panelInstance;
    const host = ensureShadowHost();
    panelInstance = ns.SidePanel.mount(host);
    return panelInstance;
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
    const panel = ensurePanel();
    if (panel.isOpen()) {
      panel.close();
      return;
    }
    panel.open();
    if (!panel.hasRunSummary()) {
      panel.markSummaryRan();
      await runSummaryWorkflow(panel);
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

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === 'PING') {
        sendResponse({ ok: true, ready: true });
        return false;
      }
      if (message && message.type === 'TOGGLE_SIDE_PANEL') {
        handleToggle()
          .then(() => sendResponse({ ok: true }))
          .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
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
