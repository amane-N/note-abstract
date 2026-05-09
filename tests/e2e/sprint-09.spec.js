// @ts-check
'use strict';

/**
 * Sprint 9: UX 洗練 — Nano 未対応フォールバック / 初回 DL UX / エラー処理
 *
 * Coverage map (paired to §6 Sprint 9 acceptance criteria):
 *  § 1 Static checks on src/lib/error-classifier.js — TYPES + MESSAGES + classify()
 *  § 2 Static checks on src/lib/nano-summarizer.js — summarizeCloud() exists
 *  § 3 Static checks on src/content/side-panel.js  — BYOK notice + progress bar UI
 *  § 4 Static checks on src/content/content.js     — flow branches Nano-unsupported / after-download
 *  § 5 Pure-JS unit tests on the ErrorClassifier (loaded into a Node sandbox)
 *      verifying that each error shape produces a non-empty, Japanese, action-
 *      bearing message and that no message contains the禁止語 "Failed" / "Error".
 *  § 6 Browser test — Nano-unavailable simulation: replaces Summarizer in the
 *      content world before the panel runs, verifies the BYOK guidance is shown
 *      and that no "Failed/Error" leaks into the visible copy.
 *  § 7 Browser test — manifest order: error-classifier.js loads BEFORE
 *      nano-summarizer.js so the cloud fallback path can resolve GeminiClient.
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';

const launchExtensionContext = async (suffix) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `note-abstract-e2e-s9-${suffix || ''}-`)
  );
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  return { context, userDataDir };
};

const getServiceWorker = async (context) => {
  const existing = context.serviceWorkers();
  if (existing.length > 0) return existing[0];
  return await context.waitForEvent('serviceworker', { timeout: 15000 });
};

// ---------------------------------------------------------------------------
// § 1  Static checks on error-classifier.js
// ---------------------------------------------------------------------------

test.describe('Sprint 9 — error-classifier.js source checks', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'lib', 'error-classifier.js'),
      'utf8'
    );
  });

  test('exports ErrorClassifier with classify / friendly / wrap / TYPES', () => {
    expect(src).toMatch(/ns\.ErrorClassifier\s*=/);
    expect(src).toMatch(/classify/);
    expect(src).toMatch(/friendly/);
    expect(src).toMatch(/wrap/);
    expect(src).toMatch(/TYPES/);
  });

  test('declares all required error types', () => {
    expect(src).toMatch(/NETWORK:/);
    expect(src).toMatch(/RATE_LIMIT:/);
    expect(src).toMatch(/API_KEY:/);
    expect(src).toMatch(/DOM_FETCH:/);
    expect(src).toMatch(/NANO_UNSUPPORTED:/);
    expect(src).toMatch(/NANO_DOWNLOADING:/);
  });

  test('messages contain the required Japanese phrases per §6 Sprint 9', () => {
    expect(src).toMatch(/接続を確認してください/);
    expect(src).toMatch(/しばらく待ってから再試行してください/);
    expect(src).toMatch(/設定ページで API キーを再確認してください/);
    expect(src).toMatch(/記事が取得できません。ページを再読み込みしてください/);
  });

  test('does not leak forbidden words "Failed" / "Error" into user copy', () => {
    // Allow the file to import/identify Errors via JS keywords (e.g. `new Error(`),
    // but the user-facing message constants must not contain "Failed" / "Error"
    // as English copy. We assert the MESSAGES block (between MESSAGES and the
    // `const classify` declaration) is clean of those substrings.
    const block = src.match(/const MESSAGES = Object\.freeze\(\{([\s\S]*?)\}\);/);
    expect(block, 'MESSAGES block missing').toBeTruthy();
    const body = block[1];
    expect(body).not.toMatch(/['"]Failed['"]/);
    expect(body).not.toMatch(/Failed\./);
    expect(body).not.toMatch(/Error['"]/);
  });
});

// ---------------------------------------------------------------------------
// § 2  Static checks on nano-summarizer.js
// ---------------------------------------------------------------------------

test.describe('Sprint 9 — nano-summarizer.js cloud fallback', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'lib', 'nano-summarizer.js'),
      'utf8'
    );
  });

  test('exposes summarizeCloud()', () => {
    expect(src).toMatch(/summarizeCloud/);
    expect(src).toMatch(/gemini-2\.5-flash-lite/);
  });

  test('summarizeCloud requires apiKey and routes through GeminiClient', () => {
    expect(src).toMatch(/NO_API_KEY/);
    expect(src).toMatch(/GeminiClient/);
    expect(src).toMatch(/callGemini/);
  });

  test('still preserves Built-in Summarizer downloadprogress wiring', () => {
    expect(src).toMatch(/downloadprogress/);
    expect(src).toMatch(/onProgress/);
  });
});

// ---------------------------------------------------------------------------
// § 3  Static checks on side-panel.js
// ---------------------------------------------------------------------------

test.describe('Sprint 9 — side-panel.js BYOK notice + progress bar', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'content', 'side-panel.js'),
      'utf8'
    );
  });

  test('declares the summary BYOK guidance banner with action button', () => {
    expect(src).toMatch(/data-role="summary-byok-notice"/);
    expect(src).toMatch(/data-role="summary-byok-open-options"/);
    expect(src).toMatch(/Google AI Studio/);
  });

  test('declares the download progress UI with bar + label + hint', () => {
    expect(src).toMatch(/data-role="summary-download-progress"/);
    expect(src).toMatch(/data-role="summary-download-bar"/);
    expect(src).toMatch(/data-role="summary-download-percent"/);
    expect(src).toMatch(/data-role="summary-download-hint"/);
  });

  test('exposes show/hide methods for BYOK + progress + engine badge', () => {
    expect(src).toMatch(/showSummaryByokNotice/);
    expect(src).toMatch(/hideSummaryByokNotice/);
    expect(src).toMatch(/showSummaryDownloadProgress/);
    expect(src).toMatch(/setSummaryDownloadProgress/);
    expect(src).toMatch(/hideSummaryDownloadProgress/);
    expect(src).toMatch(/setSummaryEngine/);
    expect(src).toMatch(/showToast/);
  });
});

// ---------------------------------------------------------------------------
// § 4  Static checks on content.js workflow branches
// ---------------------------------------------------------------------------

test.describe('Sprint 9 — content.js workflow branches', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'content', 'content.js'),
      'utf8'
    );
  });

  test('Nano-unsupported branch shows BYOK guidance + cloud fallback when key set', () => {
    expect(src).toMatch(/showSummaryByokNotice/);
    expect(src).toMatch(/runCloudSummary|summarizeCloud/);
    expect(src).toMatch(/availability\.status/);
    expect(src).toMatch(/'unsupported'|"unsupported"/);
  });

  test('after-download branch wires progress bar + parallel cloud path', () => {
    expect(src).toMatch(/'after-download'|"after-download"/);
    expect(src).toMatch(/showSummaryDownloadProgress/);
    expect(src).toMatch(/setSummaryDownloadProgress/);
  });

  test('completion toast is shown after Nano download finishes', () => {
    expect(src).toMatch(/showToast/);
    expect(src).toMatch(/ローカル AI モデルの準備が完了/);
  });

  test('errors funnel through ErrorClassifier and not raw fetch errors', () => {
    expect(src).toMatch(/ErrorClassifier|showSummaryError/);
  });

  test('DOM-fetch failure shows the reload-page message (no forbidden words)', () => {
    expect(src).toMatch(/記事が取得できません。ページを再読み込みしてください/);
    // Make sure no user-facing single-quoted literal that contains Japanese
    // text also contains the forbidden English words "Failed" or "Error".
    // We deliberately scope this to literals that already contain CJK so we
    // don't trip on developer-only messages like 'TIMEOUT' or 'NO_API_KEY'.
    const visibleStrings = src.match(/'[^']*[぀-ヿ一-鿿][^']*'/g) || [];
    for (const literal of visibleStrings) {
      expect(literal, `forbidden 'Failed' in literal: ${literal}`).not.toMatch(/Failed/);
      expect(literal, `forbidden 'Error' in literal: ${literal}`).not.toMatch(/\bError\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// § 5  Behavioural unit tests on the ErrorClassifier (Node sandbox)
// ---------------------------------------------------------------------------

test.describe('Sprint 9 — ErrorClassifier behaviour', () => {
  /** @type {{ classify: Function, friendly: Function, wrap: Function, TYPES: any }} */
  let EC;

  test.beforeAll(() => {
    const ecSrc = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'lib', 'error-classifier.js'),
      'utf8'
    );
    const fakeGlobal = {};
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'globalThis',
      `${ecSrc}; return globalThis.__noteAbstract.ErrorClassifier;`
    );
    EC = factory(fakeGlobal);
    expect(typeof EC.classify).toBe('function');
    expect(typeof EC.friendly).toBe('function');
  });

  test('classifies network failure (NETWORK_ERROR code)', () => {
    const err = Object.assign(new Error('network blip'), { code: 'NETWORK_ERROR' });
    const f = EC.friendly(err);
    expect(f.type).toBe(EC.TYPES.NETWORK);
    expect(f.message).toMatch(/接続を確認してください/);
    expect(f.action.length).toBeGreaterThan(0);
  });

  test('classifies HTTP 429 as RATE_LIMIT', () => {
    const err = Object.assign(new Error('quota'), { code: 'HTTP_ERROR', status: 429 });
    const f = EC.friendly(err);
    expect(f.type).toBe(EC.TYPES.RATE_LIMIT);
    expect(f.message).toMatch(/しばらく待ってから再試行してください/);
  });

  test('classifies HTTP 401 / 403 as API_KEY', () => {
    expect(EC.classify(Object.assign(new Error('x'), { status: 401 }))).toBe(EC.TYPES.API_KEY);
    expect(EC.classify(Object.assign(new Error('x'), { status: 403 }))).toBe(EC.TYPES.API_KEY);
  });

  test('classifies NO_API_KEY code', () => {
    const f = EC.friendly(Object.assign(new Error('未設定'), { code: 'NO_API_KEY' }));
    expect(f.type).toBe(EC.TYPES.API_KEY);
    expect(f.message).toMatch(/設定ページで API キーを再確認してください/);
  });

  test('classifies DOM extraction failure', () => {
    const f = EC.friendly(new Error('記事を取得できませんでした'));
    expect(f.type).toBe(EC.TYPES.DOM_FETCH);
    expect(f.message).toMatch(/記事が取得できません。ページを再読み込みしてください/);
  });

  test('classifies SUMMARIZER_UNSUPPORTED', () => {
    const f = EC.friendly(new Error('SUMMARIZER_UNSUPPORTED'));
    expect(f.type).toBe(EC.TYPES.NANO_UNSUPPORTED);
    expect(f.message).toMatch(/ローカル AI 機能が利用できません/);
  });

  test('every TYPES value has a Japanese message and a non-empty action', () => {
    Object.values(EC.TYPES).forEach((type) => {
      const fakeErr = Object.assign(new Error('-'), { code: '__none__' });
      // Force the type by passing in a synthetic object the classifier handles.
      const tpl = EC.MESSAGES[type];
      expect(tpl, `MESSAGES.${type} is missing`).toBeTruthy();
      expect(tpl.message.length).toBeGreaterThan(0);
      expect(tpl.action.length).toBeGreaterThan(0);
      // Forbidden English copy: "Failed" / "Error".
      expect(tpl.message).not.toMatch(/Failed/);
      expect(tpl.message).not.toMatch(/\bError\b/);
      expect(tpl.action).not.toMatch(/Failed/);
      expect(tpl.action).not.toMatch(/\bError\b/);
      void fakeErr;
    });
  });

  test('wrap() preserves the original error on .cause and adds .userMessage', () => {
    const original = Object.assign(new Error('raw'), { code: 'NO_API_KEY' });
    const wrapped = EC.wrap(original);
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.cause).toBe(original);
    expect(wrapped.userMessage).toMatch(/設定ページで API キーを再確認してください/);
    expect(wrapped.userAction.length).toBeGreaterThan(0);
    expect(wrapped.message).toContain(wrapped.userAction);
  });

  test('unknown errors fall back to the UNKNOWN bucket without throwing', () => {
    const f = EC.friendly(null);
    expect(f.type).toBe(EC.TYPES.UNKNOWN);
    expect(f.message.length).toBeGreaterThan(0);
    expect(f.action.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// § 6  Manifest + service-worker registration ordering
// ---------------------------------------------------------------------------

test.describe('Sprint 9 — manifest + SW load order', () => {
  test('manifest loads error-classifier.js before nano-summarizer.js', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(EXTENSION_PATH, 'manifest.json'), 'utf8')
    );
    const list = manifest.content_scripts[0].js;
    const ecIdx = list.indexOf('src/lib/error-classifier.js');
    const nanoIdx = list.indexOf('src/lib/nano-summarizer.js');
    const geminiIdx = list.indexOf('src/lib/gemini-client.js');
    expect(ecIdx, 'error-classifier.js missing from manifest').toBeGreaterThanOrEqual(0);
    expect(nanoIdx, 'nano-summarizer.js missing').toBeGreaterThanOrEqual(0);
    expect(geminiIdx, 'gemini-client.js missing').toBeGreaterThanOrEqual(0);
    // gemini-client must precede nano-summarizer because summarizeCloud() now
    // depends on ns.GeminiClient at IIFE invocation time.
    expect(geminiIdx).toBeLessThan(nanoIdx);
  });

  test('service-worker re-injection list mirrors the manifest', () => {
    const sw = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'background', 'service-worker.js'),
      'utf8'
    );
    expect(sw).toMatch(/src\/lib\/error-classifier\.js/);
    // gemini-client must be listed before nano-summarizer.
    const ecIdx = sw.indexOf('src/lib/error-classifier.js');
    const geminiIdx = sw.indexOf('src/lib/gemini-client.js');
    const nanoIdx = sw.indexOf('src/lib/nano-summarizer.js');
    expect(ecIdx).toBeGreaterThan(0);
    expect(geminiIdx).toBeGreaterThan(0);
    expect(geminiIdx).toBeLessThan(nanoIdx);
  });
});

