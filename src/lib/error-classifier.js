'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const TYPES = Object.freeze({
    NETWORK: 'network',
    RATE_LIMIT: 'rate-limit',
    API_KEY: 'api-key',
    DOM_FETCH: 'dom-fetch',
    NANO_UNSUPPORTED: 'nano-unsupported',
    NANO_DOWNLOADING: 'nano-downloading',
    TIMEOUT: 'timeout',
    QUOTA: 'quota',
    UNKNOWN: 'unknown',
  });

  // Map each type to a user-facing Japanese message + an explicit "next action" line.
  // 禁止語: "Failed", "Error" — メッセージ内では使わない。
  const MESSAGES = Object.freeze({
    [TYPES.NETWORK]: {
      message: '接続を確認してください。',
      action: 'インターネット接続を確認したら、もう一度お試しください。',
    },
    [TYPES.RATE_LIMIT]: {
      message: 'しばらく待ってから再試行してください。',
      action: 'Google AI Studio の無料枠の上限に達した可能性があります。1〜2 分待ってから再度お試しください。',
    },
    [TYPES.API_KEY]: {
      message: '設定ページで API キーを再確認してください。',
      action: '設定ページを開き、Google AI Studio から取得したキーを貼り付け直してください。',
    },
    [TYPES.DOM_FETCH]: {
      message: '記事が取得できません。ページを再読み込みしてください。',
      action: 'ブラウザの再読み込みボタン (F5) で再読み込みしてから、もう一度お試しください。',
    },
    [TYPES.NANO_UNSUPPORTED]: {
      message: 'お使いの環境ではローカル AI 機能が利用できません。',
      action: 'Google AI Studio の無料 API キーを設定すると、すべての機能が利用可能になります。',
    },
    [TYPES.NANO_DOWNLOADING]: {
      message: 'ローカル AI モデルを準備しています。',
      action: 'ダウンロード完了までお待ちください。API キーを設定済みの場合はクラウド経由ですぐに動作します。',
    },
    [TYPES.TIMEOUT]: {
      message: '応答に時間がかかりすぎました。',
      action: '少し時間をおいてから再度お試しください。',
    },
    [TYPES.QUOTA]: {
      message: '本日の利用上限に達しました。',
      action: '時間をおいて再度お試しいただくか、Google AI Studio で利用枠をご確認ください。',
    },
    [TYPES.UNKNOWN]: {
      message: '想定外の問題が発生しました。',
      action: 'ページを再読み込みしてから、もう一度お試しください。',
    },
  });

  // Heuristic classification of any thrown error/string into one of TYPES.
  // Looks at .code, .status, .name, and the message body. Designed to be
  // forgiving — when in doubt, falls through to UNKNOWN.
  const classify = (err) => {
    if (!err) return TYPES.UNKNOWN;

    const code = err.code || (err.cause && err.cause.code) || '';
    const status = typeof err.status === 'number' ? err.status : null;
    const name = err.name || '';
    const raw = (err && err.message) ? String(err.message) : String(err);
    const body = raw.toLowerCase();

    // Direct error code mapping wins (set by gemini-client / predictor / etc.)
    if (code === 'NO_API_KEY') return TYPES.API_KEY;
    if (code === 'NETWORK_ERROR') return TYPES.NETWORK;
    if (code === 'TIMEOUT') return TYPES.TIMEOUT;
    if (code === 'EXHAUSTED') return TYPES.NETWORK;

    // Nano availability codes thrown by nano-summarizer.js
    if (raw === 'SUMMARIZER_UNSUPPORTED') return TYPES.NANO_UNSUPPORTED;
    if (raw === 'SUMMARIZER_DEVICE_INELIGIBLE') return TYPES.NANO_UNSUPPORTED;
    if (raw.startsWith('SUMMARIZER_AVAIL_ERROR')) return TYPES.NANO_UNSUPPORTED;
    if (raw === 'SUMMARIZER_DOWNLOADING') return TYPES.NANO_DOWNLOADING;

    // HTTP status from Gemini.
    if (status === 401 || status === 403) return TYPES.API_KEY;
    if (status === 429) return TYPES.RATE_LIMIT;
    if (status === 408) return TYPES.TIMEOUT;
    if (typeof status === 'number' && status >= 500) return TYPES.NETWORK;

    // AbortError (used by predictor/keyword-suggester after their own timeout).
    if (name === 'AbortError') return TYPES.TIMEOUT;

    // Fallback substring sniffing — must be conservative because the UI
    // strings produced by gemini-client are also Japanese.
    if (
      body.includes('failed to fetch') ||
      body.includes('networkerror') ||
      body.includes('ネットワーク') ||
      body.includes('接続')
    ) return TYPES.NETWORK;
    if (
      body.includes('api key') ||
      body.includes('api キー') ||
      body.includes('apiキー') ||
      body.includes('権限')
    ) return TYPES.API_KEY;
    if (body.includes('quota') || body.includes('上限')) return TYPES.QUOTA;
    if (body.includes('rate') || body.includes('再試行') || body.includes('再度お試し')) {
      // Be careful: many fallback messages end with "再度お試しください" — only
      // treat as rate-limit if the original message hints at rate limiting.
      if (body.includes('rate') || body.includes('再試行')) return TYPES.RATE_LIMIT;
    }
    if (body.includes('記事') && (body.includes('取得') || body.includes('読み込'))) return TYPES.DOM_FETCH;
    if (body.includes('timeout') || body.includes('時間がかかり')) return TYPES.TIMEOUT;

    return TYPES.UNKNOWN;
  };

  // Returns a user-facing payload for the given error.
  // {
  //   type: 'network' | ...,
  //   message: '接続を確認してください。',
  //   action: '次にやることの一文',
  //   full: 'message + action joined',
  // }
  // The caller can decide whether to render `message`, `action`, or both.
  const friendly = (err) => {
    const type = classify(err);
    const tpl = MESSAGES[type] || MESSAGES[TYPES.UNKNOWN];
    return {
      type,
      message: tpl.message,
      action: tpl.action,
      full: `${tpl.message} ${tpl.action}`.trim(),
    };
  };

  // Convenience: wrap an arbitrary thrown value into a new Error whose
  // .message is the friendly text. Preserves the original on .cause and .type.
  const wrap = (err) => {
    const f = friendly(err);
    const out = new Error(f.full);
    out.type = f.type;
    out.userMessage = f.message;
    out.userAction = f.action;
    out.cause = err;
    return out;
  };

  ns.ErrorClassifier = {
    TYPES,
    MESSAGES,
    classify,
    friendly,
    wrap,
  };
})();
