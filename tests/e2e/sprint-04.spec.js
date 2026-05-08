// @ts-check
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const FAKE_API_KEY = 'AIzaSyTEST_FAKE_KEY_FOR_SPRINT04_xxxxxxxxxxxxxxxxxxx';

const launchExtensionContext = async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-e2e-s4-'));
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
  return await context.waitForEvent('serviceworker');
};

const writeApiKeyViaWorker = async (worker, key) => {
  await worker.evaluate(async (k) => {
    const KEY = 'note-abstract-v1-obfuscation-pad';
    const enc = new TextEncoder();
    const keyBytes = enc.encode(KEY);
    const bytes = enc.encode(k);
    const xored = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      xored[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    let bin = '';
    for (let i = 0; i < xored.length; i += 1) bin += String.fromCharCode(xored[i]);
    const b64 = btoa(bin);
    await chrome.storage.local.set({ apiKeyEncrypted: b64 });
  }, key);
};

const togglePanelViaWorker = async (worker, tabUrl) => {
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url: url + '*' });
    const tab = tabs[0];
    if (!tab) throw new Error(`tab not found for ${url}`);
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
  }, tabUrl);
};

const openArticleAndPanel = async (context, worker) => {
  const page = await context.newPage();
  await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(
    () => !!document.getElementById('note-abstract-host'),
    { timeout: 15000 }
  );
  await togglePanelViaWorker(worker, NOTE_ARTICLE_URL);
  await page.waitForFunction(() => {
    const host = document.getElementById('note-abstract-host');
    const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
    return panel && panel.dataset.state === 'open';
  }, { timeout: 5000 });
  return page;
};

const clickPanelTab = async (page, tabId) => {
  await page.evaluate((id) => {
    const host = document.getElementById('note-abstract-host');
    const btn = host.shadowRoot.querySelector(`nav.tabs button[data-tab="${id}"]`);
    if (btn) btn.click();
  }, tabId);
};

const stubPredictionResponse = async (page, sectionTexts) => {
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    // Crude differentiation: the prediction prompt mentions "セクション一覧"; the
    // keyword prompt requires JSON. Both fall through to the same handler in this
    // test; specific tests that need to differentiate route per-test.
    const body = route.request().postData() || '';
    if (body.includes('JSON 配列')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '["AI","プロダクト戦略","スタートアップ","UXリサーチ","価格設計"]' }],
              },
            },
          ],
        }),
      });
      return;
    }
    const text = sectionTexts && sectionTexts(url, body) ? sectionTexts(url, body) : '## ダミー\nダミーレスポンス';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
      }),
    });
  });
};

