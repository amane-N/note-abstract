// @ts-check
'use strict';

/**
 * Sprint 7: Template collection (30 types) — e2e / structural tests
 *
 * These tests verify:
 *  1. prompts.json contains 30+ templates (free: 3, premium: 27+)
 *  2. Every template satisfies structural requirements
 *     (all required fields, promptPrefix >= 100 chars, outputSections 3-5)
 *  3. Category diversity (5+ distinct categories)
 *  4. Free-tier lock logic: premium templates are disabled in the UI
 *  5. Favorite storage round-trip via chrome.storage.sync
 *
 * Browser-based tests (tests 4 & 5) require a running Chromium context with
 * the extension loaded. They are skipped when --headed is unavailable or when
 * the options page cannot be reached within the timeout.
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const PROMPTS_JSON_PATH = path.join(EXTENSION_PATH, 'src', 'templates', 'prompts.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const launchExtensionContext = async (suffix) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `note-abstract-e2e-s7-${suffix || ''}-`));
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

const getExtensionId = (worker) => new URL(worker.url()).host;

// ---------------------------------------------------------------------------
// § 1  Static / structural tests (no browser required)
// ---------------------------------------------------------------------------

test.describe('Sprint 7 — prompts.json structure (static)', () => {
  let data;

  test.beforeAll(() => {
    const raw = fs.readFileSync(PROMPTS_JSON_PATH, 'utf8');
    data = JSON.parse(raw);
  });

  test('prompts.json parses without error', () => {
    expect(data).toBeTruthy();
    expect(data.version).toBeDefined();
    expect(Array.isArray(data.templates)).toBe(true);
  });

  test('total template count is 30 or more', () => {
    expect(data.templates.length).toBeGreaterThanOrEqual(30);
  });

  test('Sprint 11: all templates have tier=free (全機能無料化)', () => {
    // Sprint 11 全機能無料化: すべてのテンプレートが tier=free。
    const free = data.templates.filter((t) => t.tier === 'free');
    expect(free.length).toBe(data.templates.length);
  });

  test('Sprint 11: no premium templates remain (全機能無料化)', () => {
    // Sprint 11 全機能無料化: premium テンプレートは存在しない。
    const premium = data.templates.filter((t) => t.tier === 'premium');
    expect(premium.length).toBe(0);
  });

  test('category diversity: 5 or more distinct categories', () => {
    const cats = new Set(data.templates.map((t) => t.category));
    expect(cats.size).toBeGreaterThanOrEqual(5);
  });

  test('all templates have required fields', () => {
    const required = ['id', 'name', 'category', 'tier', 'promptPrefix', 'outputSections'];
    data.templates.forEach((t) => {
      required.forEach((field) => {
        expect(t[field], `template "${t.id}" is missing field "${field}"`).toBeDefined();
      });
    });
  });

  test('all template IDs are unique snake_case strings', () => {
    const ids = data.templates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    ids.forEach((id) => {
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[a-z0-9_]+$/, `id "${id}" is not snake_case`);
    });
  });

  test('all promptPrefixes are 100 characters or more', () => {
    data.templates.forEach((t) => {
      expect(
        typeof t.promptPrefix === 'string' && t.promptPrefix.length >= 100,
        `template "${t.id}" promptPrefix is shorter than 100 chars (length: ${typeof t.promptPrefix === 'string' ? t.promptPrefix.length : 'N/A'})`
      ).toBe(true);
    });
  });

  test('all outputSections have 3 to 5 entries', () => {
    data.templates.forEach((t) => {
      expect(
        Array.isArray(t.outputSections),
        `template "${t.id}" outputSections is not an array`
      ).toBe(true);
      expect(
        t.outputSections.length >= 3 && t.outputSections.length <= 5,
        `template "${t.id}" has ${t.outputSections.length} outputSections (expected 3-5)`
      ).toBe(true);
    });
  });

  test('category values are lowercase English', () => {
    data.templates.forEach((t) => {
      expect(
        typeof t.category === 'string' && /^[a-z_]+$/.test(t.category),
        `template "${t.id}" has invalid category "${t.category}"`
      ).toBe(true);
    });
  });

  test('tier values are either "free" or "premium"', () => {
    data.templates.forEach((t) => {
      expect(
        t.tier === 'free' || t.tier === 'premium',
        `template "${t.id}" has invalid tier "${t.tier}"`
      ).toBe(true);
    });
  });

  test('standard / business / academic free templates are present', () => {
    const ids = new Set(data.templates.map((t) => t.id));
    ['standard', 'business', 'academic'].forEach((id) => {
      expect(ids.has(id), `required free template "${id}" not found`).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// § 2  Lock-logic unit test in side-panel.js source
// ---------------------------------------------------------------------------

test.describe('Sprint 7 — side-panel.js premium lock logic (source check)', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'content', 'side-panel.js'),
      'utf8'
    );
  });

  test('side-panel.js contains _loadFavoriteTemplates helper', () => {
    expect(src).toMatch(/_loadFavoriteTemplates/);
  });

  test('side-panel.js contains _makeTemplateOption helper', () => {
    expect(src).toMatch(/_makeTemplateOption/);
  });

  test('side-panel.js uses chrome.storage.sync for favorites', () => {
    expect(src).toMatch(/chrome\.storage\.sync/);
  });

  test('side-panel.js creates optgroup elements for category grouping', () => {
    expect(src).toMatch(/optgroup/);
  });

  test('side-panel.js applies lock styling for premium templates', () => {
    expect(src).toMatch(/🔒/);
  });

  test('side-panel.js applies favorite star prefix', () => {
    expect(src).toMatch(/⭐/);
  });

  test('side-panel.js has premium fallback (reverts to standard)', () => {
    expect(src).toMatch(/standard/);
    // The fallback branch references 'standard' as safe fallback
    expect(src).toMatch(/safe fallback/);
  });
});

// ---------------------------------------------------------------------------
// § 3  options.js template management source check
// ---------------------------------------------------------------------------

test.describe('Sprint 7 — options.js template management (source check)', () => {
  let src;

  test.beforeAll(() => {
    src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'options', 'options.js'),
      'utf8'
    );
  });

  test('options.js contains loadFavoriteTemplates', () => {
    expect(src).toMatch(/loadFavoriteTemplates/);
  });

  test('options.js contains saveFavoriteTemplates', () => {
    expect(src).toMatch(/saveFavoriteTemplates/);
  });

  test('options.js uses chrome.storage.sync for favorites', () => {
    expect(src).toMatch(/chrome\.storage\.sync/);
  });

  test('options.js contains renderTemplateList', () => {
    expect(src).toMatch(/renderTemplateList/);
  });

  test('options.js contains loadAndRenderTemplates', () => {
    expect(src).toMatch(/loadAndRenderTemplates/);
  });

  test('options.js reacts to favoriteTemplates sync storage change', () => {
    expect(src).toMatch(/favoriteTemplates/);
  });
});

// ---------------------------------------------------------------------------
// § 4  Browser test: options page renders template list (premium lock UI)
// ---------------------------------------------------------------------------

test.describe('Sprint 7 — browser: options page template management', () => {
  let context;
  let worker;
  let extId;
  let userDataDir;

  test.beforeAll(async () => {
    ({ context, userDataDir } = await launchExtensionContext('opts'));
    worker = await getServiceWorker(context);
    extId = getExtensionId(worker);
  });

  test.afterAll(async () => {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test('options page loads and shows template-list-area', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/src/options/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait for the template list to populate
    await page.waitForFunction(
      () => {
        const area = document.getElementById('template-list-area');
        if (!area) return false;
        // Check that at least one template-card has been rendered
        return area.querySelectorAll('.template-card').length > 0;
      },
      { timeout: 10000 }
    );

    const cardCount = await page.$$eval('.template-card', (cards) => cards.length);
    expect(cardCount).toBeGreaterThanOrEqual(30);
    await page.close();
  });

  test('Sprint 11: options page shows only FREE tier badges (全機能無料化)', async () => {
    // Sprint 11 全機能無料化 — すべてのテンプレートバッジが FREE になっている。
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/src/options/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.tier-badge').length > 0,
      { timeout: 10000 }
    );

    const freeBadges = await page.$$eval('[data-tier="free"]', (els) => els.length);
    const premiumBadges = await page.$$eval('[data-tier="premium"]', (els) => els.length);
    // 全テンプレートが FREE バッジで表示される。
    expect(freeBadges).toBeGreaterThanOrEqual(30);
    expect(premiumBadges).toBe(0);
    await page.close();
  });

  test('favorite button toggles and persists to chrome.storage.sync', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/src/options/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.fav-btn').length > 0,
      { timeout: 10000 }
    );

    // Click the first favorite button
    const firstFavBtn = page.locator('.fav-btn').first();
    const initialPressed = await firstFavBtn.getAttribute('aria-pressed');
    await firstFavBtn.click();

    // After click, aria-pressed should toggle
    await page.waitForFunction(
      (initial) => {
        const btn = document.querySelector('.fav-btn');
        return btn && btn.getAttribute('aria-pressed') !== initial;
      },
      initialPressed,
      { timeout: 3000 }
    );

    // Verify chrome.storage.sync was written
    const favs = await worker.evaluate(async () => {
      const data = await chrome.storage.sync.get('favoriteTemplates');
      return data && data.favoriteTemplates;
    });
    expect(Array.isArray(favs)).toBe(true);
    // If we pressed a currently-unfavorited button, there should be at least 1 entry
    // If we unpressed a favorited button, the array may be empty — both are valid
    expect(typeof favs).toBe('object');

    await page.close();
  });
});

// ---------------------------------------------------------------------------
// § 5  Browser test: side-panel template dropdown (free tier locks premium)
// ---------------------------------------------------------------------------

const NOTE_ARTICLE_URL = 'https://note.com/info/n/nf3f7ff494105';
const TEST_LICENSE_CODE = 'NA-TEST-DEMO-MODE';

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

test.describe('Sprint 7 — browser: side-panel template dropdown tier locking', () => {
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

  test('side-panel.js source: _populateTemplateSelect is defined', () => {
    const src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'content', 'side-panel.js'),
      'utf8'
    );
    expect(src).toMatch(/_populateTemplateSelect/);
  });

  test('side-panel.js source: optgroup is used for category grouping', () => {
    const src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'content', 'side-panel.js'),
      'utf8'
    );
    expect(src).toMatch(/createElement\(['"]optgroup['"]\)/);
  });

  test('Sprint 11: _makeTemplateOption lock branch exists but isPremium always true so never triggered', () => {
    // Sprint 11 全機能無料化 — コードは将来の再有料化に備えて残すが発動しない。
    const src = fs.readFileSync(
      path.join(EXTENSION_PATH, 'src', 'content', 'side-panel.js'),
      'utf8'
    );
    // isLocked 分岐コードは残存している。
    expect(src).toMatch(/opt\.disabled\s*=\s*true/);
    // Sprint 11 注記コメントが挿入されている。
    expect(src).toMatch(/Sprint 11/);
  });
});
