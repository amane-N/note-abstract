// @ts-check
'use strict';

/**
 * Sprint 8: エクスポート連携 — Obsidian / Notion / note 下書き
 *
 * Coverage:
 *  § 1 Static checks on src/lib/exporter.js (formats / clipboard helper exist)
 *  § 2 Pure-JS unit tests run inside a service-worker-like context: feed each
 *      formatter a representative entry and verify the §6 acceptance criteria
 *      ("YAML 4 項目以上 + 本文" / "見出しと箇条書き" / "プレーンテキスト + URL").
 *  § 3 Source-level checks on src/content/side-panel.js (export buttons exist
 *      and are gated on premium status).
 *  § 4 Browser test: free-tier panel hides all export buttons; premium-tier
 *      panel exposes them. Also verifies that picking "note 下書きへ送信" sends
 *      OPEN_NOTE_DRAFT to the service worker, which opens https://note.com/new
 *      in a new tab.
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const TEST_LICENSE_CODE = 'NA-TEST-DEMO-MODE';

const launchExtensionContext = async (suffix) => {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `note-abstract-e2e-s8-${suffix || ''}-`)
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
// § 1  Static checks on exporter.js
// ---------------------------------------------------------------------------

test.describe('Sprint 8 — exporter.js source checks (static)', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'lib', 'exporter.js'),
      'utf8'
    );
  });

  test('exporter.js exports the four required functions', () => {
    expect(src).toMatch(/toObsidian/);
    expect(src).toMatch(/toNotion/);
    expect(src).toMatch(/toNoteDraft/);
    expect(src).toMatch(/copyToClipboard/);
    expect(src).toMatch(/ns\.Exporter\s*=/);
  });

  test('exporter.js attaches Exporter to the shared globalThis namespace', () => {
    expect(src).toMatch(/globalThis\.__noteAbstract/);
  });

  test('exporter.js performs no network I/O (no fetch / XHR / WebSocket)', () => {
    // Sprint 8 NEVER 6: telemetry-free. The module must not call out anywhere.
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/\bnew\s+WebSocket\s*\(/);
    expect(src).not.toMatch(/sendBeacon/);
  });

  test('exporter.js uses navigator.clipboard for copy', () => {
    expect(src).toMatch(/navigator\.clipboard/);
  });
});

// ---------------------------------------------------------------------------
// § 2  Behavioural unit tests for the three formatters
// Run the IIFE inside a freshly-prepared globalThis inside Node so we avoid
// a browser launch for the pure formatting logic.
// ---------------------------------------------------------------------------

test.describe('Sprint 8 — exporter.js formatter behaviour', () => {
  /** @type {{
   *   toObsidian: (e: any) => string,
   *   toNotion: (e: any) => string,
   *   toNoteDraft: (e: any) => string,
   *   copyToClipboard: (s: string) => Promise<boolean>,
   * }} */
  let Exporter;

  test.beforeAll(() => {
    const exporterSrc = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'lib', 'exporter.js'),
      'utf8'
    );
    // Use a sandboxed evaluation so the IIFE binds Exporter to a local ns.
    const fakeGlobal = {};
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'globalThis',
      'navigator',
      'document',
      `${exporterSrc}; return globalThis.__noteAbstract.Exporter;`
    );
    Exporter = factory(fakeGlobal, {}, {});
    expect(typeof Exporter.toObsidian).toBe('function');
    expect(typeof Exporter.toNotion).toBe('function');
    expect(typeof Exporter.toNoteDraft).toBe('function');
    expect(typeof Exporter.copyToClipboard).toBe('function');
  });

  const sampleEntry = {
    id: 'uuid-1',
    url: 'https://note.com/example/n/abc123',
    title: 'AI と未来の働き方',
    createdAt: '2026-05-09T12:00:00.000Z',
    summary: 'この記事は AI が労働市場に与える影響を考察している。',
    keyPoints: ['ホワイトカラーの自動化が加速', '創造的職種の重要性が増す', '再教育の機会が必要'],
    prediction: '今後 5 年で職業構成が大きく変わるだろう。',
    keywords: ['AI', '労働市場', '再教育'],
    templateId: 'standard',
  };

  test('toObsidian: emits YAML frontmatter with 4+ keys and a body', () => {
    const out = Exporter.toObsidian(sampleEntry);

    // Frontmatter delimiters
    const yamlMatch = out.match(/^---\n([\s\S]*?)\n---/);
    expect(yamlMatch, 'YAML frontmatter not detected').toBeTruthy();
    const yamlBlock = yamlMatch[1];

    // Count top-level YAML keys (lines that start with `key:` at column 0).
    const topLevelKeys = yamlBlock
      .split('\n')
      .filter((line) => /^[a-zA-Z_][a-zA-Z0-9_]*:/.test(line));
    expect(topLevelKeys.length).toBeGreaterThanOrEqual(4);

    // The entry's title and URL must round-trip into YAML.
    expect(yamlBlock).toContain('title: ');
    expect(yamlBlock).toContain('url: ');
    expect(yamlBlock).toContain('created: ');
    expect(yamlBlock).toMatch(/source:|tags:|templateId:/);

    // Body sections
    expect(out).toMatch(/# AI と未来の働き方/);
    expect(out).toMatch(/## アブストラクト/);
    expect(out).toMatch(/## キーポイント/);
    expect(out).toMatch(/- ホワイトカラーの自動化が加速/);
    expect(out).toMatch(/## 関連キーワード/);
    expect(out).toMatch(/https:\/\/note\.com\/example\/n\/abc123/);
  });

  test('toNotion: emits headings + bullet lists (no YAML frontmatter)', () => {
    const out = Exporter.toNotion(sampleEntry);

    // No YAML frontmatter — Notion does not parse it.
    expect(out.startsWith('---\n')).toBe(false);

    // Title heading + section headings
    expect(out).toMatch(/^# AI と未来の働き方/m);
    expect(out).toMatch(/## アブストラクト/);
    expect(out).toMatch(/## キーポイント/);
    expect(out).toMatch(/## 関連キーワード/);

    // Bullet list for keyPoints + keywords
    const bulletLines = out.split('\n').filter((l) => l.startsWith('- '));
    expect(bulletLines.length).toBeGreaterThanOrEqual(3);

    // Source URL is included in a quote line at the top.
    expect(out).toMatch(/> Source: https:\/\/note\.com\/example\/n\/abc123/);
  });

  test('toNoteDraft: plain text + URL quote, no Markdown headings', () => {
    const out = Exporter.toNoteDraft(sampleEntry);

    // Plain text: must NOT contain `# ` Markdown headings or `---` frontmatter.
    expect(out).not.toMatch(/^# /m);
    expect(out).not.toContain('---\n');
    expect(out).not.toMatch(/^## /m);

    // Title in brackets, body, URL quoted with `>`.
    expect(out).toMatch(/【AI と未来の働き方/);
    expect(out).toContain('AI が労働市場に与える影響');
    expect(out).toMatch(/^>\s*https:\/\/note\.com\/example\/n\/abc123/m);

    // Bullet glyphs use `・` (note's convention) rather than Markdown `- `.
    expect(out).toMatch(/・ホワイトカラーの自動化が加速/);
  });

  test('formatters tolerate missing fields without throwing', () => {
    expect(() => Exporter.toObsidian({})).not.toThrow();
    expect(() => Exporter.toNotion({})).not.toThrow();
    expect(() => Exporter.toNoteDraft({})).not.toThrow();
    expect(() => Exporter.toObsidian(null)).not.toThrow();
    expect(() => Exporter.toNotion(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// § 3  side-panel.js source checks (export UI exists + premium gating)
// ---------------------------------------------------------------------------

test.describe('Sprint 8 — side-panel.js export UI (source check)', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'content', 'side-panel.js'),
      'utf8'
    );
  });

  test('side-panel.js declares the four export buttons + modal export button', () => {
    expect(src).toMatch(/data-role="summary-export"/);
    expect(src).toMatch(/data-role="prediction-export"/);
    expect(src).toMatch(/data-role="related-export"/);
    expect(src).toMatch(/data-role="history-export"/);
    expect(src).toMatch(/data-role="history-modal-export"/);
  });

  test('side-panel.js declares the export popover with three formats', () => {
    expect(src).toMatch(/data-format="obsidian"/);
    expect(src).toMatch(/data-format="notion"/);
    expect(src).toMatch(/data-format="note-draft"/);
  });

  test('side-panel.js uses [data-premium] attribute on panel element', () => {
    // Sprint 11: CSS ルール ".panel:not([data-premium='true']) .export-btn" は削除済み。
    // data-premium 属性自体は互換性のため残っている。
    expect(src).toMatch(/data-premium/);
    // Sprint 11 注記コメントが存在する。
    expect(src).toMatch(/Sprint 11/);
  });

  test('side-panel.js wires OPEN_NOTE_DRAFT for the note-draft format', () => {
    expect(src).toMatch(/OPEN_NOTE_DRAFT/);
  });

  test('side-panel.js shows a toast after export', () => {
    expect(src).toMatch(/_showToast/);
    expect(src).toMatch(/data-role="toast"/);
  });
});

// ---------------------------------------------------------------------------
// § 4  service-worker.js opens https://note.com/new for OPEN_NOTE_DRAFT
// ---------------------------------------------------------------------------

test.describe('Sprint 8 — service-worker.js OPEN_NOTE_DRAFT handler (source check)', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'background', 'service-worker.js'),
      'utf8'
    );
  });

  test('service-worker.js handles OPEN_NOTE_DRAFT and opens note.com/new', () => {
    expect(src).toMatch(/OPEN_NOTE_DRAFT/);
    expect(src).toMatch(/chrome\.tabs\.create/);
    expect(src).toMatch(/https:\/\/note\.com\/new/);
  });

  test('service-worker.js content-script list includes exporter.js', () => {
    expect(src).toMatch(/src\/lib\/exporter\.js/);
  });
});

// ---------------------------------------------------------------------------
// § 5  Browser test: premium gating + note-draft new-tab behaviour
// ---------------------------------------------------------------------------

test.describe('Sprint 8 — browser: premium gating + note-draft tab open', () => {
  let context;
  let worker;
  let userDataDir;

  test.beforeAll(async () => {
    ({ context, userDataDir } = await launchExtensionContext('panel'));
    worker = await getServiceWorker(context);
  });

  test.afterAll(async () => {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  const writeLicense = async (code) => {
    await worker.evaluate(async (c) => {
      await chrome.storage.local.set({ license: { code: c, activatedAt: Date.now() } });
    }, code);
  };
  const clearLicense = async () => {
    await worker.evaluate(async () => { await chrome.storage.local.remove('license'); });
  };

  const togglePanel = async (page) => {
    await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url: url + '*' });
      const tab = tabs[0];
      if (!tab) throw new Error('no tab');
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
    }, NOTE_ARTICLE_URL);
    await page.waitForFunction(() => {
      const host = document.getElementById('note-abstract-host');
      const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
      return panel && panel.dataset.state === 'open';
    }, { timeout: 5000 });
  };

  test('Sprint 11: export buttons are always visible (no license required)', async () => {
    // Sprint 11 全機能無料化 — license なしでもエクスポートボタンは常に表示される。
    await clearLicense();
    const page = await context.newPage();
    await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(
      () => !!document.getElementById('note-abstract-host'),
      { timeout: 15000 }
    );
    await togglePanel(page);

    // isPremium は常に true のため、panel[data-premium] は 'true' になる。
    await page.waitForFunction(
      () => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.premium === 'true';
      },
      { timeout: 8000 }
    );

    const result = await page.evaluate(() => {
      const host = document.getElementById('note-abstract-host');
      if (!host || !host.shadowRoot) return { ok: false, reason: 'no host' };
      const panel = host.shadowRoot.querySelector('.panel');
      const summaryBtn = host.shadowRoot.querySelector('[data-role="summary-export"]');
      const predictionBtn = host.shadowRoot.querySelector('[data-role="prediction-export"]');
      const relatedBtn = host.shadowRoot.querySelector('[data-role="related-export"]');
      const buttons = [summaryBtn, predictionBtn, relatedBtn].filter(Boolean);
      const visible = buttons.map((b) => {
        const style = window.getComputedStyle(b);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        ok: true,
        premium: panel && panel.dataset.premium,
        present: buttons.length,
        visibleCount: visible.filter(Boolean).length,
      };
    });
    expect(result.ok).toBe(true);
    // isPremium 常時 true のため premium='true'。
    expect(result.premium).toBe('true');
    expect(result.present).toBeGreaterThanOrEqual(3);
    // エクスポートボタンはすべて表示されている。
    expect(result.visibleCount).toBeGreaterThanOrEqual(3);

    await page.close();
  });

  test('premium tier: export buttons become visible after license activation', async () => {
    await writeLicense(TEST_LICENSE_CODE);
    const page = await context.newPage();
    await page.goto(NOTE_ARTICLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(
      () => !!document.getElementById('note-abstract-host'),
      { timeout: 15000 }
    );
    await togglePanel(page);

    // Wait for the premium flag to flip on the panel (license check is async).
    await page.waitForFunction(
      () => {
        const host = document.getElementById('note-abstract-host');
        const panel = host && host.shadowRoot && host.shadowRoot.querySelector('.panel');
        return panel && panel.dataset.premium === 'true';
      },
      { timeout: 8000 }
    );

    const summaryVisible = await page.evaluate(() => {
      const host = document.getElementById('note-abstract-host');
      const btn = host.shadowRoot.querySelector('[data-role="summary-export"]');
      if (!btn) return false;
      const style = window.getComputedStyle(btn);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    expect(summaryVisible).toBe(true);

    await page.close();
    await clearLicense();
  });

  test('OPEN_NOTE_DRAFT message opens https://note.com/new in a new tab', async () => {
    // chrome.runtime.sendMessage from the service worker itself does NOT fire
    // the SW's own onMessage listener (Chrome routes messages only to *other*
    // contexts). To exercise the OPEN_NOTE_DRAFT handler we send the message
    // from an extension page (the options page), which is a separate context.
    const extId = new URL(worker.url()).host;
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extId}/src/options/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const newTabPromise = context.waitForEvent('page', { timeout: 10000 });

    await optionsPage.evaluate(async () => {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'OPEN_NOTE_DRAFT' }, (resp) => {
          resolve(resp);
        });
      });
    });

    const newPage = await newTabPromise;
    // note.com redirects unauthenticated visits to /new toward
    // /login?redirectPath=%2Fnotes%2Fnew. Both prove the SW handler routed to
    // the right URL — accept either, but require the redirectPath to encode
    // /notes/new when we see the login page.
    await newPage.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    const finalUrl = newPage.url();
    const looksRight =
      /^https:\/\/note\.com\/new/.test(finalUrl) ||
      /^https:\/\/note\.com\/login\?[^#]*redirectPath=(\/|%2F)notes(\/|%2F)new/.test(finalUrl);
    expect(looksRight, `unexpected URL after OPEN_NOTE_DRAFT: ${finalUrl}`).toBe(true);
    await newPage.close().catch(() => {});
    await optionsPage.close().catch(() => {});
  });
});
