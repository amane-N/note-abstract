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
    // 成功結果のみキャッシュする。document_idle 直後は note.com の SPA が
    // 記事 DOM をまだ描画し終えていない場合があり、ここで失敗結果を永続
    // キャッシュしてしまうと、後でパネルを開いても再試行されず常に
    // 「記事を取得できませんでした」と表示されてしまう。
    if (cachedArticle && cachedArticle.ok) return cachedArticle;
    if (!ns.NoteParser) return { ok: false, reason: 'parser-missing' };
    // Sprint 10: 厳格モードで抽出。有料境界が検出された場合は抽出を中止する。
    const result = ns.NoteParser.extractArticle(document, { strict: true });
    if (result && result.ok) cachedArticle = result;
    return result;
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

  const saveHistoryAfterSummary = async (panel, article, tldr, keyPoints) => {
    try {
      if (!ns.License || !ns.Storage) return;
      const premium = await ns.License.isPremium();
      if (!premium) return;
      await ns.Storage.addHistory({
        url: location.href,
        title: article.title || document.title,
        summary: tldr || '',
        keyPoints: keyPoints ? keyPoints.slice(0, 5) : [],
      });
      if (typeof panel.setHistoryEntries === 'function' && panel.activeTab === 'history') {
        const entries = await ns.Storage.getHistory({ limit: 20 });
        panel.setHistoryEntries(entries);
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} saveHistoryAfterSummary failed`, err && err.message ? err.message : err);
    }
  };

  // Sprint 9 §3.6.4 — produce an abstract + key-points pair via the BYOK
  // cloud route (gemini-2.5-flash-lite). Used when Nano is unavailable or
  // still downloading. Returns { tldr, keyPointsRaw }.
  const runCloudSummary = async (article, apiKey) => {
    const [tldr, keyPointsRaw] = await Promise.all([
      ns.NanoSummarizer.summarizeCloud(article.body, 'tldr', { apiKey }),
      ns.NanoSummarizer.summarizeCloud(article.body, 'key-points', { apiKey }),
    ]);
    return { tldr, keyPointsRaw };
  };

  // Sprint 9 — funnel any thrown summarization error through ErrorClassifier
  // so the user always sees a Japanese, actionable message.
  const showSummaryError = (panel, err, fallbackMessage) => {
    let friendly = null;
    if (ns.ErrorClassifier && typeof ns.ErrorClassifier.friendly === 'function') {
      friendly = ns.ErrorClassifier.friendly(err);
    }
    const message = (friendly && friendly.full)
      || (err && err.message)
      || fallbackMessage
      || '要約を生成できませんでした。ページを再読み込みしてから再度お試しください。';
    panel.setStage('done');
    panel.showSummaryFallback(message);
  };

  const runSummaryWorkflow = async (panel) => {
    // 記事 DOM が遅延描画されるケースを救うため短くリトライする (~1.5s)。
    // 既に成功キャッシュがあればループは即抜ける。
    let article = getArticle();
    for (let attempt = 0; attempt < 6 && (!article || !article.ok); attempt += 1) {
      await new Promise((r) => setTimeout(r, 250));
      article = getArticle();
    }
    if (!article || !article.ok) {
      panel.setStage('error');
      // Sprint 10: 有料境界検出時は専用メッセージを表示する。
      if (article && article.reason === 'paywall-detected') {
        panel.showSummaryFallback(
          'この記事は有料記事のため、無料部分の取得を中止しました。購入後に再度お試しください。'
        );
      } else {
        panel.showSummaryFallback(
          '記事が取得できません。ページを再読み込みしてください。'
        );
      }
      return;
    }

    panel.setStage('analyzing');
    // Provide article context to the panel so prediction/related auto-save can use it.
    if (typeof panel.setArticleContext === 'function') {
      panel.setArticleContext({ url: location.href, title: article.title || document.title });
    }
    const reading = ns.NoteParser.calculateReadingTime(article.body);
    panel.setReadingTime(`${reading.label}・本文 ${ns.NoteParser.countCharacters(article.body)} 字`);

    if (!ns.NanoSummarizer) {
      panel.setStage('done');
      panel.showSummaryFallback('要約モジュールの読み込みに失敗しました。拡張機能を再読み込みしてください。');
      return;
    }

    // Reset Sprint 9 banners from any previous run.
    if (typeof panel.hideSummaryByokNotice === 'function') panel.hideSummaryByokNotice();
    if (typeof panel.hideSummaryDownloadProgress === 'function') panel.hideSummaryDownloadProgress();
    if (typeof panel.setSummaryEngine === 'function') panel.setSummaryEngine(null);

    const availability = await ns.NanoSummarizer.checkAvailability();

    // Read API key once — reused for both fallback paths below.
    let apiKey = null;
    try {
      if (ns.Storage && typeof ns.Storage.getApiKey === 'function') {
        apiKey = await ns.Storage.getApiKey();
      }
    } catch (_) {
      apiKey = null;
    }
    const hasApiKey = typeof apiKey === 'string' && apiKey.trim().length > 0;

    // ---- §3.6.4: Nano not available at all ---------------------------------
    if (
      availability.status === 'unsupported' ||
      availability.status === 'no' ||
      availability.status === 'error'
    ) {
      if (typeof panel.showSummaryByokNotice === 'function') {
        panel.showSummaryByokNotice({ hasApiKey });
      }
      if (!hasApiKey) {
        panel.setStage('done');
        panel.showSummaryFallback(
          'お使いの環境ではローカル AI 機能が利用できません。設定ページで Google AI Studio の API キーを登録すると要約が利用できます。'
        );
        return;
      }
      // BYOK fallback — gemini-2.5-flash-lite.
      panel.setStage('generating');
      try {
        const { tldr, keyPointsRaw } = await runCloudSummary(article, apiKey);
        const keyPoints = parseKeyPointsOutput(keyPointsRaw);
        panel.setSummary(tldr || '');
        panel.setKeyPoints(keyPoints.slice(0, 5));
        if (typeof panel.setSummaryEngine === 'function') panel.setSummaryEngine('cloud');
        panel.setStage('done');
        saveHistoryAfterSummary(panel, article, tldr, keyPoints).catch(() => {});
      } catch (err) {
        console.warn(`${LOG_PREFIX} cloud summary failed`, err && err.message ? err.message : err);
        showSummaryError(panel, err);
      }
      return;
    }

    // ---- §3.6.5: Nano available but model needs to download ----------------
    if (availability.status === 'after-download') {
      if (typeof panel.showSummaryDownloadProgress === 'function') {
        panel.showSummaryDownloadProgress({ hasApiKey });
      }

      // Kick off the Nano summarization with a progress callback. Both calls
      // (tldr + key-points) share the model — Chrome installs it once.
      const onProgress = (loaded, total) => {
        if (typeof panel.setSummaryDownloadProgress === 'function') {
          panel.setSummaryDownloadProgress(loaded, total);
        }
      };

      // If BYOK is configured, run the cloud fallback in parallel so the user
      // gets results immediately. The Nano summary completes in the background
      // and we surface a toast when the model finishes downloading.
      const nanoPromise = (async () => {
        try {
          panel.setStage('generating');
          const [tldr, keyPointsRaw] = await Promise.all([
            ns.NanoSummarizer.summarize(article.body, {
              type: 'tldr',
              length: 'medium',
              outputLanguage: 'ja',
              expectedInputLanguages: ['ja'],
              onProgress,
              sharedContext:
                'これは note.com に投稿された日本語の記事本文です。論文のアブストラクトに近い構成 (背景・主題・主張・根拠・結論) で、要点を漏らさずに読み応えのある日本語の要約を作成してください。出力は必ず日本語のみで、英訳や翻訳は出力しないでください。',
            }),
            ns.NanoSummarizer.summarize(article.body, {
              type: 'key-points',
              length: 'medium',
              outputLanguage: 'ja',
              expectedInputLanguages: ['ja'],
              onProgress,
              sharedContext:
                '日本語の記事から、重要な論点・主張・根拠を 5 個前後の箇条書きで抽出してください。各項目は短く具体的な日本語で書き、英訳は出力しないでください。',
            }),
          ]);
          return { ok: true, tldr, keyPointsRaw };
        } catch (err) {
          return { ok: false, err };
        }
      })();

      if (hasApiKey) {
        // Cloud-first fast path so the user does not have to wait for the
        // Nano download to finish.
        try {
          const { tldr, keyPointsRaw } = await runCloudSummary(article, apiKey);
          const keyPoints = parseKeyPointsOutput(keyPointsRaw);
          panel.setSummary(tldr || '');
          panel.setKeyPoints(keyPoints.slice(0, 5));
          if (typeof panel.setSummaryEngine === 'function') panel.setSummaryEngine('cloud');
          panel.setStage('done');
          saveHistoryAfterSummary(panel, article, tldr, keyPoints).catch(() => {});
        } catch (err) {
          console.warn(`${LOG_PREFIX} cloud-while-downloading failed`, err && err.message ? err.message : err);
          showSummaryError(panel, err);
        }
        // Wait for Nano to finish in the background just to surface the toast
        // and to hide the progress bar. We do NOT overwrite the cloud result.
        nanoPromise.then((res) => {
          if (typeof panel.hideSummaryDownloadProgress === 'function') panel.hideSummaryDownloadProgress();
          if (res && res.ok) {
            if (typeof panel.showToast === 'function') {
              panel.showToast('ローカル AI モデルの準備が完了しました。次回からはローカルで要約します。');
            }
          }
        }).catch(() => {});
        return;
      }

      // No BYOK key — wait for Nano. The progress bar is the user feedback.
      const res = await nanoPromise;
      if (typeof panel.hideSummaryDownloadProgress === 'function') panel.hideSummaryDownloadProgress();
      if (res && res.ok) {
        const keyPoints = parseKeyPointsOutput(res.keyPointsRaw);
        panel.setSummary(res.tldr || '');
        panel.setKeyPoints(keyPoints.slice(0, 5));
        if (typeof panel.setSummaryEngine === 'function') panel.setSummaryEngine('nano');
        panel.setStage('done');
        if (typeof panel.showToast === 'function') {
          panel.showToast('ローカル AI モデルの準備が完了しました。');
        }
        saveHistoryAfterSummary(panel, article, res.tldr, keyPoints).catch(() => {});
      } else {
        showSummaryError(panel, res && res.err);
      }
      return;
    }

    // ---- Default: Nano available and ready ---------------------------------
    panel.setStage('generating');
    try {
      const [tldr, keyPointsRaw] = await Promise.all([
        ns.NanoSummarizer.summarize(article.body, {
          type: 'tldr',
          length: 'medium',
          outputLanguage: 'ja',
          expectedInputLanguages: ['ja'],
          sharedContext:
            'これは note.com に投稿された日本語の記事本文です。論文のアブストラクトに近い構成 (背景・主題・主張・根拠・結論) で、要点を漏らさずに読み応えのある日本語の要約を作成してください。出力は必ず日本語のみで、英訳や翻訳は出力しないでください。',
        }),
        ns.NanoSummarizer.summarize(article.body, {
          type: 'key-points',
          length: 'medium',
          outputLanguage: 'ja',
          expectedInputLanguages: ['ja'],
          sharedContext:
            '日本語の記事から、重要な論点・主張・根拠を 5 個前後の箇条書きで抽出してください。各項目は短く具体的な日本語で書き、英訳は出力しないでください。',
        }),
      ]);
      const keyPoints = parseKeyPointsOutput(keyPointsRaw);
      panel.setSummary(tldr || '');
      panel.setKeyPoints(keyPoints.slice(0, 5));
      if (typeof panel.setSummaryEngine === 'function') panel.setSummaryEngine('nano');
      panel.setStage('done');
      saveHistoryAfterSummary(panel, article, tldr, keyPoints).catch(() => {});
    } catch (err) {
      console.warn(`${LOG_PREFIX} summarization error`, err && err.message ? err.message : err);
      // If Nano errored mid-flight but BYOK is configured, retry on cloud.
      if (hasApiKey) {
        try {
          const { tldr, keyPointsRaw } = await runCloudSummary(article, apiKey);
          const keyPoints = parseKeyPointsOutput(keyPointsRaw);
          panel.setSummary(tldr || '');
          panel.setKeyPoints(keyPoints.slice(0, 5));
          if (typeof panel.setSummaryEngine === 'function') panel.setSummaryEngine('cloud');
          panel.setStage('done');
          saveHistoryAfterSummary(panel, article, tldr, keyPoints).catch(() => {});
          return;
        } catch (cloudErr) {
          showSummaryError(panel, cloudErr);
          return;
        }
      }
      showSummaryError(panel, err);
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

  // note.com is an SPA — navigating to a different article changes the URL via
  // history.pushState without triggering a full page reload, so content.js is
  // not re-executed and the panel keeps showing the previous article's summary
  // / prediction / keywords. Detect URL changes by polling location.href and
  // reset the panel state for each new article.
  let lastSeenUrl = null;
  const SPA_POLL_MS = 600;
  // Wait this long after a URL change before re-extracting the article body,
  // to give the SPA time to swap the article DOM.
  const SPA_RENDER_DELAY_MS = 1500;

  const onSPANavigation = async (oldUrl, newUrl) => {
    console.log(`${LOG_PREFIX} SPA navigation: ${oldUrl} → ${newUrl}`);

    cachedArticle = null;

    if (!panelInstance) return;
    if (typeof panelInstance.resetForNewArticle === 'function') {
      panelInstance.resetForNewArticle();
    }

    // If the panel is open and the new URL is still a note article, refresh
    // the summary automatically so the user sees the new article's content
    // without having to toggle the panel.
    if (!panelInstance.isOpen()) return;
    if (!isNoteArticleUrl(newUrl)) {
      // Non-article page: leave the panel reset to placeholders.
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, SPA_RENDER_DELAY_MS));
    // Bail out if another navigation happened during the wait — that handler
    // will take it from here.
    if (location.href !== newUrl) return;

    panelInstance.markSummaryRan();
    try {
      await runSummaryWorkflow(panelInstance);
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} summary re-run after SPA nav failed`,
        err && err.message ? err.message : err
      );
    }
  };

  const ensureUrlChangeWatcher = () => {
    if (globalThis.__noteAbstractUrlWatcherInstalled) return;
    globalThis.__noteAbstractUrlWatcherInstalled = true;
    lastSeenUrl = location.href;

    setInterval(() => {
      const current = location.href;
      if (current === lastSeenUrl) return;
      const previous = lastSeenUrl;
      lastSeenUrl = current;
      onSPANavigation(previous, current).catch((err) => {
        console.warn(
          `${LOG_PREFIX} onSPANavigation threw`,
          err && err.message ? err.message : err
        );
      });
    }, SPA_POLL_MS);
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
      ensureUrlChangeWatcher();
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