test.describe('Sprint 4: prediction + keyword suggester', () => {
  test('prompts.json defines exactly 3 base templates with required fields', async () => {
    const filePath = path.join(EXTENSION_PATH, 'src', 'templates', 'prompts.json');
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(Array.isArray(json.templates)).toBe(true);
    const ids = json.templates.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['standard', 'business', 'academic']));
    for (const t of json.templates) {
      expect(typeof t.promptPrefix).toBe('string');
      expect(t.promptPrefix.length).toBeGreaterThan(40);
      expect(Array.isArray(t.outputSections)).toBe(true);
      expect(t.outputSections.length).toBe(3);
    }
  });

  test('prediction tab shows BYOK notice when API key is missing', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const page = await openArticleAndPanel(context, worker);

      await clickPanelTab(page, 'prediction');

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const notice = host.shadowRoot.querySelector('[data-role="prediction-byok-notice"]');
        const main = host.shadowRoot.querySelector('[data-role="prediction-main"]');
        return notice && !notice.hidden && main && main.hidden;
      }, { timeout: 5000 });

      const text = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        return host.shadowRoot.querySelector('[data-role="prediction-byok-notice"]').textContent;
      });
      expect(text || '').toMatch(/API\s*キー/);
      expect(text || '').toMatch(/設定/);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('related tab shows BYOK notice when API key is missing', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const page = await openArticleAndPanel(context, worker);

      await clickPanelTab(page, 'related');

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const notice = host.shadowRoot.querySelector('[data-role="related-byok-notice"]');
        const main = host.shadowRoot.querySelector('[data-role="related-main"]');
        return notice && !notice.hidden && main && main.hidden;
      }, { timeout: 5000 });

      const text = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        return host.shadowRoot.querySelector('[data-role="related-byok-notice"]').textContent;
      });
      expect(text || '').toMatch(/API\s*キー/);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('prediction tab populates 3 templates and renders 3 sections from stubbed Gemini', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeApiKeyViaWorker(worker, FAKE_API_KEY);

      const page = await context.newPage();
      // Route Gemini calls to our stub. The prediction prompt does NOT contain
      // "JSON 配列", so it falls through to the section-text branch.
      await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        const body = route.request().postData() || '';
        if (body.includes('JSON 配列')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              candidates: [{ content: { parts: [{ text: '["a","b","c","d","e"]' }] } }],
            }),
          });
          return;
        }
        // Echo back section headings + a marker so we can distinguish per template.
        let marker = 'STANDARD';
        if (body.includes('事業戦略コンサルタント')) marker = 'BUSINESS';
        if (body.includes('論文の Discussion')) marker = 'ACADEMIC';
        const text = [
          '## 将来予測',
          `${marker} の将来予測テキスト`,
          '## 含意分析',
          `${marker} の含意分析テキスト`,
          '## 批判的観点',
          `${marker} の批判的観点テキスト`,
          '## 市場機会',
          `${marker} の市場機会テキスト`,
          '## 実行リスク',
          `${marker} の実行リスクテキスト`,
          '## 事業への示唆',
          `${marker} の事業への示唆テキスト`,
          '## 先行研究との関係',
          `${marker} の先行研究との関係テキスト`,
          '## 方法論的限界',
          `${marker} の方法論的限界テキスト`,
          '## 今後の検証課題',
          `${marker} の今後の検証課題テキスト`,
        ].join('\n');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            candidates: [{ content: { parts: [{ text }] } }],
          }),
        });
      });

      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(
        () => !!document.getElementById('note-abstract-host'),
        { timeout: 15000 }
      );
      await togglePanelViaWorker(worker, NOTE_ARTICLE_URL);
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });

      await clickPanelTab(page, 'prediction');

      // Wait for the main UI to be visible (API key is set so notice is hidden).
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const main = host.shadowRoot.querySelector('[data-role="prediction-main"]');
        return main && !main.hidden;
      }, { timeout: 5000 });

      // Wait for the template select to be populated with 3 options.
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const select = host.shadowRoot.querySelector('[data-role="prediction-template"]');
        return select && select.options && select.options.length === 3;
      }, { timeout: 5000 });

      const optionIds = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const select = host.shadowRoot.querySelector('[data-role="prediction-template"]');
        return Array.from(select.options).map((o) => o.value);
      });
      expect(optionIds).toEqual(expect.arrayContaining(['standard', 'business', 'academic']));

      const runOnce = async (templateId) => {
        await page.evaluate((id) => {
          const host = document.getElementById('note-abstract-host');
          const select = host.shadowRoot.querySelector('[data-role="prediction-template"]');
          select.value = id;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          host.shadowRoot.querySelector('[data-role="prediction-run"]').click();
        }, templateId);

        await page.waitForFunction(() => {
          const host = document.getElementById('note-abstract-host');
          const sections = host.shadowRoot.querySelectorAll('[data-role="prediction-result"] .prediction-section');
          return sections.length >= 3;
        }, { timeout: 15000 });

        return await page.evaluate(() => {
          const host = document.getElementById('note-abstract-host');
          const sections = host.shadowRoot.querySelectorAll('[data-role="prediction-result"] .prediction-section');
          return Array.from(sections).map((sec) => ({
            name: sec.dataset.section || sec.querySelector('h4')?.textContent || '',
            text: sec.querySelector('p')?.textContent || '',
          }));
        });
      };

      const standard = await runOnce('standard');
      expect(standard).toHaveLength(3);
      expect(standard.map((s) => s.name)).toEqual(['将来予測', '含意分析', '批判的観点']);
      expect(standard.every((s) => /STANDARD/.test(s.text))).toBe(true);

      const business = await runOnce('business');
      expect(business).toHaveLength(3);
      expect(business.map((s) => s.name)).toEqual(['市場機会', '実行リスク', '事業への示唆']);
      expect(business.every((s) => /BUSINESS/.test(s.text))).toBe(true);

      const academic = await runOnce('academic');
      expect(academic).toHaveLength(3);
      expect(academic.map((s) => s.name)).toEqual(['先行研究との関係', '方法論的限界', '今後の検証課題']);
      expect(academic.every((s) => /ACADEMIC/.test(s.text))).toBe(true);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('related tab returns 5 keywords each linking to a note search URL', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeApiKeyViaWorker(worker, FAKE_API_KEY);

      const page = await context.newPage();
      await stubPredictionResponse(page);

      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(
        () => !!document.getElementById('note-abstract-host'),
        { timeout: 15000 }
      );
      await togglePanelViaWorker(worker, NOTE_ARTICLE_URL);
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });

      await clickPanelTab(page, 'related');

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const main = host.shadowRoot.querySelector('[data-role="related-main"]');
        return main && !main.hidden;
      }, { timeout: 5000 });

      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        host.shadowRoot.querySelector('[data-role="related-run"]').click();
      });

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const links = host.shadowRoot.querySelectorAll('[data-role="related-result"] .keyword-link');
        return links.length === 5;
      }, { timeout: 15000 });

      const items = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const links = host.shadowRoot.querySelectorAll('[data-role="related-result"] .keyword-link');
        return Array.from(links).map((a) => ({
          keyword: a.dataset.keyword || '',
          href: a.getAttribute('href'),
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel'),
        }));
      });

      expect(items).toHaveLength(5);
      const expectedKeywords = ['AI', 'プロダクト戦略', 'スタートアップ', 'UXリサーチ', '価格設計'];
      expect(items.map((i) => i.keyword)).toEqual(expectedKeywords);
      for (const item of items) {
        expect(item.target).toBe('_blank');
        expect(item.rel || '').toMatch(/noopener/);
        expect(item.href).toBe(`https://note.com/search?q=${encodeURIComponent(item.keyword)}`);
      }
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('prediction tab shows friendly error message when API returns 401', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeApiKeyViaWorker(worker, FAKE_API_KEY);

      const page = await context.newPage();
      await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 401, message: 'invalid api key' } }),
        });
      });

      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(
        () => !!document.getElementById('note-abstract-host'),
        { timeout: 15000 }
      );
      await togglePanelViaWorker(worker, NOTE_ARTICLE_URL);
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });

      await clickPanelTab(page, 'prediction');

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const select = host.shadowRoot.querySelector('[data-role="prediction-template"]');
        return select && select.options && select.options.length === 3;
      }, { timeout: 5000 });

      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        host.shadowRoot.querySelector('[data-role="prediction-run"]').click();
      });

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const err = host.shadowRoot.querySelector('[data-role="prediction-error"]');
        return err && err.dataset.active === 'true';
      }, { timeout: 15000 });

      const text = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        return host.shadowRoot.querySelector('[data-role="prediction-error"]').textContent;
      });
      expect(text || '').toMatch(/API\s*キー/);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