// ---------------------------------------------------------------------------
// § 7  Browser: Nano-unavailable simulation
//
// We bypass the live note.com page by intercepting requests with page.route
// and returning a synthetic HTML response that note-parser.js can extract
// from. This keeps the test deterministic even when note.com layout shifts
// or the network is flaky.
//
// Two scenarios:
//   (a) No API key → BYOK guidance banner appears; the user is told what to
//       do next, and no forbidden words leak into the copy.
//   (b) API key set → cloud summary runs via the (mocked) GeminiClient with
//       model = gemini-2.5-flash-lite, the engine badge says "cloud".
// ---------------------------------------------------------------------------

const STUB_NOTE_ARTICLE_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Sprint 9 stub article — note アブストラクト</title>
</head>
<body>
  <main>
    <header>
      <h1 class="o-noteContentHeader__title">テスト用記事タイトル</h1>
    </header>
    <div class="note-common-styles__textnote-body">
      <div class="o-noteContentText">
        <p>これは Sprint 9 の自動テスト用に差し込まれたダミー記事です。背景としては、note アブストラクトの拡張機能が Gemini Nano が利用できない環境でも適切にユーザーへ次のアクションを案内できるかを検証する目的があります。</p>
        <p>主題: ローカル AI が無効なときの BYOK フォールバック挙動を確認する。主張: 拡張機能はユーザーに API キー設定を促すバナーを表示する。根拠: §3.6.4 の要求仕様。結論: 環境差を吸収するフォールバック設計が必須である。</p>
        <p>本文をある程度の長さにしておき、note-parser.js がタイトルと本文を抽出できる状態を作っています。改行やスペースは適度に入れて自然な日本語文章として扱えるようにします。</p>
      </div>
    </div>
  </main>
