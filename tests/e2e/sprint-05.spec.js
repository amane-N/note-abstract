// @ts-check
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const TEST_LICENSE_CODE = 'NA-TEST-DEMO-MODE';

const launchExtensionContext = async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-e2e-s5-'));
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

const getExtensionId = (worker) => new URL(worker.url()).host;

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

const writeLicenseViaWorker = async (worker, code) => {
  await worker.evaluate(async (c) => {
    await chrome.storage.local.set({
      license: { code: c, activatedAt: Date.now() },
    });
  }, code);
};

const clearLicenseViaWorker = async (worker) => {
  await worker.evaluate(async () => {
    await chrome.storage.local.remove('license');
  });
};

test.describe('Sprint 5: license / freemium gating', () => {
  test('license.js source exposes the public interface', async () => {
    const filePath = path.join(EXTENSION_PATH, 'src', 'lib', 'license.js');
    const src = fs.readFileSync(filePath, 'utf8');
    expect(src).toMatch(/getLicenseStatus/);
    expect(src).toMatch(/activateLicense/);
    expect(src).toMatch(/deactivateLicense/);
    expect(src).toMatch(/NA-TEST-DEMO-MODE/);
    // Format regex must require the NA-XXXX-XXXX-XXXX shape.
    expect(src).toMatch(/NA-\[A-Z0-9\]\{4\}-\[A-Z0-9\]\{4\}-\[A-Z0-9\]\{4\}/);
    // Must be wired into the manifest content_scripts list so it loads on note pages.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(EXTENSION_PATH, 'manifest.json'), 'utf8')
    );
    const cs = manifest.content_scripts[0].js;
    expect(cs).toContain('src/lib/license.js');
  });

  test('activateLicense accepts NA-TEST-DEMO-MODE and rejects invalid codes', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      // Wait until the license module is loaded into the page namespace.
      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.License && typeof ns.License.activateLicense === 'function';
      }, { timeout: 5000 });

      // Sprint 11: 全機能無料化 — 初期状態は常に premium。
      const initial = await page.evaluate(() => globalThis.__noteAbstract.License.getLicenseStatus());
      expect(initial).toBe('premium');

      // Reject malformed code.
      const badFormat = await page.evaluate(() =>
        globalThis.__noteAbstract.License.activateLicense('not-a-license')
      );
      expect(badFormat.ok).toBe(false);
      expect(badFormat.code).toBe('LICENSE_INVALID_FORMAT');

      // Reject well-formatted but unknown code.
      const unknown = await page.evaluate(() =>
        globalThis.__noteAbstract.License.activateLicense('NA-AAAA-BBBB-CCCC')
      );
      expect(unknown.ok).toBe(false);
      expect(unknown.code).toBe('LICENSE_UNKNOWN_CODE');

      // Accept the test code.
      const ok = await page.evaluate((c) =>
        globalThis.__noteAbstract.License.activateLicense(c), TEST_LICENSE_CODE);
      expect(ok.ok).toBe(true);
      const after = await page.evaluate(() => globalThis.__noteAbstract.License.getLicenseStatus());
      expect(after).toBe('premium');

      // Deactivate (ストレージからレコードを削除する動作は維持)。
      const off = await page.evaluate(() =>
        globalThis.__noteAbstract.License.deactivateLicense()
      );
      expect(off.ok).toBe(true);
      // Sprint 11: 全機能無料化 — deactivate 後も isPremium は true のため premium。
      const final = await page.evaluate(() =>
        globalThis.__noteAbstract.License.getLicenseStatus()
      );
      expect(final).toBe('premium');
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('options page UI activates and deactivates the test license', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForSelector('#license-form', { timeout: 5000 });

      // Sprint 11: 全機能無料化 — 初期 badge は有料層 (全機能利用可能) 相当。
      await page.waitForFunction(() => {
        const badge = document.getElementById('license-badge');
        return badge && badge.dataset.state === 'premium';
      }, { timeout: 5000 });

      // Type the test code and submit.
      await page.fill('#license-input', TEST_LICENSE_CODE);
      await page.click('#license-activate-btn');

      // Sprint 11: badge は常に premium state。
      await page.waitForFunction(() => {
        const badge = document.getElementById('license-badge');
        return badge && badge.dataset.state === 'premium';
      }, { timeout: 5000 });

      // Deactivate button is now enabled.
      const enabled = await page.evaluate(() => {
        const btn = document.getElementById('license-deactivate-btn');
        return btn && !btn.disabled;
      });
      expect(enabled).toBe(true);

      // Confirm window before deactivating.
      page.on('dialog', (d) => d.accept());
      await page.click('#license-deactivate-btn');

      // Sprint 11: 全機能無料化 — deactivate 後も badge は premium のまま。
      await page.waitForFunction(() => {
        const badge = document.getElementById('license-badge');
        return badge && badge.dataset.state === 'premium';
      }, { timeout: 5000 });

      // Bad code shows error feedback.
      await page.fill('#license-input', 'NA-AAAA-BBBB-CCCC');
      await page.click('#license-activate-btn');
      await page.waitForFunction(() => {
        const fb = document.getElementById('license-feedback');
        return fb && fb.dataset.level === 'error' && fb.textContent && fb.textContent.length > 0;
      }, { timeout: 5000 });
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('history tab is always enabled (no lock — Sprint 11 全機能無料化)', async () => {
    // Sprint 11: 全機能無料化 — license なしで履歴タブは常に enabled。
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const page = await openArticleAndPanel(context, worker);

      const result = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const sr = host.shadowRoot;
        const btn = sr.querySelector('nav.tabs button[data-tab="history"]');
        const locked = sr.querySelector('[data-role="history-locked"]');
        const unlocked = sr.querySelector('[data-role="history-unlocked"]');
        return {
          disabled: btn ? btn.disabled : null,
          hasLockGlyph: btn ? !!btn.querySelector('.lock-glyph') : false,
          lockedHidden: locked ? locked.hidden : null,
          unlockedHidden: unlocked ? unlocked.hidden : null,
          buttonText: btn ? btn.textContent : '',
        };
      });

      // 履歴タブは常に有効 (disabled でない)。
      expect(result.disabled).toBe(false);
      // ロックグリフは表示されない。
      expect(result.hasLockGlyph).toBe(false);
      // locked コンテナは非表示、unlocked コンテナは表示。
      expect(result.lockedHidden).toBe(true);
      expect(result.unlockedHidden).toBe(false);
      expect(result.buttonText).toMatch(/履歴/);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('history tab is accessible and shows unlocked content', async () => {
    // Sprint 11: 全機能無料化 — 履歴タブは license なしで常に有効。
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);

      const page = await openArticleAndPanel(context, worker);

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const btn = host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]');
        return btn && !btn.disabled && !btn.querySelector('.lock-glyph');
      }, { timeout: 5000 });

      // Click the now-enabled tab and verify the unlocked content is shown.
      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]').click();
      });

      const view = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const sr = host.shadowRoot;
        const sec = sr.querySelector('.tab-panel[data-tab="history"]');
        const locked = sr.querySelector('[data-role="history-locked"]');
        const unlocked = sr.querySelector('[data-role="history-unlocked"]');
        return {
          active: sec ? sec.dataset.active : null,
          lockedHidden: locked ? locked.hidden : null,
          unlockedHidden: unlocked ? unlocked.hidden : null,
          unlockedText: unlocked ? unlocked.textContent.trim() : '',
        };
      });
      expect(view.active).toBe('true');
      expect(view.lockedHidden).toBe(true);
      expect(view.unlockedHidden).toBe(false);
      // Sprint 6 ではプレースホルダが履歴 UI に置き換わる。
      // "履歴" の見出しまたは空状態プレースホルダのいずれかが表示されていれば OK。
      expect(view.unlockedText).toMatch(/履歴/);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('side panel history tab stays enabled after license deactivation (Sprint 11 全機能無料化)', async () => {
    // Sprint 11: deactivate しても isPremium は常に true のため、
    // 履歴タブは再ロックされない。
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeLicenseViaWorker(worker, TEST_LICENSE_CODE);

      const page = await openArticleAndPanel(context, worker);

      // Confirm history tab is enabled.
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const btn = host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]');
        return btn && !btn.disabled;
      }, { timeout: 5000 });

      // Revoke the license from storage.
      await clearLicenseViaWorker(worker);

      // Small wait for storage change event to propagate.
      await page.waitForTimeout(1000);

      // History tab should remain enabled (not re-locked).
      const result = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const btn = host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]');
        return {
          disabled: btn ? btn.disabled : null,
          hasLockGlyph: btn ? !!btn.querySelector('.lock-glyph') : false,
        };
      });
      expect(result.disabled).toBe(false);
      expect(result.hasLockGlyph).toBe(false);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
