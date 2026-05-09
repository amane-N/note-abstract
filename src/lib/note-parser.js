'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const SELECTORS = {
    title: 'h1.o-noteContentHeader__title',
    body: '.note-common-styles__textnote-body .o-noteContentText',
    paywallMarker: '.o-noteAreaPaymentWall',
  };

  const TITLE_FALLBACKS = [
    SELECTORS.title,
    // note.com が DOM クラス名を更新したケースを救うフォールバック。
    '[class*="ContentHeader__title"] h1',
    '[class*="contentHeader__title"]',
    'header h1',
    'article h1',
    'main h1',
    'h1',
  ];

  const BODY_FALLBACKS = [
    SELECTORS.body,
    '.o-noteContentText',
    // .o-noteContentText が一部記事で見つからない場合に親要素から拾う。
    '.note-common-styles__textnote-body',
    '[class*="noteContentText"]',
    '[class*="textnote-body"]',
    'article',
    'main',
  ];

  // Sprint 10: 厳格モードで使用する paywall 検出セレクタ。
  // .o-noteAreaPaymentWall は SELECTORS.paywallMarker と重複するが、
  // 厳格モードでは独立してチェックするために明示する。
  const STRICT_PAYWALL_SELECTORS = [
    '.o-noteAreaPaymentWall',
    '[class*="PaymentWall"]',
    '[class*="paymentwall"]',
    '[class*="paywall"]',
    '[class*="paid-area"]',
    '[class*="paidArea"]',
    '[data-testid*="paywall"]',
    '[data-testid*="payment"]',
  ];

  // Sprint 10: 厳格モードで有料境界として検出するテキストマーカー。
  // innerText ではなく textContent をスキャンすることで非表示要素も対象にする。
  const STRICT_TEXT_MARKERS = [
    'ここから先は',
    'この続きをみる',
    '有料記事',
  ];

  const findFirst = (root, selectors) => {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (el) return { el, selector };
    }
    return null;
  };

  /**
   * Sprint 10: 厳格モード専用の paywall 検出。
   * DOM アクセスを最小化するため、bodyEl の cloneNode を行う前に
   * オリジナル root (document) に対して検索する。
   * @param {Document|Element} root
   * @returns {{ detected: boolean, reason?: string }}
   */
  const detectPaywallStrict = (root) => {
    // セレクタベース検出
    for (const selector of STRICT_PAYWALL_SELECTORS) {
      try {
        if (root.querySelector(selector)) {
          return { detected: true, reason: `selector:${selector}` };
        }
      } catch (_) {
        // 無効なセレクタは無視
      }
    }

    // テキストマーカーベース検出 (本文コンテナを対象に絞る)
    const bodyHit = findFirst(root, BODY_FALLBACKS);
    if (bodyHit) {
      const rawText = bodyHit.el.textContent || '';
      for (const marker of STRICT_TEXT_MARKERS) {
        if (rawText.includes(marker)) {
          return { detected: true, reason: `text-marker:${marker}` };
        }
      }
    }

    return { detected: false };
  };

  const stripPaywall = (rootClone) => {
    const paywall = rootClone.querySelector(SELECTORS.paywallMarker);
    if (paywall) {
      let node = paywall;
      while (node && node !== rootClone) {
        let sibling = node.nextSibling;
        while (sibling) {
          const next = sibling.nextSibling;
          sibling.remove();
          sibling = next;
        }
        node = node.parentNode;
      }
      paywall.remove();
    }
    rootClone.querySelectorAll('.paywall-content').forEach((n) => n.remove());
    return rootClone;
  };

  const extractFreeBodyText = (root) => {
    const clone = root.cloneNode(true);
    stripPaywall(clone);
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  };

  /**
   * 記事の本文・タイトルを抽出する。
   *
   * @param {Document|Element} root  - 検索対象ルート (省略時は document)
   * @param {{ strict?: boolean }} [options]
   *   strict: true の場合、有料境界が検出された時点で抽出を中止し
   *           { ok: false, reason: 'paywall-detected' } を返す。
   *           有料部分の DOM へのアクセス自体を防ぐ。
   *           デフォルトは false (後方互換)。
   */
  const extractArticle = (root = document, options = {}) => {
    const strict = !!(options && options.strict);

    // Sprint 10: 厳格モードでは本文を cloneNode する前に paywall を検出し、
    // 有料部分の DOM ノードへのアクセス自体を回避する。
    if (strict) {
      const paywallResult = detectPaywallStrict(root);
      if (paywallResult.detected) {
        return { ok: false, reason: 'paywall-detected', paywallReason: paywallResult.reason };
      }
    }

    const titleHit = findFirst(root, TITLE_FALLBACKS);
    if (!titleHit) return { ok: false, reason: 'title-not-found' };

    const bodyHit = findFirst(root, BODY_FALLBACKS);
    if (!bodyHit) return { ok: false, reason: 'body-not-found' };

    const title = (titleHit.el.textContent || '').trim();
    if (!title) return { ok: false, reason: 'title-empty' };

    const bodyText = extractFreeBodyText(bodyHit.el);
    if (!bodyText) return { ok: false, reason: 'body-empty' };

    const hasPaywall = !!root.querySelector(SELECTORS.paywallMarker);

    return {
      ok: true,
      title,
      body: bodyText,
      hasPaywall,
      titleSelector: titleHit.selector,
      bodySelector: bodyHit.selector,
    };
  };

  const countCharacters = (text) => (text || '').length;

  const calculateReadingTime = (text) => {
    const charsPerMinute = 600;
    const chars = countCharacters(text);
    const minutes = chars === 0 ? 0 : Math.max(1, Math.ceil(chars / charsPerMinute));
    return { minutes, label: minutes === 0 ? '—' : `約 ${minutes} 分` };
  };

  ns.NoteParser = {
    extractArticle,
    countCharacters,
    calculateReadingTime,
    SELECTORS,
    // Sprint 10: テスト用にエクスポート
    detectPaywallStrict,
    STRICT_PAYWALL_SELECTORS,
    STRICT_TEXT_MARKERS,
  };
})();
