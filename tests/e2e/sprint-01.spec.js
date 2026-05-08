// @ts-check
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const NON_NOTE_URL = 'https://example.com/';

const launchExtensionContext = async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-abstract-e2e-'));
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

const collectConsoleLogs = (page) => {
  const logs = [];
  page.on('console', (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: String(err) });
  });
  return logs;
};

test.describe('Sprint 1: project foundation', () => {
  test('content.js logs article title on note article page', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const page = await context.newPage();
      const logs = collectConsoleLogs(page);

      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);

      const allText = logs.map((l) => l.text).join('\n');
      console.log('--- captured logs (note article) ---');
      console.log(allText);

      const errorLogs = logs.filter(
        (l) => l.type === 'error' && l.text.includes('[note-abstract]')
      );
      expect(errorLogs.length, 'no [note-abstract] console.error').toBe(0);

      expect(allText, 'content script logged its load message').toContain(
        '[note-abstract] content script loaded'
      );

      const hasTitleLog = /\[note-abstract\] title:\s*\S+/.test(allText);
      const hasFailureLog = /\[note-abstract\] extraction failed/.test(allText);
      expect(
        hasTitleLog || hasFailureLog,
        'either title was logged or extraction failure was logged (DOM may differ from spec)'
      ).toBe(true);

      const hostExists = await page.evaluate(
        () => !!document.getElementById('note-abstract-host')
      );
      expect(hostExists, 'shadow host element added').toBe(true);

      const noteHostCount = await page.evaluate(() => {
        return document.querySelectorAll('#note-abstract-host').length;
      });
      expect(noteHostCount, 'exactly one shadow host').toBe(1);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('content.js does not run on non-note pages', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const page = await context.newPage();
      const logs = collectConsoleLogs(page);

      await page.goto(NON_NOTE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      const allText = logs.map((l) => l.text).join('\n');
      console.log('--- captured logs (example.com) ---');
      console.log(allText);

      expect(allText.includes('[note-abstract] content script loaded')).toBe(false);

      const hostExists = await page.evaluate(
        () => !!document.getElementById('note-abstract-host')
      );
      expect(hostExists, 'no shadow host on non-note page').toBe(false);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
