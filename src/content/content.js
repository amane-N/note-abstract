'use strict';

(() => {
  const LOG_PREFIX = '[note-abstract]';
  const HOST_ELEMENT_ID = 'note-abstract-host';

  const ARTICLE_SELECTORS = {
    title: 'h1.o-noteContentHeader__title',
    body: '.note-common-styles__textnote-body .o-noteContentText',
    paywallMarker: '.o-noteAreaPaymentWall',
  };

  const TITLE_FALLBACKS = [
    'h1.o-noteContentHeader__title',
    'header h1',
    'article h1',
    'h1',
  ];

  const BODY_FALLBACKS = [
    '.note-common-styles__textnote-body .o-noteContentText',
    '.o-noteContentText',
    'article',
  ];

  const isNoteArticleUrl = (url) => /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/.test(url);

  const findFirst = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return { el, selector };
    }
    return null;
  };

  const extractFreeBodyText = (bodyEl) => {
    const clone = bodyEl.cloneNode(true);
    const paywall = clone.querySelector(ARTICLE_SELECTORS.paywallMarker);
    if (paywall) {
      let node = paywall;
      while (node) {
        const next = node.nextSibling;
        node.parentNode.removeChild(node);
        node = next;
      }
    }
    clone.querySelectorAll('.paywall-content').forEach((n) => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const extractArticle = () => {
    const titleHit = findFirst(TITLE_FALLBACKS);
    const bodyHit = findFirst(BODY_FALLBACKS);

    if (!titleHit || !bodyHit) {
      return {
        ok: false,
        reason: !titleHit ? 'title-not-found' : 'body-not-found',
      };
    }

    const title = (titleHit.el.textContent || '').trim();
    const bodyText = extractFreeBodyText(bodyHit.el);

    if (!title || !bodyText) {
      return {
        ok: false,
        reason: !title ? 'title-empty' : 'body-empty',
      };
    }

    return {
      ok: true,
      title,
      bodyLength: bodyText.length,
      bodyPreview: bodyText.slice(0, 80),
      titleSelector: titleHit.selector,
      bodySelector: bodyHit.selector,
    };
  };

  const ensureShadowHost = () => {
    if (document.getElementById(HOST_ELEMENT_ID)) return;
    const host = document.createElement('div');
    host.id = HOST_ELEMENT_ID;
    host.style.all = 'initial';
    host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
  };

  const run = () => {
    if (!isNoteArticleUrl(location.href)) {
      console.log(`${LOG_PREFIX} skipped: not a note article URL (${location.href})`);
      return;
    }

    console.log(`${LOG_PREFIX} content script loaded on ${location.href}`);

    const result = extractArticle();
    if (result.ok) {
      console.log(`${LOG_PREFIX} title: ${result.title}`);
      console.log(
        `${LOG_PREFIX} body extracted: ${result.bodyLength} chars (selector: ${result.bodySelector})`
      );
    } else {
      console.log(`${LOG_PREFIX} extraction failed: ${result.reason}`);
    }

    ensureShadowHost();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
