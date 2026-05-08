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
    'header h1',
    'article h1',
    'h1',
  ];

  const BODY_FALLBACKS = [
    SELECTORS.body,
    '.o-noteContentText',
    'article',
  ];

  const findFirst = (root, selectors) => {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (el) return { el, selector };
    }
    return null;
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

  const extractArticle = (root = document) => {
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
  };
})();
