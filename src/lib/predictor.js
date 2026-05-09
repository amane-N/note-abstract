'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const TEMPLATES_PATH = 'src/templates/prompts.json';
  const DEFAULT_TEMPLATE_ID = 'standard';
  const MAX_BODY_CHARS = 6000;
  const PREDICTION_TIMEOUT_MS = 30000;

  let cachedTemplates = null;
  let templatesPromise = null;

  const loadTemplates = async () => {
    if (cachedTemplates) return cachedTemplates;
    if (templatesPromise) return templatesPromise;

    templatesPromise = (async () => {
      if (!chrome || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
        throw new Error('テンプレート定義を読み込めませんでした (拡張機能ランタイム未初期化)。');
      }
      const url = chrome.runtime.getURL(TEMPLATES_PATH);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('テンプレート定義の取得に失敗しました。拡張機能を再読み込みしてください。');
      }
      const json = await response.json();
      if (!json || !Array.isArray(json.templates) || json.templates.length === 0) {
        throw new Error('テンプレート定義が壊れています。拡張機能を再インストールしてください。');
      }
      cachedTemplates = json.templates;
      return cachedTemplates;
    })().catch((err) => {
      templatesPromise = null;
      throw err;
    });

    return templatesPromise;
  };

  const getTemplates = async () => {
    const list = await loadTemplates();
    return list.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      tier: t.tier,
      outputSections: Array.isArray(t.outputSections) ? t.outputSections.slice() : [],
    }));
  };

  const findTemplate = (templates, templateId) => {
    const fallback = templates.find((t) => t.id === DEFAULT_TEMPLATE_ID) || templates[0];
    if (!templateId) return fallback;
    const match = templates.find((t) => t.id === templateId);
    return match || fallback;
  };

  const truncateBody = (text) => {
    if (typeof text !== 'string') return '';
    if (text.length <= MAX_BODY_CHARS) return text;
    return `${text.slice(0, MAX_BODY_CHARS)}\n…(以降は分量制限のため省略)`;
  };

  const buildPrompt = (template, article) => {
    const title = (article && article.title) || '(タイトル不明)';
    const body = truncateBody((article && article.body) || '');
    const sections = template.outputSections || [];
    const numbered = sections.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const sectionHeaders = sections
      .map((s) => `## ${s}\n(このセクションの本文を 2〜4 文で書く)`)
      .join('\n\n');

    return [
      template.promptPrefix,
      '',
      '以下の note 記事を読み、指定された 3 つのセクション構造で批判的分析を作成してください。',
      '',
      '【出力ルール】',
      `- 必ず以下の 3 セクションをこの順序で出力する: ${sections.join(' / ')}`,
      '- 各セクションは Markdown 見出し ## で始める',
      '- 各セクション本文は日本語で 2〜4 文程度。冗長な前置きは不要',
      '- 推測と事実は語尾で区別する (例: 「〜と推測される」「〜と確認できる」)',
      '- 引用や URL のフェイクは出さない。記事内容に根拠がない場合はその旨を明示する',
      '',
      '【セクション一覧】',
      numbered,
      '',
      '【出力フォーマット】',
      sectionHeaders,
      '',
      `【記事タイトル】\n${title}`,
      '',
      '【記事本文】',
      body,
    ].join('\n');
  };

  const parseSections = (text, expectedSections) => {
    const result = {};
    if (typeof text !== 'string' || !text.trim()) {
      expectedSections.forEach((name) => {
        result[name] = '';
      });
      return result;
    }

    const lines = text.split(/\r?\n/);
    let currentName = null;
    let currentBuf = [];

    const flush = () => {
      if (currentName === null) return;
      result[currentName] = currentBuf.join('\n').trim();
    };

    const headingRe = /^\s*#{1,6}\s*(.+?)\s*$/;
    const matchSection = (heading) => {
      const trimmed = heading.replace(/[*\s:：。]+$/, '').trim();
      const direct = expectedSections.find((s) => trimmed === s);
      if (direct) return direct;
      const partial = expectedSections.find(
        (s) => trimmed.includes(s) || s.includes(trimmed)
      );
      return partial || null;
    };

    for (const line of lines) {
      const m = line.match(headingRe);
      if (m) {
        const target = matchSection(m[1]);
        if (target) {
          flush();
          currentName = target;
          currentBuf = [];
          continue;
        }
      }
      if (currentName !== null) {
        currentBuf.push(line);
      }
    }
    flush();

    expectedSections.forEach((name) => {
      if (!Object.prototype.hasOwnProperty.call(result, name)) {
        result[name] = '';
      }
    });
    return result;
  };

  const generatePrediction = async (article, templateId, options = {}) => {
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

    const templates = await loadTemplates();
    const template = findTemplate(templates, templateId);
    const prompt = buildPrompt(template, article);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || PREDICTION_TIMEOUT_MS);

    try {
      const result = await ns.GeminiClient.callGemini(prompt, {
        apiKey,
        model,
        maxRetries: options.maxRetries == null ? 2 : options.maxRetries,
        temperature: options.temperature == null ? 0.4 : options.temperature,
        maxOutputTokens: options.maxOutputTokens || 1200,
        signal: controller.signal,
      });

      const sections = parseSections(result.text, template.outputSections);
      return {
        templateId: template.id,
        templateName: template.name,
        sections,
        rawText: result.text,
        model: result.model,
      };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const wrap = new Error('予測の生成に時間がかかりすぎたため中止しました。少し待ってから再度お試しください。');
        wrap.code = 'TIMEOUT';
        throw wrap;
      }
      // Sprint 9: route through ErrorClassifier so the surfaced message always
      // tells the user what to do next. Preserve the original on .cause so the
      // panel can still inspect the type.
      if (ns.ErrorClassifier && typeof ns.ErrorClassifier.wrap === 'function') {
        throw ns.ErrorClassifier.wrap(err);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  };

  ns.Predictor = {
    generatePrediction,
    getTemplates,
    DEFAULT_TEMPLATE_ID,
    _loadTemplates: loadTemplates,
    _parseSections: parseSections,
    _buildPrompt: buildPrompt,
  };
})();
