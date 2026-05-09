'use strict';

// Exporter module — converts a history-entry-shaped object into one of three
// destination formats (Obsidian / Notion / note draft) and copies the result
// to the system clipboard. The entry shape mirrors §3.3 of the master spec:
//
//   { url, title, createdAt, summary, keyPoints[], prediction, keywords[], templateId }
//
// All fields are optional; any missing field is simply omitted from the output.
//
// IMPORTANT (NEVER 1 / NEVER 4): the caller is responsible for ensuring that
// `summary`, `prediction`, etc. were derived only from the *free* portion of
// the article body. This module trusts whatever it is given — there is no
// extra paywall guard here. The free-only enforcement happens upstream in
// note-parser.js (paywall stripping) and the upstream summarization layer.
//
// NEVER 6 (no telemetry): this module performs zero network I/O. The only
// external side effect is `navigator.clipboard.writeText`.
(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  // ---------------------------------------------------------------------------
  // YAML escaping for frontmatter scalars. We always emit double-quoted strings
  // so we only have to escape `\` and `"`.
  // ---------------------------------------------------------------------------
  const escYaml = (value) => {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  };

  const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

  const safeArray = (v) => (Array.isArray(v) ? v.filter(isNonEmptyString) : []);

  const formatCreatedAt = (entry) => {
    if (!entry) return new Date().toISOString();
    const c = entry.createdAt;
    if (typeof c === 'number') return new Date(c).toISOString();
    if (typeof c === 'string' && c) return c;
    return new Date().toISOString();
  };

  // ---------------------------------------------------------------------------
  // toObsidian: YAML frontmatter + Markdown body.
  // Always emits at least 4 frontmatter keys (title / url / created / source)
  // so the output passes the §6 Sprint 8 acceptance check ("YAML 4 項目以上").
  // ---------------------------------------------------------------------------
  const toObsidian = (entry) => {
    const e = entry || {};
    const created = formatCreatedAt(e);
    const title = isNonEmptyString(e.title) ? e.title : '(無題)';
    const url = isNonEmptyString(e.url) ? e.url : '';
    const tags = ['note-abstract', ...safeArray(e.keywords)];

    const lines = [];
    lines.push('---');
    lines.push(`title: ${escYaml(title)}`);
    lines.push(`url: ${escYaml(url)}`);
    lines.push(`created: ${escYaml(created)}`);
    lines.push('source: "note.com"');
    if (isNonEmptyString(e.templateId)) {
      lines.push(`templateId: ${escYaml(e.templateId)}`);
    }
    lines.push('tags:');
    tags.forEach((t) => lines.push(`  - ${escYaml(t)}`));
    lines.push('---');
    lines.push('');
    lines.push(`# ${title}`);
    lines.push('');

    if (isNonEmptyString(e.summary)) {
      lines.push('## アブストラクト');
      lines.push('');
      lines.push(e.summary.trim());
      lines.push('');
    }

    const kp = safeArray(e.keyPoints);
    if (kp.length > 0) {
      lines.push('## キーポイント');
      lines.push('');
      kp.forEach((p) => lines.push(`- ${p}`));
      lines.push('');
    }

    if (isNonEmptyString(e.prediction)) {
      lines.push('## 予測・含意');
      lines.push('');
      lines.push(e.prediction.trim());
      lines.push('');
    }

    const kw = safeArray(e.keywords);
    if (kw.length > 0) {
      lines.push('## 関連キーワード');
      lines.push('');
      kw.forEach((k) => lines.push(`- ${k}`));
      lines.push('');
    }

    if (url) {
      lines.push(`[元記事を開く](${url})`);
      lines.push('');
    }

    return lines.join('\n');
  };

  // ---------------------------------------------------------------------------
  // toNotion: Markdown that is friendly to Notion's Web Clipper / paste-as-md.
  // Notion accepts standard Markdown headings, bullet lists, and quote blocks
  // when text is pasted into a page, so we emit plain Markdown without YAML
  // frontmatter (Notion does not parse frontmatter).
  // ---------------------------------------------------------------------------
  const toNotion = (entry) => {
    const e = entry || {};
    const title = isNonEmptyString(e.title) ? e.title : '(無題)';
    const url = isNonEmptyString(e.url) ? e.url : '';
    const created = formatCreatedAt(e);

    const lines = [];
    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`> Source: ${url || '(URL なし)'}`);
    lines.push(`> Captured: ${created}`);
    if (isNonEmptyString(e.templateId)) {
      lines.push(`> Template: ${e.templateId}`);
    }
    lines.push('');

    if (isNonEmptyString(e.summary)) {
      lines.push('## アブストラクト');
      lines.push('');
      lines.push(e.summary.trim());
      lines.push('');
    }

    const kp = safeArray(e.keyPoints);
    if (kp.length > 0) {
      lines.push('## キーポイント');
      lines.push('');
      kp.forEach((p) => lines.push(`- ${p}`));
      lines.push('');
    }

    if (isNonEmptyString(e.prediction)) {
      lines.push('## 予測・含意');
      lines.push('');
      lines.push(e.prediction.trim());
      lines.push('');
    }

    const kw = safeArray(e.keywords);
    if (kw.length > 0) {
      lines.push('## 関連キーワード');
      lines.push('');
      kw.forEach((k) => lines.push(`- ${k}`));
      lines.push('');
    }

    return lines.join('\n');
  };

  // ---------------------------------------------------------------------------
  // toNoteDraft: plain text suitable for pasting into the note.com new-post
  // editor. Uses note's familiar bullet glyphs (・) and an explicit URL quote.
  // ---------------------------------------------------------------------------
  const toNoteDraft = (entry) => {
    const e = entry || {};
    const title = isNonEmptyString(e.title) ? e.title : '(無題)';
    const url = isNonEmptyString(e.url) ? e.url : '';

    const lines = [];
    lines.push(`【${title} のアブストラクト】`);
    lines.push('');

    if (isNonEmptyString(e.summary)) {
      lines.push(e.summary.trim());
      lines.push('');
    }

    const kp = safeArray(e.keyPoints);
    if (kp.length > 0) {
      lines.push('▼ キーポイント');
      kp.forEach((p) => lines.push(`・${p}`));
      lines.push('');
    }

    if (isNonEmptyString(e.prediction)) {
      lines.push('▼ 予測・含意');
      lines.push(e.prediction.trim());
      lines.push('');
    }

    const kw = safeArray(e.keywords);
    if (kw.length > 0) {
      lines.push('▼ 関連キーワード');
      lines.push(kw.join(' / '));
      lines.push('');
    }

    if (url) {
      lines.push('> 元記事:');
      lines.push(`> ${url}`);
      lines.push('');
    }

    lines.push('— note アブストラクトで生成');
    return lines.join('\n');
  };

  // ---------------------------------------------------------------------------
  // copyToClipboard: prefers the async Clipboard API (which works in Shadow DOM
  // content-script context as long as the click handler is the active gesture);
  // falls back to a hidden <textarea> + execCommand path on environments where
  // the async API is missing or denied.
  // ---------------------------------------------------------------------------
  const copyToClipboard = async (text) => {
    const value = typeof text === 'string' ? text : String(text || '');
    try {
      if (typeof navigator !== 'undefined'
        && navigator.clipboard
        && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {
      // fall through to textarea fallback
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  };

  ns.Exporter = {
    toObsidian,
    toNotion,
    toNoteDraft,
    copyToClipboard,
    // Exposed for unit tests / call sites that need the raw helpers.
    _internals: { escYaml, formatCreatedAt },
  };
})();
