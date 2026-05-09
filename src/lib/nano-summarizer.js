'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const checkAvailability = async () => {
    try {
      if (typeof self === 'undefined' || !('Summarizer' in self)) {
        return { status: 'unsupported' };
      }
      const raw = await self.Summarizer.availability();
      const value = typeof raw === 'string' ? raw : raw && raw.available;
      return { status: value || 'unknown' };
    } catch (err) {
      return {
        status: 'error',
        reason: err && err.message ? err.message : String(err),
      };
    }
  };

  const summarize = async (text, options = {}) => {
    const {
      type = 'tldr',
      length = 'short',
      format = 'plain-text',
      // Default to Japanese output. note.com is a Japanese-language platform, and
      // without this hint the Built-in Summarizer logs a warning and may emit
      // English summaries. Callers can still override per request.
      outputLanguage = 'ja',
      expectedInputLanguages,
      sharedContext,
      onProgress,
    } = options;

    if (!text || !text.trim()) {
      throw new Error('SUMMARIZER_EMPTY_INPUT');
    }

    const availability = await checkAvailability();
    switch (availability.status) {
      case 'unsupported':
        throw new Error('SUMMARIZER_UNSUPPORTED');
      case 'no':
        throw new Error('SUMMARIZER_DEVICE_INELIGIBLE');
      case 'error':
        throw new Error(`SUMMARIZER_AVAIL_ERROR:${availability.reason || 'unknown'}`);
      default:
        break;
    }

    const createOptions = { type, length, format, outputLanguage };
    if (Array.isArray(expectedInputLanguages) && expectedInputLanguages.length > 0) {
      createOptions.expectedInputLanguages = expectedInputLanguages;
    }
    if (typeof sharedContext === 'string' && sharedContext.trim()) {
      createOptions.sharedContext = sharedContext;
    }
    if (availability.status === 'after-download' && typeof onProgress === 'function') {
      createOptions.monitor = (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          try {
            onProgress(event.loaded ?? 0, event.total ?? 1);
          } catch (_) {
            // Progress callback failures must never abort summarization.
          }
        });
      };
    }

    const summarizer = await self.Summarizer.create(createOptions);
    try {
      return await summarizer.summarize(text);
    } finally {
      if (summarizer && typeof summarizer.destroy === 'function') {
        try {
          summarizer.destroy();
        } catch (_) {
          // ignore destroy errors
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Sprint 9 §3.6.4 — cloud fallback when Built-in Summarizer is unavailable.
  //
  // summarizeCloud(text, kind, { apiKey, model }) → Promise<string>
  //   kind: 'tldr' | 'key-points'
  //   model: defaults to 'gemini-2.5-flash-lite' to keep BYOK cost minimal.
  // Throws the same kind of error the Gemini client would throw, so callers can
  // funnel everything through ErrorClassifier.
  // ---------------------------------------------------------------------------

  const MAX_BODY_CHARS = 6000;

  const truncateBody = (text) => {
    if (typeof text !== 'string') return '';
    if (text.length <= MAX_BODY_CHARS) return text;
    return `${text.slice(0, MAX_BODY_CHARS)}\n…(以降は分量制限のため省略)`;
  };

  const buildCloudPrompt = (text, kind) => {
    const body = truncateBody(text);
    if (kind === 'key-points') {
      return [
        'あなたは note.com の日本語記事を読んだ読者を支援するアシスタントです。',
        '以下の記事から重要な論点・主張・根拠を 5 個前後の箇条書きで抽出してください。',
        '',
        '【出力ルール】',
        '- 必ず日本語で出力する',
        '- 各項目は 1 行・短く具体的に書く',
        '- 各項目の先頭には「- 」を付けない (純粋なテキストのみ)',
        '- 行ごとに改行で区切り、5 行を目安に',
        '- 前置きや見出し、コードフェンスは禁止',
        '',
        '【記事本文】',
        body,
      ].join('\n');
    }
    // Default: TLDR / abstract style.
    return [
      'あなたは note.com の日本語記事を要約するアシスタントです。',
      '次の記事を、論文のアブストラクトに近い構成 (背景・主題・主張・根拠・結論) で日本語に要約してください。',
      '',
      '【出力ルール】',
      '- 必ず日本語のみで 200〜400 文字程度に要約する',
      '- 翻訳・英訳は出力しない',
      '- 見出しや箇条書きは使わず、自然な段落 1〜2 個で出力する',
      '- 前置き (「以下が要約です」など) は不要',
      '',
      '【記事本文】',
      body,
    ].join('\n');
  };

  const summarizeCloud = async (text, kind = 'tldr', options = {}) => {
    if (!text || !text.trim()) {
      throw new Error('SUMMARIZER_EMPTY_INPUT');
    }
    if (!ns.GeminiClient) {
      const err = new Error('Gemini クライアントが利用できません。拡張機能を再読み込みしてください。');
      err.code = 'CLIENT_MISSING';
      throw err;
    }
    const apiKey = options.apiKey;
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      const err = new Error('Google AI Studio API キーが未設定です。設定タブからキーを登録してください。');
      err.code = 'NO_API_KEY';
      throw err;
    }
    const model = options.model || 'gemini-2.5-flash-lite';
    const prompt = buildCloudPrompt(text, kind);

    const result = await ns.GeminiClient.callGemini(prompt, {
      apiKey,
      model,
      maxRetries: options.maxRetries == null ? 1 : options.maxRetries,
      temperature: options.temperature == null ? 0.3 : options.temperature,
      maxOutputTokens: options.maxOutputTokens || (kind === 'key-points' ? 400 : 800),
      signal: options.signal,
    });
    return (result && typeof result.text === 'string') ? result.text.trim() : '';
  };

  ns.NanoSummarizer = {
    checkAvailability,
    summarize,
    summarizeCloud,
    _buildCloudPrompt: buildCloudPrompt,
  };
})();
