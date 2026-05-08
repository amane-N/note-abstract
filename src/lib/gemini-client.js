'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  const DEFAULT_MODEL = 'gemini-2.5-flash';
  const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const friendlyMessage = (status, fallback) => {
    if (status === 400) {
      return 'リクエスト内容に問題があります。プロンプトを見直してから再度お試しください。';
    }
    if (status === 401 || status === 403) {
      return 'API キーが無効か、必要な権限がありません。設定ページからキーを再入力してください。';
    }
    if (status === 404) {
      return '指定したモデルが見つかりません。設定ページでモデルを確認してください。';
    }
    if (status === 429) {
      return 'リクエスト数の上限に達しました。少し時間を空けてから再度お試しください。';
    }
    if (typeof status === 'number' && status >= 500) {
      return 'Gemini API 側でエラーが発生しています。しばらく待ってから再度お試しください。';
    }
    return fallback || '通信に失敗しました。ネットワーク接続を確認して再度お試しください。';
  };

  const buildRequestBody = (prompt, { systemInstruction, temperature, maxOutputTokens }) => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };
    if (systemInstruction && typeof systemInstruction === 'string') {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    const generationConfig = {};
    if (typeof temperature === 'number') generationConfig.temperature = temperature;
    if (typeof maxOutputTokens === 'number') generationConfig.maxOutputTokens = maxOutputTokens;
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }
    return body;
  };

  const extractText = (json) => {
    const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content
      && json.candidates[0].content.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
  };

  const callGemini = async (prompt, options = {}) => {
    const {
      apiKey,
      model = DEFAULT_MODEL,
      maxRetries = 3,
      temperature,
      maxOutputTokens,
      systemInstruction,
      signal,
    } = options;

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      const err = new Error('API キーが設定されていません。設定ページから入力してください。');
      err.code = 'NO_API_KEY';
      throw err;
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      const err = new Error('プロンプトが空です。テキストを入力してから再度お試しください。');
      err.code = 'EMPTY_PROMPT';
      throw err;
    }

    const targetModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
    const url = `${ENDPOINT_BASE}/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const requestBody = buildRequestBody(prompt, { systemInstruction, temperature, maxOutputTokens });

    let lastNetworkError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal,
        });
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        lastNetworkError = err;
        if (attempt < maxRetries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        const wrap = new Error('ネットワーク接続に失敗しました。インターネット接続を確認して再度お試しください。');
        wrap.code = 'NETWORK_ERROR';
        wrap.cause = err;
        throw wrap;
      }

      if (response.ok) {
        let json = null;
        try {
          json = await response.json();
        } catch (err) {
          const wrap = new Error('Gemini API のレスポンスを解析できませんでした。');
          wrap.code = 'PARSE_ERROR';
          wrap.cause = err;
          throw wrap;
        }
        return { text: extractText(json), raw: json, model: targetModel };
      }

      const shouldRetry =
        (response.status === 429 || response.status >= 500) && attempt < maxRetries;

      if (shouldRetry) {
        await sleep(500 * 2 ** attempt);
        continue;
      }

      let errBody = '';
      try {
        errBody = await response.text();
      } catch (_) {
        errBody = '';
      }
      const message = friendlyMessage(response.status);
      const err = new Error(message);
      err.code = 'HTTP_ERROR';
      err.status = response.status;
      err.body = errBody;
      throw err;
    }

    const fallback = new Error('Gemini API への接続に失敗しました。時間をおいて再度お試しください。');
    fallback.code = 'EXHAUSTED';
    fallback.cause = lastNetworkError;
    throw fallback;
  };

  const validateApiKey = async (apiKey, options = {}) => {
    try {
      const result = await callGemini('ping', {
        apiKey,
        model: 'gemini-2.5-flash-lite',
        maxRetries: 0,
        maxOutputTokens: 8,
        ...options,
      });
      return { ok: true, text: result.text };
    } catch (err) {
      return {
        ok: false,
        message: err && err.message ? err.message : '不明なエラーが発生しました。',
        code: err && err.code,
        status: err && err.status,
      };
    }
  };

  ns.GeminiClient = {
    callGemini,
    validateApiKey,
    ALLOWED_MODELS: Array.from(ALLOWED_MODELS),
    DEFAULT_MODEL,
  };
})();
