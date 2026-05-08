// @ts-check
// Diagnostic: simulate the exact dispatchToggle path that
// chrome.action.onClicked invokes in service-worker.js, capturing every step
// so we can see *exactly* where and why it would fail in the user's
// environment. We do this in the SW's own context, NOT via page.evaluate,
// because content scripts run in an isolated world that page.evaluate cannot
// see (this caused a false alarm in the previous diagnostic run).
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const NON_ARTICLE_URL = 'https://note.com/';

const CONTENT_SCRIPT_FILES = [
  'src/lib/crypto.js',
  'src/lib/storage.js',
  'src/lib/note-parser.js',
  'src/lib/nano-summarizer.js',
  'src/lib/gemini-client.js',
  'src/lib/predictor.js',
  'src/lib/keyword-suggester.js',
  'src/content/side-panel.js',
  'src/content/content.js',
];

test('diagnose: simulate dispatchToggle and report every step', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-diag-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const swLogs = [];
  const pageLogs = [];
  const pageErrors = [];

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker');
    worker.on('console', (msg) => swLogs.push(`[SW:${msg.type()}] ${msg.text()}`));

    const page = await context.newPage();
    page.on('console', (msg) => pageLogs.push(`[PAGE:${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => pageErrors.push(`[PAGEERROR] ${err && err.message ? err.message : err}`));

    await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    // Wait until the host element appears (proves manifest content_scripts ran).
    await page.waitForFunction(
      () => !!document.getElementById('note-abstract-host'),
      { timeout: 15000 }
    );

    // Reproduce dispatchToggle step by step, in the SW context.
    const trace = await worker.evaluate(async ({ url, files }) => {
      const NOTE_RE = /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/;
      const result = { steps: [] };

      const tabs = await chrome.tabs.query({ url: url + '*' });
      const tab = tabs[0];
      result.steps.push({ step: 'query-tab', tabId: tab && tab.id, url: tab && tab.url });
      if (!tab) {
        result.fatal = 'no-tab';
        return result;
      }
      if (!tab.url || !NOTE_RE.test(tab.url)) {
        result.fatal = 'url-mismatch';
        return result;
      }

      // 1) PING (this is what dispatchToggle does first via ensureContentScripts).
      let pingOk = false;
      let pingErr = null;
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        pingOk = !!(resp && resp.ok);
      } catch (err) {
        pingErr = String(err && err.message ? err.message : err);
      }
      result.steps.push({ step: 'ping-1', pingOk, pingErr });

      // 2) If PING failed, attempt scripting.executeScript with the same list.
      if (!pingOk) {
        let injectErr = null;
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
        } catch (err) {
          injectErr = String(err && err.message ? err.message : err);
        }
        result.steps.push({ step: 'inject', injectErr });
        if (injectErr) {
          result.fatal = 'inject-failed';
          return result;
        }
        // Wait briefly and re-PING.
        await new Promise((r) => setTimeout(r, 200));
        let pingOk2 = false;
        try {
          const resp2 = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
          pingOk2 = !!(resp2 && resp2.ok);
        } catch (e) {
          // ignore
        }
        result.steps.push({ step: 'ping-2', pingOk2 });
        if (!pingOk2) {
          result.fatal = 'ping-after-inject-failed';
          return result;
        }
      }

      // 3) Send TOGGLE_SIDE_PANEL.
      let toggleErr = null;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
      } catch (err) {
        toggleErr = String(err && err.message ? err.message : err);
      }
      result.steps.push({ step: 'toggle', toggleErr });
      if (toggleErr && !/message channel closed/i.test(toggleErr)) {
        result.fatal = 'toggle-failed';
        return result;
      }
      result.ok = true;
      return result;
    }, { url: NOTE_ARTICLE_URL, files: CONTENT_SCRIPT_FILES });

    // Wait for the panel to actually become visible after the toggle.
    let panelOpened = false;
    let panelDataset = null;
    try {
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });
      panelOpened = true;
    } catch (_) {
      panelOpened = false;
    }

    panelDataset = await page.evaluate(() => {
      const host = document.getElementById('note-abstract-host');
      const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
      const inlineTransform = panel && panel.style && panel.style.transform;
      return panel
        ? {
            state: panel.dataset.state,
            width: panel.style.getPropertyValue('--panel-width'),
            inlineTransform,
            visible: panel.getBoundingClientRect().width > 0,
          }
        : null;
    });

    console.log('--- DIAGNOSIS REPORT ---');
    console.log('trace:', JSON.stringify(trace, null, 2));
    console.log('panelOpened:', panelOpened);
    console.log('panelDataset:', JSON.stringify(panelDataset));
    console.log('--- pageErrors (' + pageErrors.length + ') ---');
    pageErrors.forEach((l) => console.log(l));
    console.log('--- pageLogs (' + pageLogs.length + ') ---');
    pageLogs.forEach((l) => console.log(l));
    console.log('--- swLogs (' + swLogs.length + ') ---');
    swLogs.forEach((l) => console.log(l));
    console.log('--- END ---');

    expect(trace.ok, `dispatchToggle reproduction failed: ${JSON.stringify(trace)}`).toBe(true);
    expect(pageErrors.length, `page errors: ${pageErrors.join(' / ')}`).toBe(0);
    expect(panelOpened, 'panel should be in open state').toBe(true);
    expect(panelDataset && panelDataset.state, 'panel.dataset.state').toBe('open');
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('diagnose: stale-tab + executeScript injection recovers correctly', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-diag-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const swLogs = [];
  const pageLogs = [];
  const pageErrors = [];

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker');
    worker.on('console', (msg) => swLogs.push(`[SW:${msg.type()}] ${msg.text()}`));

    const page = await context.newPage();
    page.on('console', (msg) => pageLogs.push(`[PAGE:${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => pageErrors.push(`[PAGEERROR] ${err.message || err}`));

    await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(
      () => !!document.getElementById('note-abstract-host'),
      { timeout: 15000 }
    );

    // Force a state where pings will fail by injecting a "kill" script that
    // wipes the listener. This mimics what happens when Chrome tears down the
    // old isolated world after extension reload — manifest content_scripts
    // don't auto-reinject on already-loaded pages, so the page is left without
    // any extension listener.
    const tabId = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url: url + '*' });
      return tabs[0].id;
    }, NOTE_ARTICLE_URL);

    await worker.evaluate(async (id) => {
      // Inject code that wipes the init flag and removes the host. This simulates
      // a torn-down isolated world (the page's main world keeps running, but
      // the extension's content-script context is gone).
      await chrome.scripting.executeScript({
        target: { tabId: id },
        world: 'ISOLATED',
        func: () => {
          // Note: cannot truly kill the isolated world. But we can clear the
          // namespace and host element to simulate the symptoms.
          const host = document.getElementById('note-abstract-host');
          if (host) host.remove();
          delete globalThis.__noteAbstract;
          delete globalThis.__noteAbstractContentInitialized;
          // Best-effort: chrome.runtime.onMessage listeners cannot be removed
          // from outside, so PING may still respond. We log a marker so the
          // diagnostic can see this.
          console.log('[DIAG] simulated extension reload — globals wiped');
        },
      });
    }, tabId);

    await page.waitForTimeout(500);

    // Now try the full dispatchToggle path (PING → inject → re-PING → toggle).
    const trace = await worker.evaluate(async ({ id, files }) => {
      const result = { steps: [] };

      let pingOk = false;
      try {
        const r = await chrome.tabs.sendMessage(id, { type: 'PING' });
        pingOk = !!(r && r.ok);
      } catch (e) {
        result.steps.push({ step: 'ping-1-error', error: String(e.message || e) });
      }
      result.steps.push({ step: 'ping-1', pingOk });

      // Force injection regardless to test the file list.
      let injectErr = null;
      try {
        await chrome.scripting.executeScript({ target: { tabId: id }, files });
      } catch (err) {
        injectErr = String(err.message || err);
      }
      result.steps.push({ step: 'inject', injectErr });
      if (injectErr) {
        result.fatal = 'inject-failed';
        return result;
      }

      await new Promise((r) => setTimeout(r, 300));

      let pingOk2 = false;
      try {
        const r = await chrome.tabs.sendMessage(id, { type: 'PING' });
        pingOk2 = !!(r && r.ok);
      } catch (e) {
        result.steps.push({ step: 'ping-2-error', error: String(e.message || e) });
      }
      result.steps.push({ step: 'ping-2', pingOk2 });

      let toggleErr = null;
      try {
        await chrome.tabs.sendMessage(id, { type: 'TOGGLE_SIDE_PANEL' });
      } catch (err) {
        toggleErr = String(err.message || err);
      }
      result.steps.push({ step: 'toggle', toggleErr });
      result.ok = !toggleErr || /message channel closed/i.test(toggleErr);
      return result;
    }, { id: tabId, files: CONTENT_SCRIPT_FILES });

    let panelOpened = false;
    try {
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });
      panelOpened = true;
    } catch (_) {
      panelOpened = false;
    }

    console.log('--- STALE-TAB RECOVERY REPORT ---');
    console.log('trace:', JSON.stringify(trace, null, 2));
    console.log('panelOpened:', panelOpened);
    console.log('--- swLogs (' + swLogs.length + ') ---');
    swLogs.forEach((l) => console.log(l));
    console.log('--- pageErrors (' + pageErrors.length + ') ---');
    pageErrors.forEach((l) => console.log(l));
    console.log('--- pageLogs (last 25) ---');
    pageLogs.slice(-25).forEach((l) => console.log(l));
    console.log('--- END ---');

    expect(trace.ok, `dispatchToggle (stale tab) failed: ${JSON.stringify(trace)}`).toBe(true);
    expect(panelOpened, 'panel should reopen after re-injection').toBe(true);
    expect(pageErrors.length, `page errors during recovery: ${pageErrors.join(' / ')}`).toBe(0);
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('diagnose: simulate clicking icon while a non-article tab is active (bad UX path)', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-diag-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker');

    const page = await context.newPage();
    await page.goto(NON_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const result = await worker.evaluate(async (url) => {
      const NOTE_RE = /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/;
      const tabs = await chrome.tabs.query({ url: url + '*' });
      const tab = tabs[0];
      return {
        tabUrl: tab && tab.url,
        matchesArticleRegex: !!(tab && NOTE_RE.test(tab.url)),
      };
    }, NON_ARTICLE_URL);

    console.log('non-article tab probe:', JSON.stringify(result));
    expect(result.tabUrl).toContain('note.com');
    expect(result.matchesArticleRegex).toBe(false);
    // Confirms: if user clicks the icon while on note.com homepage (or any
    // non-article page), dispatchToggle aborts with badge "!". This is a
    // common cause of "icon does nothing" reports.
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
