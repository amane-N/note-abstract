'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const NOTE_SEARCH_BASE = 'https://note.com/search?q=';
  const MAX_BODY_CHARS = 4000;
  const KEYWORD_TIMEOUT_MS = 20000;
  const TARGET_COUNT = 5;

  const truncate = (text) => {
    if (typeof text !== 'string') return '';
    if (text.length <= MAX_BODY_CHARS) return text;
    return `${text.slice(0, MAX_BODY_CHARS)}\n…(以降は省略)`;
  };

  const buildPrompt = (article) => {
    const title = (article && article.title) || '(タイトル不明)';
    const body = truncate((article && article.body) || '');
    return [
      'あなたは note.com の閲覧体験を支援するアシスタントです。以下の記事を読んだユーザーが、関連する記事をさらに探したくなる検索キーワードを提案してください。',
      '',
      '【ルール】',
      '- 必ず日本語のキーワードを 5 個提案する',
      '- 各キーワードは 2〜10 文字程度。検索フィールドにそのまま貼って意味が通る単語/フレーズにする',
      '- 記事タイトルそのものや、汎用すぎる単語 (例: ニュース、考察) は避ける',
      '- 記事本文に登場した重要な概念、関連分野、隣接トピックを優先する',
      '- 出力は JSON 配列のみ。説明文・コードフェンス・前置きは禁止',
      '- フォーマット例: ["キーワード1","キーワード2","キーワード3","キーワード4","キーワード5"]',
      '',
      `【記事タイトル】\n${title}`,
      '',
      '【記事本文】',
      body,
    ].join('\n');
  };

  const stripCodeFence = (text) => {
    if (typeof text !== 'string') return '';
    return text
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
  };

  const tryParseJsonArray = (text) => {
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      // fall through to substring extraction
    }
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {
        // ignore
      }
    }
    return null;
  };

  const fallbackParseLines = (text) => {
    if (!text) return [];
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s\-•・*●○◦▪︎\d.)、,]+/, '').replace(/^["「『]/, '').replace(/["」』]\s*$/, '').trim())
      .filter(Boolean);
  };

  const normalizeKeywords = (rawList) => {
    const seen = new Set();
    const cleaned = [];
    for (const item of rawList) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      if (trimmed.length > 40) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(trimmed);
      if (cleaned.length >= TARGET_COUNT) break;
    }
    return cleaned;
  };

  const buildSearchUrl = (keyword) => `${NOTE_SEARCH_BASE}${encodeURIComponent(keyword)}`;

  const suggestKeywords = async (article, options = {}) => {
    if (!article || article.ok === false) {
      throw new Error('記事の内容を取得できませんでした。ページを再読み込みしてください。');
    }
    if (!ns.GeminiClient) {
      throw new Error('Gemini クライアントが利用できません。拡張機能を再読み込みしてください。');
    }
    if (!ns.Storage) {
      throw new Error('ストレージモジュールが利用できません。拡張機能を再読み込みしてください。');
    }

    const apiKey = options.apiKey || (await ns.Storage.getApiKey());
    if (!apiKey) {
      const err = new Error('Google AI Studio API キーが未設定です。設定タブからキーを登録してください。');
      err.code = 'NO_API_KEY';
      throw err;
    }

    const settings = options.settings || (await ns.Storage.getSettings());
    const model = options.model || settings.model || 'gemini-2.5-flash';

    const prompt = buildPrompt(article);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || KEYWORD_TIMEOUT_MS);

    try {
      const result = await ns.GeminiClient.callGemini(prompt, {
        apiKey,
        model,
        maxRetries: options.maxRetries == null ? 2 : options.maxRetries,
        temperature: options.temperature == null ? 0.5 : options.temperature,
        maxOutputTokens: options.maxOutputTokens || 256,
        signal: controller.signal,
      });

      const cleanedText = stripCodeFence(result.text || '');
      const parsed = tryParseJsonArray(cleanedText) || fallbackParseLines(cleanedText);
      const keywords = normalizeKeywords(parsed);

      if (keywords.length === 0) {
        throw new Error('キーワードを抽出できませんでした。少し時間を置いてから再度お試しください。');
      }

      const items = keywords.map((keyword) => ({
        keyword,
        searchUrl: buildSearchUrl(keyword),
      }));

      return {
        items,
        keywords,
        model: result.model,
        rawText: result.text,
      };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const wrap = new Error('キーワードの生成に時間がかかりすぎたため中止しました。少し待ってから再度お試しください。');
        wrap.code = 'TIMEOUT';
        throw wrap;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  };

  ns.KeywordSuggester = {
    suggestKeywords,
    buildSearchUrl,
    NOTE_SEARCH_BASE,
    TARGET_COUNT,
    _buildPrompt: buildPrompt,
    _normalizeKeywords: normalizeKeywords,
  };
})();
