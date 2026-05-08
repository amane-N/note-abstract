// @ts-check
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';

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

const getServiceWorker = async (context) => {
  const existing = context.serviceWorkers();
  if (existing.length > 0) return existing[0];
  return await context.waitForEvent('serviceworker');
};

const togglePanelViaWorker = async (worker, tabUrl) => {
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url: url + '*' });
    const tab = tabs[0];
    if (!tab) throw new Error(`tab not found for ${url}`);
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
  }, tabUrl);
};

const readPanelState = (page) =>
  page.evaluate(() => {
    const host = document.getElementById('note-abstract-host');
    if (!host || !host.shadowRoot) return null;
    const panel = host.shadowRoot.querySelector('.panel');
    if (!panel) return null;
    return {
      state: panel.dataset.state,
      width: panel.style.getPropertyValue('--panel-width'),
      stage: panel.querySelector('.stage')?.dataset.stage || null,
      stageText: panel.querySelector('.stage-text')?.textContent || '',
      readingTime: panel.querySelector('[data-role="reading-time"]')?.textContent || '',
      abstract: panel.querySelector('[data-role="abstract"]')?.textContent || '',
      keyPoints: Array.from(
        panel.querySelectorAll('[data-role="key-points"] li')
      ).map((li) => li.textContent || ''),
      fallbackVisible: !panel.querySelector('[data-role="fallback"]')?.hidden,
      fallbackText: panel.querySelector('[data-role="fallback"]')?.textContent || '',
      tabIds: Array.from(panel.querySelectorAll('nav.tabs button')).map((b) => b.dataset.tab),
      activeTabIds: Array.from(panel.querySelectorAll('.tab-panel'))
        .filter((sec) => sec.dataset.active === 'true')
        .map((sec) => sec.dataset.tab),
      hasResizeHandle: !!panel.querySelector('.resize-handle'),
    };
  });

test.describe('Sprint 2: free-tier core (panel + summarizer wiring)', () => {
  test('side panel toggles, shows reading time + 5 tabs, ESC closes, drag resizes', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const worker = await getServiceWorker(context);

      const page = await context.newPage();
      const consoleLogs = [];
      page.on('console', (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));

      await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForFunction(
        () => !!document.getElementById('note-abstract-host'),
        { timeout: 15000 }
      );

      let state = await readPanelState(page);
      expect(state, 'panel mounted before toggle').not.toBeNull();
      expect(state.state, 'initial state is closed').toBe('closed');
      expect(state.tabIds, 'five tabs').toEqual([
        'summary',
        'prediction',
        'related',
        'history',
        'settings',
      ]);
      expect(state.hasResizeHandle, 'resize handle present').toBe(true);

      await togglePanelViaWorker(worker, NOTE_ARTICLE_URL);

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'open';
      }, { timeout: 5000 });

      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        const stage = panel && panel.querySelector('.stage');
        return stage && (stage.dataset.stage === 'done' || stage.dataset.stage === 'error');
      }, { timeout: 20000 });

      state = await readPanelState(page);
      expect(state.state).toBe('open');
      expect(state.readingTime).toMatch(/約\s*\d+\s*分/);
      expect(['done', 'error']).toContain(state.stage);

      const summaryRendered = state.abstract && state.abstract.length >= 50 && state.keyPoints.length >= 3;
      const fallbackRendered = state.fallbackVisible && state.fallbackText.length > 0;
      expect(
        summaryRendered || fallbackRendered,
        `expected either real summary or fallback notice. state=${JSON.stringify(state)}`
      ).toBe(true);

      const cssLeak = await page.evaluate(() => {
        const articleHeader = document.querySelector('h1.o-noteContentHeader__title, header h1, h1');
        if (!articleHeader) return { headerFound: false };
        const cs = window.getComputedStyle(articleHeader);
        return {
          headerFound: true,
          fontFamily: cs.fontFamily,
          color: cs.color,
        };
      });
      expect(cssLeak.headerFound, 'note article header still in DOM (DOM unchanged)').toBe(true);

      const beforeWidth = state.width;
      await page.evaluate(() => {
        const host = document.getElementById('note-abstract-host');
        const handle = host.shadowRoot.querySelector('.resize-handle');
        const rect = handle.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        const dispatch = (type, x) =>
          handle.dispatchEvent(
            new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: startY })
          );
        const dispatchDoc = (type, x) =>
          document.dispatchEvent(
            new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: startY })
          );
        dispatch('mousedown', startX);
        dispatchDoc('mousemove', startX - 60);
        dispatchDoc('mouseup', startX - 60);
      });
      const afterState = await readPanelState(page);
      const beforePx = parseInt(String(beforeWidth).replace('px', ''), 10) || 380;
      const afterPx = parseInt(String(afterState.width).replace('px', ''), 10) || 380;
      expect(afterPx, `width should grow toward MAX after dragging left. before=${beforePx} after=${afterPx}`).toBeGreaterThan(beforePx);
      expect(afterPx).toBeLessThanOrEqual(600);
      expect(afterPx).toBeGreaterThanOrEqual(300);

      await page.keyboard.press('Escape');
      await page.waitForFunction(() => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.state === 'closed';
      }, { timeout: 3000 });

      const errorLogs = consoleLogs.filter(
        (l) => l.type === 'error' && l.text.includes('[note-abstract]')
      );
      expect(errorLogs, 'no [note-abstract] errors').toEqual([]);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('note-parser excludes paywall content (fixture)', async () => {
    const { context, userDataDir } = await launchExtensionContext();
    try {
      const page = await context.newPage();
      await page.goto('about:blank');

      const parserSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'src', 'lib', 'note-parser.js'),
        'utf8'
      );
      await page.addScriptTag({ content: parserSrc });

      const result = await page.evaluate(() => {
        const fixture = document.createElement('div');
        fixture.id = 'na-test-fixture';
        fixture.innerHTML = `
          <h1 class="o-noteContentHeader__title">テスト記事タイトル</h1>
          <div class="note-common-styles__textnote-body">
            <div class="o-noteContentText">
              <p>無料部分の本文テキストです。これは要約に含まれるべきです。</p>
              <p>もう一段落の無料テキスト。</p>
              <div class="o-noteAreaPaymentWall">続きをみるには 100円</div>
              <p class="paywall-content">SECRET_PAID_CONTENT_DO_NOT_INCLUDE</p>
              <p>SECRET_AFTER_PAYWALL_DO_NOT_INCLUDE</p>
            </div>
          </div>
        `;
        const parsed = window.__noteAbstract.NoteParser.extractArticle(fixture);
        return parsed;
      });

      expect(result.ok, `parser succeeded: ${JSON.stringify(result)}`).toBe(true);
      expect(result.title).toBe('テスト記事タイトル');
      expect(result.body).toContain('無料部分の本文テキスト');
      expect(result.body, 'paywall purchase prompt excluded').not.toContain('続きをみるには');
      expect(result.body, 'class=paywall-content text excluded').not.toContain('SECRET_PAID_CONTENT_DO_NOT_INCLUDE');
      expect(result.body, 'text after paywall marker excluded').not.toContain('SECRET_AFTER_PAYWALL_DO_NOT_INCLUDE');
      expect(result.hasPaywall, 'paywall flag exposed').toBe(true);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
