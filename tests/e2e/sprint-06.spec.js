// @ts-check
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const TEST_LICENSE_CODE = 'NA-TEST-DEMO-MODE';

const launchExtensionContext = async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-e2e-s6-'));
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

test.describe('Sprint 6: 履歴保存・横断検索', () => {

  // -------------------------------------------------------------------------
  // Test 1: Storage module unit tests via options page evaluate
  // -------------------------------------------------------------------------
  test('storage module: addHistory / getHistory / searchHistory / deleteHistory / clearHistory', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      // Clear any prior state.
      await page.evaluate(() => globalThis.__noteAbstract.Storage.clearHistory());

      // addHistory — basic add.
      const e1 = await page.evaluate(() =>
        globalThis.__noteAbstract.Storage.addHistory({
          url: 'https://note.com/test/n/n001',
          title: 'テスト記事1',
          summary: 'サマリー1',
          keyPoints: ['P1', 'P2'],
        })
      );
      expect(e1.id).toBeTruthy();
      expect(e1.createdAt).toBeTruthy();
      expect(e1.title).toBe('テスト記事1');

      // addHistory — UPSERT (same URL should merge, not add).
      const e1b = await page.evaluate(() =>
        globalThis.__noteAbstract.Storage.addHistory({
          url: 'https://note.com/test/n/n001',
          title: 'テスト記事1 (更新)',
          keywords: ['kw1', 'kw2'],
        })
      );
      expect(e1b.id).toBe(e1.id);
      expect(e1b.createdAt).toBe(e1.createdAt); // preserved
      expect(e1b.title).toBe('テスト記事1 (更新)');
      expect(e1b.keywords).toEqual(['kw1', 'kw2']);

      // addHistory — second entry.
      await page.evaluate(() =>
        globalThis.__noteAbstract.Storage.addHistory({
          url: 'https://note.com/test/n/n002',
          title: 'テスト記事2',
          summary: 'サマリー2',
        })
      );

      // getHistory — default sort = desc (newest first).
      const all = await page.evaluate(() => globalThis.__noteAbstract.Storage.getHistory());
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(2);

      // searchHistory — by title partial match.
      const found = await page.evaluate(() =>
        globalThis.__noteAbstract.Storage.searchHistory('記事2')
      );
      expect(found.length).toBe(1);
      expect(found[0].title).toBe('テスト記事2');

      // searchHistory — empty string returns all.
      const allSearch = await page.evaluate(() => globalThis.__noteAbstract.Storage.searchHistory(''));
      expect(allSearch.length).toBe(2);

      // deleteHistory.
      const id1 = e1.id;
      await page.evaluate((id) => globalThis.__noteAbstract.Storage.deleteHistory(id), id1);
      const afterDelete = await page.evaluate(() => globalThis.__noteAbstract.Storage.getHistory());
      expect(afterDelete.length).toBe(1);
      expect(afterDelete[0].url).toBe('https://note.com/test/n/n002');

      // clearHistory.
      await page.evaluate(() => globalThis.__noteAbstract.Storage.clearHistory());
      const afterClear = await page.evaluate(() => globalThis.__noteAbstract.Storage.getHistory());
      expect(afterClear.length).toBe(0);

      // HISTORY_LIMIT constant.
      const limit = await page.evaluate(() => globalThis.__noteAbstract.Storage.HISTORY_LIMIT);
      expect(limit).toBe(1000);

      // KEYS.HISTORY_KEY.
      const histKey = await page.evaluate(() => globalThis.__noteAbstract.Storage.KEYS.HISTORY_KEY);
      expect(typeof histKey).toBe('string');
      expect(histKey.length).toBeGreaterThan(0);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 1b: FIFO 1000-entry limit
  // -------------------------------------------------------------------------
  test('storage: 1000-entry FIFO trim', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      await page.evaluate(() => globalThis.__noteAbstract.Storage.clearHistory());

      // Insert 1001 entries (each with a unique URL).
      await page.evaluate(async () => {
        const s = globalThis.__noteAbstract.Storage;
        for (let i = 0; i < 1001; i++) {
          await s.addHistory({
            url: `https://note.com/test/n/n${String(i).padStart(4, '0')}`,
            title: `記事 ${i}`,
          });
        }
      });

      const count = await page.evaluate(async () => {
        const all = await globalThis.__noteAbstract.Storage.getHistory();
        return all.length;
      });
      expect(count).toBe(1000);

      // The oldest entry (n0000) should have been trimmed.
      const oldest = await page.evaluate(async () => {
        const all = await globalThis.__noteAbstract.Storage.getHistory({ sort: 'asc' });
        return all[0];
      });
      expect(oldest.url).not.toBe('https://note.com/test/n/n0000');
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: Sprint 11 全機能無料化 — isPremium は常に true のため
  //         Storage.addHistory は常に実行される
  // -------------------------------------------------------------------------
  test('Sprint 11: isPremium is always true — Storage.addHistory is always allowed', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && ns.License && typeof ns.Storage.getHistory === 'function';
      }, { timeout: 5000 });

      // getLicenseStatus は常に premium を返す。
      const status = await page.evaluate(() => globalThis.__noteAbstract.License.getLicenseStatus());
      expect(status).toBe('premium');

      // isPremium は常に true。
      const isPremium = await page.evaluate(() => globalThis.__noteAbstract.License.isPremium());
      expect(isPremium).toBe(true);

      // Clear any prior state.
      await page.evaluate(() => globalThis.__noteAbstract.Storage.clearHistory());

      // addHistory はガードなしで実行される。
      await page.evaluate(async () => {
        const ns = globalThis.__noteAbstract;
        const premium = await ns.License.isPremium();
        if (premium) {
          await ns.Storage.addHistory({ url: 'https://note.com/free-test', title: 'Free test' });
        }
      });

      const all = await page.evaluate(() => globalThis.__noteAbstract.Storage.getHistory());
      // isPremium = true なので addHistory が実行されエントリが存在する。
      const hasFreeEntry = all.some((e) => e.url === 'https://note.com/free-test');
      expect(hasFreeEntry).toBe(true);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: Premium tier — history tab renders entries
  // -------------------------------------------------------------------------
  test('premium: history tab shows 3 entries and modal opens on click', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);

      await writeLicenseViaWorker(worker, TEST_LICENSE_CODE);

      const page = await openArticleAndPanel(context, worker);

      // Wait for history tab to be unlocked.
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const btn = host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]');
        return btn && !btn.disabled;
      }, { timeout: 5000 });

      // Insert 3 history entries directly via extension page evaluate.
      const extensionId = getExtensionId(worker);
      const optPage = await context.newPage();
      await optPage.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await optPage.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      await optPage.evaluate(async () => {
        const s = globalThis.__noteAbstract.Storage;
        await s.clearHistory();
        await s.addHistory({ url: 'https://note.com/a/n/n001', title: '記事A', summary: 'サマリーA' });
        await s.addHistory({ url: 'https://note.com/a/n/n002', title: '記事B', prediction: '予測B' });
        await s.addHistory({ url: 'https://note.com/a/n/n003', title: '記事C', keywords: ['kw1'] });
      });
      await optPage.close();

      // Activate the history tab in the side panel.
      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]').click();
      });

      // Wait for history list to populate.
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const sr = host.shadowRoot;
        const list = sr.querySelector('[data-role="history-list"]');
        return list && list.querySelectorAll('.history-entry').length >= 3;
      }, { timeout: 5000 });

      const entryCount = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const sr = host.shadowRoot;
        return sr.querySelectorAll('.history-entry').length;
      });
      expect(entryCount).toBeGreaterThanOrEqual(3);

      // Click the first entry and verify modal appears.
      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const sr = host.shadowRoot;
        const entry = sr.querySelector('.history-entry');
        if (entry) entry.click();
      });

      const modalVisible = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const sr = host.shadowRoot;
        const overlay = sr.querySelector('[data-role="history-modal-overlay"]');
        return overlay && !overlay.hidden;
      });
      expect(modalVisible).toBe(true);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: Options page — history list and search
  // -------------------------------------------------------------------------
  test('options page: history table shows 3 rows and search filters to 1', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeLicenseViaWorker(worker, TEST_LICENSE_CODE);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      // Insert 3 entries with distinct titles.
      await page.evaluate(async () => {
        const s = globalThis.__noteAbstract.Storage;
        await s.clearHistory();
        await s.addHistory({ url: 'https://note.com/a/n/n001', title: 'AI と社会', summary: 'サマリー' });
        await s.addHistory({ url: 'https://note.com/a/n/n002', title: 'デザイン論', summary: 'サマリー' });
        await s.addHistory({ url: 'https://note.com/a/n/n003', title: 'マーケティング入門', summary: 'サマリー' });
      });

      // Reload the page so the history section re-renders with premium state.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      // Wait for the unlocked history area to be visible.
      await page.waitForFunction(() => {
        const area = document.getElementById('history-unlocked-area');
        return area && !area.hidden;
      }, { timeout: 5000 });

      // Wait for 3 rows.
      await page.waitForFunction(() => {
        const tbody = document.getElementById('history-table-body');
        return tbody && tbody.querySelectorAll('tr').length >= 3;
      }, { timeout: 5000 });

      const rowCount = await page.$eval('#history-table-body', (el) => el.querySelectorAll('tr').length);
      expect(rowCount).toBe(3);

      // Type a search query that matches only 1 entry.
      await page.fill('#history-search-input', 'AI');
      await page.waitForFunction(() => {
        const tbody = document.getElementById('history-table-body');
        return tbody && tbody.querySelectorAll('tr').length === 1;
      }, { timeout: 5000 });

      const filteredCount = await page.$eval('#history-table-body', (el) => el.querySelectorAll('tr').length);
      expect(filteredCount).toBe(1);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: JSON export
  // -------------------------------------------------------------------------
  test('options page: JSON export produces valid §3.3 structure', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeLicenseViaWorker(worker, TEST_LICENSE_CODE);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      await page.evaluate(async () => {
        const s = globalThis.__noteAbstract.Storage;
        await s.clearHistory();
        await s.addHistory({
          url: 'https://note.com/export/n/n001',
          title: 'エクスポートテスト',
          summary: 'サマリー',
          keyPoints: ['P1'],
        });
      });

      // Wait for unlocked area.
      await page.waitForFunction(() => {
        const area = document.getElementById('history-unlocked-area');
        return area && !area.hidden;
      }, { timeout: 5000 });

      // Trigger JSON export and capture the download.
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 8000 }),
        page.click('#history-export-json-btn'),
      ]);

      const downloadPath = path.join(os.tmpdir(), `history-export-test-${Date.now()}.json`);
      await download.saveAs(downloadPath);

      const content = fs.readFileSync(downloadPath, 'utf8');
      const data = JSON.parse(content);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      const first = data[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('url');
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('createdAt');

      fs.rmSync(downloadPath, { force: true });
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 6: Clear all history
  // -------------------------------------------------------------------------
  test('options page: clearHistory empties the table', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeLicenseViaWorker(worker, TEST_LICENSE_CODE);
      const extensionId = getExtensionId(worker);

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      await page.evaluate(async () => {
        const s = globalThis.__noteAbstract.Storage;
        await s.clearHistory();
        await s.addHistory({ url: 'https://note.com/x/n/n001', title: '削除テスト' });
        await s.addHistory({ url: 'https://note.com/x/n/n002', title: '削除テスト2' });
      });

      await page.waitForFunction(() => {
        const area = document.getElementById('history-unlocked-area');
        return area && !area.hidden;
      }, { timeout: 5000 });

      await page.waitForFunction(() => {
        const tbody = document.getElementById('history-table-body');
        return tbody && tbody.querySelectorAll('tr').length >= 2;
      }, { timeout: 5000 });

      // Accept the confirm dialog and click clear button.
      page.on('dialog', (d) => d.accept());
      await page.click('#history-clear-all-btn');

      // Table should show empty state.
      await page.waitForFunction(() => {
        const emptyMsg = document.getElementById('history-empty-msg');
        return emptyMsg && !emptyMsg.hidden;
      }, { timeout: 5000 });

      const rowCount = await page.$eval('#history-table-body', (el) => el.querySelectorAll('tr').length);
      expect(rowCount).toBe(0);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 7: Sprint 11 全機能無料化 — license revocation 後も history tab は
  //         unlocked のまま。データは保持される。
  // -------------------------------------------------------------------------
  test('license revocation: history tab stays unlocked and Storage.getHistory still returns data', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);
      await writeLicenseViaWorker(worker, TEST_LICENSE_CODE);

      // Add some history via options page.
      const extensionId = getExtensionId(worker);
      const optPage = await context.newPage();
      await optPage.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await optPage.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.addHistory === 'function';
      }, { timeout: 5000 });

      await optPage.evaluate(async () => {
        const s = globalThis.__noteAbstract.Storage;
        await s.clearHistory();
        await s.addHistory({ url: 'https://note.com/a/n/n001', title: 'ロックテスト記事' });
      });
      await optPage.close();

      const page = await openArticleAndPanel(context, worker);

      // Confirm unlocked state.
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const btn = host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]');
        return btn && !btn.disabled;
      }, { timeout: 5000 });

      // Revoke license (storage record 削除)。
      await clearLicenseViaWorker(worker);
      await page.waitForTimeout(1000);

      // Sprint 11: isPremium は常に true — 履歴タブは再ロックされない。
      const tabState = await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const btn = host.shadowRoot.querySelector('nav.tabs button[data-tab="history"]');
        return { disabled: btn ? btn.disabled : null, hasLock: btn ? !!btn.querySelector('.lock-glyph') : false };
      });
      expect(tabState.disabled).toBe(false);
      expect(tabState.hasLock).toBe(false);

      // Data should still be in storage (not deleted).
      const optPage2 = await context.newPage();
      await optPage2.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await optPage2.waitForFunction(() => {
        const ns = globalThis.__noteAbstract;
        return ns && ns.Storage && typeof ns.Storage.getHistory === 'function';
      }, { timeout: 5000 });

      const remaining = await optPage2.evaluate(() => globalThis.__noteAbstract.Storage.getHistory());
      expect(Array.isArray(remaining)).toBe(true);
      expect(remaining.length).toBeGreaterThan(0);
      expect(remaining[0].title).toBe('ロックテスト記事');
      await optPage2.close();
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

});