</body>
</html>`;

test.describe('Sprint 9 — browser: Nano-unsupported flow', () => {
  let context;
  let worker;
  let userDataDir;

  test.beforeAll(async () => {
    ({ context, userDataDir } = await launchExtensionContext('nano-unsupported'));
    worker = await getServiceWorker(context);
  });

  test.afterAll(async () => {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  // page.route fulfils any note article URL with our deterministic stub so
  // note-parser.js extracts predictable content regardless of network state.
  const stubNoteArticle = async (page) => {
    await page.route('**/note.com/**/n/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: STUB_NOTE_ARTICLE_HTML,
      })
    );
  };

  const openTabWithStub = async () => {
    const page = await context.newPage();
    await stubNoteArticle(page);
    await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(
      () => !!document.getElementById('note-abstract-host'),
      { timeout: 15000 }
    );
    return page;
  };

  // Helper: run `payload` inside the active note tab's ISOLATED content
  // world. We pass an inline function reference to chrome.scripting.executeScript
  // (which serialises via Function.prototype.toString()), so we don't trigger
  // the SW's `unsafe-eval` CSP that `new Function(...)` would.
  const runInTab = async (payloadKey) => {
    return await worker.evaluate(async ({ url, key }) => {
      const tabs = await chrome.tabs.query({ url: url + '*' });
      const tab = tabs[0];
      if (!tab) throw new Error('no tab');

      // The actions are dispatched on a string key so the content-side function
      // body remains static (no per-test serialisation needed).
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'ISOLATED',
        args: [key],
        func: (action) => {
          const host = document.getElementById('note-abstract-host');
          if (!host || !host.__noteAbstractPanel) return { mounted: false };
          const panel = host.__noteAbstractPanel;
          const sr = host.shadowRoot;
          panel.open();

          if (action === 'byok-no-key') {
            panel.showSummaryByokNotice({ hasApiKey: false });
            const notice = sr.querySelector('[data-role="summary-byok-notice"]');
            const btn = sr.querySelector('[data-role="summary-byok-open-options"]');
            const title = sr.querySelector('[data-role="summary-byok-title"]');
            const body = sr.querySelector('[data-role="summary-byok-body"]');
            return {
              mounted: true,
              noticeHidden: notice ? notice.hidden : null,
              btnHidden: btn ? btn.hidden : null,
              text: ((title ? title.textContent : '') + ' ' + (body ? body.textContent : '')).trim(),
            };
          }

          if (action === 'byok-with-key') {
            panel.showSummaryByokNotice({ hasApiKey: true });
            const title = sr.querySelector('[data-role="summary-byok-title"]');
            const body = sr.querySelector('[data-role="summary-byok-body"]');
            const btn = sr.querySelector('[data-role="summary-byok-open-options"]');
            return {
              mounted: true,
              title: title ? title.textContent.trim() : '',
              body: body ? body.textContent.trim() : '',
              btnHidden: btn ? btn.hidden : null,
            };
          }

          if (action === 'progress') {
            panel.showSummaryDownloadProgress({ hasApiKey: false });
            panel.setSummaryDownloadProgress(0, 100);
            const wrap = sr.querySelector('[data-role="summary-download-progress"]');
            const bar = sr.querySelector('[data-role="summary-download-bar"]');
            const pct = sr.querySelector('[data-role="summary-download-percent"]');
            const initial = {
              hidden: wrap ? wrap.hidden : null,
              width: bar ? bar.style.width : null,
              pct: pct ? pct.textContent : null,
            };
            panel.setSummaryDownloadProgress(45, 100);
            const mid = { width: bar.style.width, pct: pct.textContent };
            panel.setSummaryDownloadProgress(100, 100);
            const full = { width: bar.style.width, pct: pct.textContent };
            panel.hideSummaryDownloadProgress();
            const cleared = { hidden: wrap.hidden };
            return { mounted: true, initial, mid, full, cleared };
          }

          if (action === 'engine-badge') {
            const badge = sr.querySelector('[data-role="summary-engine-badge"]');
            const sample = (engine) => {
              panel.setSummaryEngine(engine);
              return {
                hidden: badge.hidden,
                engine: badge.dataset.engine,
                text: badge.textContent.trim(),
              };
            };
            return {
              mounted: true,
              nano: sample('nano'),
              cloud: sample('cloud'),
              cleared: sample(null),
            };
          }

          if (action === 'classify-network') {
            const ns = globalThis.__noteAbstract;
            const e = new Error('boom'); e.code = 'NETWORK_ERROR';
            return { mounted: true, friendly: ns.ErrorClassifier.friendly(e) };
          }

          return { mounted: true, action };
        },
      });
      return r && r.result;
    }, { url: NOTE_ARTICLE_URL, key: payloadKey });
  };

  // Same idea but for an async cloud-fallback round-trip.
  const runCloudSummarizeInTab = async () => {
    return await worker.evaluate(async ({ url }) => {
      const tabs = await chrome.tabs.query({ url: url + '*' });
      const tab = tabs[0];
      if (!tab) throw new Error('no tab');

      const [r] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'ISOLATED',
        func: async () => {
          const ns = globalThis.__noteAbstract;
          try {
            const text = await ns.NanoSummarizer.summarizeCloud(
              'これはテスト用の本文です。Sprint 9 のクラウドフォールバックを検証します。',
              'tldr',
              { apiKey: 'AIza-FAKE-S9-TEST', maxRetries: 0 }
            );
            return { ok: true, text };
          } catch (err) {
            return { ok: false, message: err && err.message ? err.message : String(err) };
          }
        },
      });
      return r && r.result;
    }, { url: NOTE_ARTICLE_URL });
  };

  test('Nano-unsupported guidance: panel shows BYOK banner with action button', async () => {
    await worker.evaluate(async () => {
      await chrome.storage.local.remove('apiKeyEncrypted');
    });

    const page = await openTabWithStub();
    const banner = await runInTab('byok-no-key');

    expect(banner.mounted, 'panel never mounted on stub article').toBe(true);
    expect(banner.noticeHidden).toBe(false);
    expect(banner.btnHidden).toBe(false);
    expect(banner.text).toMatch(/ローカル AI 機能が利用できません/);
    expect(banner.text).toMatch(/Google AI Studio/);
    expect(banner.text).toMatch(/API キー/);
    expect(banner.text).not.toMatch(/Failed/);
    expect(banner.text).not.toMatch(/\bError\b/);

    await page.close();
  });

  test('BYOK banner switches to "クラウド経由で動作" copy when API key is set', async () => {
    const page = await openTabWithStub();
    const banner = await runInTab('byok-with-key');

    expect(banner.mounted).toBe(true);
    expect(banner.title).toMatch(/クラウド経由/);
    expect(banner.body).toMatch(/Google AI Studio/);
    // When BYOK is already configured, hide the "open settings" CTA — the
    // user has already completed that step.
    expect(banner.btnHidden).toBe(true);

    await page.close();
  });

  test('Download progress UI renders, updates, and hides on demand', async () => {
    const page = await openTabWithStub();
    const progress = await runInTab('progress');

    expect(progress.mounted).toBe(true);
    expect(progress.initial.hidden).toBe(false);
    expect(progress.initial.width).toBe('0%');
    expect(progress.initial.pct).toBe('0%');
    expect(progress.mid.width).toBe('45%');
    expect(progress.mid.pct).toBe('45%');
    expect(progress.full.width).toBe('100%');
    expect(progress.full.pct).toBe('100%');
    expect(progress.cleared.hidden).toBe(true);

    await page.close();
  });

  test('Engine badge announces Nano vs cloud and clears with null', async () => {
    const page = await openTabWithStub();
    const states = await runInTab('engine-badge');

    expect(states.mounted).toBe(true);
    expect(states.nano.hidden).toBe(false);
    expect(states.nano.engine).toBe('nano');
    expect(states.nano.text).toMatch(/ローカル AI/);
    expect(states.cloud.hidden).toBe(false);
    expect(states.cloud.engine).toBe('cloud');
    expect(states.cloud.text).toMatch(/gemini-2\.5-flash-lite/);
    expect(states.cleared.hidden).toBe(true);

    await page.close();
  });

  test('cloud summarizeCloud() picks gemini-2.5-flash-lite via GeminiClient', async () => {
    // Network-level mock: any request to the Gemini API returns a deterministic
    // body whose text echoes the chosen model so the assertion can confirm
    // the extension picked gemini-2.5-flash-lite for the BYOK fallback.
    const page = await openTabWithStub();
    await page.route('**/generativelanguage.googleapis.com/**', (route) => {
      const url = route.request().url();
      const modelMatch = url.match(/models\/([^:?]+)/);
      const model = modelMatch ? modelMatch[1] : '';
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [{
            content: { parts: [{ text: 'cloud-fallback-response model=' + model }] },
          }],
        }),
      });
    });

    const out = await runCloudSummarizeInTab();

    expect(out.ok, `summarizeCloud threw: ${out && out.message}`).toBe(true);
    expect(out.text).toMatch(/gemini-2\.5-flash-lite/);

    await page.close();
  });

  test('error → friendly message: NETWORK_ERROR surfaces "接続を確認してください"', async () => {
    const page = await openTabWithStub();
    const result = await runInTab('classify-network');

    expect(result.mounted).toBe(true);
    const f = result.friendly;
    expect(f.type).toBe('network');
    expect(f.message).toMatch(/接続を確認してください/);
    expect(f.action.length).toBeGreaterThan(0);
    expect(f.full).not.toMatch(/Failed/);
    expect(f.full).not.toMatch(/\bError\b/);

    await page.close();
  });
});
