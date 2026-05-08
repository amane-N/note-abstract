// @ts-check
// Verify that SPA navigation (history.pushState) on note.com causes the side
// panel to reset its summary / prediction / related content for the new
// article, instead of leaving stale data from the previous article.
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const FAKE_NEXT_ARTICLE = 'https://note.com/info/n/nDIFFERENTARTICLE_FAKE';

const launchExtensionContext = async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-spa-'));
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

const togglePanel = async (worker, tabUrl) => {
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url: url + '*' });
    const tab = tabs[0];
    if (!tab) throw new Error(`tab not found for ${url}`);
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
  }, tabUrl);
};

test.describe('Sprint 4b: SPA navigation resets panel state', () => {
  test('summary / prediction / related all reset to placeholders on URL change', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const page = await context.newPage();

      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(
        () => !!document.getElementById('note-abstract-host'),
        { timeout: 15000 }
      );

      await togglePanel(worker, NOTE_ARTICLE_URL);
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });

      // Inject obvious dirty state into all three result containers so we can
      // confirm afterwards that resetForNewArticle() clears them.
      await page.evaluate(() => {
        const root = document.getElementById('note-abstract-host').shadowRoot;
        root.querySelector('[data-role="abstract"]').textContent = 'STALE_SUMMARY_FROM_ARTICLE_1';
        const ul = root.querySelector('[data-role="key-points"]');
        ul.innerHTML = '<li>STALE_KEY_POINT_1</li><li>STALE_KEY_POINT_2</li>';
        root.querySelector('[data-role="reading-time"]').textContent = '約 STALE 分';

        // Simulate that the prediction tab had results.
        const pred = root.querySelector('[data-role="prediction-result"]');
        pred.innerHTML = '<div class="prediction-section" data-section="将来予測"><h4>将来予測</h4><p>STALE_PREDICTION_TEXT</p></div>';

        // Simulate that the related tab had keywords.
        const rel = root.querySelector('[data-role="related-result"]');
        rel.innerHTML = '<ul class="keyword-list"><li><a class="keyword-link" href="https://note.com/search?q=stale" data-keyword="STALE_KEYWORD">STALE_KEYWORD</a></li></ul>';

        const meta = root.querySelector('[data-role="related-meta"]');
        meta.hidden = false;
        meta.textContent = '5 件のキーワードを生成しました。';

        // Mark prediction error as active too, to verify it's cleared.
        const predErr = root.querySelector('[data-role="prediction-error"]');
        predErr.dataset.active = 'true';
        predErr.textContent = 'STALE_ERROR';
      });

      // Verify the dirty state IS present.
      const before = await page.evaluate(() => {
        const root = document.getElementById('note-abstract-host').shadowRoot;
        return {
          abstract: root.querySelector('[data-role="abstract"]').textContent,
          keyPoints: Array.from(root.querySelectorAll('[data-role="key-points"] li')).map((li) => li.textContent),
          predictionHtml: root.querySelector('[data-role="prediction-result"]').innerHTML,
          relatedHtml: root.querySelector('[data-role="related-result"]').innerHTML,
          relatedMetaHidden: root.querySelector('[data-role="related-meta"]').hidden,
          predictionErrorActive: root.querySelector('[data-role="prediction-error"]').dataset.active,
        };
      });
      expect(before.abstract).toContain('STALE_SUMMARY');
      expect(before.keyPoints.length).toBe(2);
      expect(before.predictionHtml).toContain('STALE_PREDICTION');
      expect(before.relatedHtml).toContain('STALE_KEYWORD');
      expect(before.relatedMetaHidden).toBe(false);
      expect(before.predictionErrorActive).toBe('true');

      // Trigger SPA navigation via history.pushState. The content script's
      // 600ms URL polling should detect this and call resetForNewArticle().
      await page.evaluate((url) => {
        history.pushState({}, '', url);
      }, FAKE_NEXT_ARTICLE);

      // Wait for the polling cycle (600ms poll + small buffer).
      // Note: re-running the summary is asynchronous and depends on Nano which
      // is unavailable in Playwright's Chromium, so the panel will land in
      // either the "loading" state or the fallback state. Either way the
      // STALE_* markers should be gone.
      await page.waitForFunction(() => {
        const root = document.getElementById('note-abstract-host').shadowRoot;
        const abstract = root.querySelector('[data-role="abstract"]').textContent || '';
        return !abstract.includes('STALE_SUMMARY');
      }, { timeout: 5000 });

      const after = await page.evaluate(() => {
        const root = document.getElementById('note-abstract-host').shadowRoot;
        return {
          abstract: root.querySelector('[data-role="abstract"]').textContent,
          keyPoints: Array.from(root.querySelectorAll('[data-role="key-points"] li')).map((li) => li.textContent),
          readingTime: root.querySelector('[data-role="reading-time"]').textContent,
          predictionHtml: root.querySelector('[data-role="prediction-result"]').innerHTML,
          relatedHtml: root.querySelector('[data-role="related-result"]').innerHTML,
          relatedMetaHidden: root.querySelector('[data-role="related-meta"]').hidden,
          predictionErrorActive: root.querySelector('[data-role="prediction-error"]').dataset.active,
          fallbackHidden: root.querySelector('[data-role="fallback"]').hidden,
        };
      });

      // Stale markers must be gone.
      expect(after.abstract || '').not.toContain('STALE_SUMMARY');
      expect(after.keyPoints.find((kp) => kp.includes('STALE_KEY_POINT'))).toBeUndefined();
      expect(after.readingTime || '').not.toContain('STALE');
      expect(after.predictionHtml || '').not.toContain('STALE_PREDICTION');
      expect(after.relatedHtml || '').not.toContain('STALE_KEYWORD');
      expect(after.relatedMetaHidden).toBe(true);
      expect(after.predictionErrorActive).not.toBe('true');

      // Prediction and related should be back to placeholder text.
      expect(after.predictionHtml || '').toContain('テンプレートを選んで');
      expect(after.relatedHtml || '').toContain('「キーワードを提案」');
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('panel stays open after SPA navigation (does not auto-close)', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const page = await context.newPage();

      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(
        () => !!document.getElementById('note-abstract-host'),
        { timeout: 15000 }
      );

      await togglePanel(worker, NOTE_ARTICLE_URL);
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });

      await page.evaluate((url) => {
        history.pushState({}, '', url);
      }, FAKE_NEXT_ARTICLE);

      // Wait through one polling cycle.
      await page.waitForTimeout(1200);

      const stillOpen = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      });
      expect(stillOpen).toBe(true);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('user preferences (template selection) survive SPA navigation', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);

      // Plant an API key so the prediction tab is active and the template
      // dropdown is populated.
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
        await chrome.storage.local.set({ apiKeyEncrypted: btoa(bin) });
      }, 'AIzaSyTEST_FAKE_KEY_FOR_SPA_xxxxxxxxxxxxxxxxxxxxxxxxxxx');

      const page = await context.newPage();
      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(
        () => !!document.getElementById('note-abstract-host'),
        { timeout: 15000 }
      );

      await togglePanel(worker, NOTE_ARTICLE_URL);
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });

      // Switch to prediction tab and pick the academic template.
      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        host.shadowRoot.querySelector('nav.tabs button[data-tab="prediction"]').click();
      });
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const select = host.shadowRoot.querySelector('[data-role="prediction-template"]');
        return select && select.options && select.options.length === 3;
      }, { timeout: 5000 });

      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const select = host.shadowRoot.querySelector('[data-role="prediction-template"]');
        select.value = 'academic';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Trigger SPA nav.
      await page.evaluate((url) => {
        history.pushState({}, '', url);
      }, FAKE_NEXT_ARTICLE);

      await page.waitForTimeout(1200);

      // Template selection should be preserved.
      const selected = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const select = host.shadowRoot.querySelector('[data-role="prediction-template"]');
        return select.value;
      });
      expect(selected).toBe('academic');
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
