'use strict';

/**
 * screenshot.spec.js — Sprint 11 ストア提出用スクリーンショット 5 枚の自動撮影
 *
 * 実機能の駆動ではなく evaluate() で UI を直接組み立てるフォールバック方式で、
 * 安定した 5 枚を確実に生成する。
 *
 * 出力先: docs/screenshots/screenshot-{1..5}.png (1280x800)
 */

const { test, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.join(__dirname, '..', '..', 'src', '..'); // project root
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'docs', 'screenshots');
const ARTICLE_URL = 'https://note.com/sample/n/abstract_demo';

// Ensure output dir exists
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helper: build a standalone HTML page that mimics the side-panel UI state
// ---------------------------------------------------------------------------
const PANEL_HTML = (content, activeTab = 'summary') => `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Segoe UI', sans-serif;
      background: #f3f4f6;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    /* Simulate a note.com article on the left */
    .article-bg {
      flex: 1 1 auto;
      background: #ffffff;
      padding: 40px 48px;
      overflow: hidden;
    }
    .article-bg h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 16px;
      line-height: 1.4;
    }
    .article-bg p {
      font-size: 15px;
      color: #374151;
      line-height: 1.8;
      margin-bottom: 14px;
    }
    .article-bg .note-meta {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 24px;
    }
    /* Side panel */
    .panel {
      flex: 0 0 380px;
      width: 380px;
      height: 100vh;
      background: #ffffff;
      box-shadow: -4px 0 18px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      font-size: 13px;
      line-height: 1.6;
    }
    header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(180deg,#f9fafb,#ffffff);
    }
    header .title { font-weight: 700; font-size: 14px; }
    header .icon-badge {
      width: 20px; height: 20px;
      background: linear-gradient(145deg,#2ec4a3,#1da688);
      border-radius: 4px;
      display: inline-flex; align-items: center; justify-content: center;
      color: #fff; font-size: 11px; font-weight: 800; margin-right: 6px;
    }
    nav.tabs {
      flex: 0 0 auto;
      display: flex;
      padding: 8px 12px 0;
      border-bottom: 1px solid #e5e7eb;
      gap: 4px;
    }
    nav.tabs button {
      appearance: none; border: none; background: transparent;
      padding: 8px 12px; font-size: 12px; cursor: pointer;
      color: #555; border-bottom: 2px solid transparent; white-space: nowrap;
    }
    nav.tabs button.active {
      color: #1a73e8; border-bottom-color: #1a73e8; font-weight: 600;
    }
    .stage {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; background: #ecfdf5;
      font-size: 12px; color: #047857; border-bottom: 1px solid #e5e7eb;
    }
    .stage-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #10b981;
    }
    .tab-panels { flex: 1 1 auto; overflow-y: auto; padding: 14px 16px 24px; }
    h3 {
      font-size: 12px; margin: 14px 0 6px; color: #334155;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    h3:first-child { margin-top: 0; }
    .reading-time {
      display: inline-block; padding: 3px 8px; background: #eff6ff;
      color: #1d4ed8; border-radius: 12px; font-size: 11px; margin-bottom: 10px;
    }
    .tab-header-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; margin: 0 0 10px;
    }
    .tab-header-row h3 { margin: 0; }
    .export-btn {
      appearance: none; border: 1px solid #d1d5db; background: #ffffff;
      color: #1a73e8; padding: 4px 10px; border-radius: 6px;
      font-size: 11px; cursor: pointer;
    }
    .abstract-text {
      white-space: pre-wrap; color: #1f2937; font-size: 13px; margin-bottom: 8px;
    }
    .key-points { margin: 0 0 12px; padding-left: 20px; }
    .key-points li { margin-bottom: 6px; color: #1f2937; }
    .engine-badge {
      display: inline-block; padding: 3px 8px;
      background: #ecfdf5; color: #047857; border-radius: 999px;
      font-size: 11px; letter-spacing: 0.02em; margin-top: 8px;
    }
    /* prediction */
    .prediction-section {
      margin-bottom: 14px; padding: 10px 12px;
      border: 1px solid #e5e7eb; border-radius: 6px; background: #f9fafb;
    }
    .prediction-section h4 {
      margin: 0 0 6px; font-size: 12px; color: #1d4ed8; letter-spacing: 0.04em;
    }
    .prediction-section p {
      margin: 0; white-space: pre-wrap; color: #1f2937;
      font-size: 13px; line-height: 1.6;
    }
    /* related */
    .keyword-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .keyword-link {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px;
      background: #ffffff; color: #1f2937; text-decoration: none; font-size: 13px;
    }
    .keyword-link .arrow { color: #94a3b8; font-size: 12px; }
    /* template / options */
    .controls-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .template-select {
      flex: 1 1 auto; padding: 6px 8px; font-size: 12px;
      border: 1px solid #d1d5db; border-radius: 6px; background: #ffffff;
    }
    .run-btn {
      appearance: none; border: 1px solid #1a73e8; background: #1a73e8;
      color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
    }
    /* export menu overlay */
    .export-menu-overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      display: flex; align-items: center; justify-content: center; z-index: 999;
    }
    .export-menu {
      background: #ffffff; border-radius: 10px; padding: 16px 18px;
      min-width: 240px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }
    .export-menu h4 { margin: 0 0 10px; font-size: 13px; color: #1a1a1a; }
    .export-menu-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    .export-menu-list button {
      width: 100%; text-align: left; appearance: none;
      border: 1px solid #d1d5db; background: #ffffff; color: #1f2937;
      padding: 8px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
    }
    /* settings / options */
    .settings-section { margin-bottom: 18px; }
    .settings-section h3 { margin: 0 0 6px; }
    .settings-lead { font-size: 12px; color: #475569; margin: 0 0 8px; }
    .api-key-status {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 10px; border-radius: 6px; font-size: 12px;
      background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;
    }
    .api-key-status .dot {
      width: 8px; height: 8px; border-radius: 50%; background: currentColor;
    }
    .open-options-btn {
      appearance: none; border: 1px solid #1a73e8; background: #1a73e8;
      color: #ffffff; padding: 8px 14px; border-radius: 6px;
      font-size: 12px; cursor: pointer; margin-top: 10px; display: block;
    }
    /* template card list */
    .template-card-list { display: flex; flex-direction: column; gap: 6px; }
    .template-card {
      padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px;
      background: #ffffff; cursor: pointer;
    }
    .template-card:hover { border-color: #1a73e8; background: #eff6ff; }
    .template-card-name { font-size: 12px; font-weight: 600; color: #1f2937; }
    .template-card-desc { font-size: 11px; color: #64748b; margin-top: 2px; }
    .template-card-badge {
      display: inline-block; padding: 1px 6px; border-radius: 4px;
      font-size: 10px; background: #ecfdf5; color: #047857; margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="article-bg">
    <p class="note-meta">テックライター / 2026年5月9日</p>
    <h1>AI と人間の協働：新しい創造性の地平線</h1>
    <p>人工知能技術の急速な進化に伴い、クリエイティブな領域における AI と人間の協働が注目されています。本稿では、AI が単なるツールを超えた存在として機能するとき、人間の創造性はどのように変容するかを考察します。</p>
    <p>生成 AI の登場により、文章・画像・音楽など多様な領域で AI が作品を生み出せるようになりました。しかし重要なのは、AI は人間の意図を実現する補助者であり、創造性の主体はあくまで人間だという点です。</p>
    <p>本稿では 3 つの視点から検討します。(1) AI が増幅する人間の創造性、(2) 人間と AI の対話的制作プロセス、(3) 倫理的・哲学的課題。これらを通じて、AI 時代における人間の役割を再定義します。</p>
  </div>
  <div class="panel">
    <header>
      <div style="display:flex;align-items:center;">
        <div class="icon-badge">n</div>
        <span class="title">note アブストラクト</span>
      </div>
      <button type="button" style="appearance:none;border:none;background:transparent;font-size:18px;color:#555;cursor:pointer;">×</button>
    </header>
    <nav class="tabs">
      <button class="${activeTab === 'summary' ? 'active' : ''}">要約</button>
      <button class="${activeTab === 'prediction' ? 'active' : ''}">予測</button>
      <button class="${activeTab === 'related' ? 'active' : ''}">関連</button>
      <button class="${activeTab === 'history' ? 'active' : ''}">履歴</button>
      <button class="${activeTab === 'settings' ? 'active' : ''}">設定</button>
    </nav>
    <div class="stage">
      <div class="stage-dot"></div>
      <span>完了</span>
    </div>
    <div class="tab-panels">
      ${content}
    </div>
  </div>
</body>
</html>
`;

const SUMMARY_CONTENT = `
  <div class="reading-time">約 3 分</div>
  <div class="tab-header-row">
    <h3>アブストラクト</h3>
    <button class="export-btn">エクスポート ▾</button>
  </div>
  <div class="abstract-text">本稿は AI と人間の創造的協働をテーマに、技術進化が人間の創造性へ与える影響を論じる。著者は AI を「創造性の増幅器」として位置づけ、意図的な協働デザインの重要性を主張する。</div>
  <h3>キーポイント</h3>
  <ul class="key-points">
    <li>AI は人間の創造的意図を実現する協働者であり、主体性は人間にある</li>
    <li>対話的プロセスにより、個人では到達困難な表現域が拓かれる</li>
    <li>倫理・著作権・労働市場への影響という 3 層の課題が残存する</li>
  </ul>
  <div class="engine-badge">Gemini Nano (端末内処理)</div>
`;

const PREDICTION_CONTENT = `
  <div class="controls-row">
    <select class="template-select">
      <option selected>批判的分析 (標準)</option>
      <option>SWOT 分析</option>
      <option>反論検討</option>
    </select>
    <button class="run-btn">予測する</button>
  </div>
  <div class="tab-header-row">
    <h3>批判的分析</h3>
    <button class="export-btn">エクスポート ▾</button>
  </div>
  <div class="prediction-section">
    <h4>論拠の強度</h4>
    <p>著者の主張は実例への言及が少なく、抽象論に留まる部分がある。AI 協働の具体的成果事例を示せば説得力が増す。</p>
  </div>
  <div class="prediction-section">
    <h4>見落とされた視点</h4>
    <p>アクセシビリティの観点が欠如している。AI ツールのコスト・学習コストにより、恩恵を受けられる層が限定される可能性がある。</p>
  </div>
  <div class="prediction-section">
    <h4>発展可能性</h4>
    <p>AI との協働を制度・教育システムに組み込む政策論へ展開できれば、個人論から社会論として昇華される。</p>
  </div>
`;

const RELATED_CONTENT = `
  <div class="controls-row">
    <button class="run-btn">キーワードを提案</button>
  </div>
  <div class="tab-header-row">
    <h3>関連キーワード</h3>
    <button class="export-btn">エクスポート ▾</button>
  </div>
  <ul class="keyword-list">
    <li><a class="keyword-link" href="#">生成AI 創造性<span class="arrow">→</span></a></li>
    <li><a class="keyword-link" href="#">AI 協働 クリエイティブ<span class="arrow">→</span></a></li>
    <li><a class="keyword-link" href="#">人工知能 倫理<span class="arrow">→</span></a></li>
    <li><a class="keyword-link" href="#">ChatGPT 創作<span class="arrow">→</span></a></li>
    <li><a class="keyword-link" href="#">AI アート 著作権<span class="arrow">→</span></a></li>
  </ul>
`;

const TEMPLATE_CONTENT = `
  <div class="settings-section">
    <h3>テンプレート一覧</h3>
    <p class="settings-lead">30 種のプロンプトテンプレートから選択できます。</p>
  </div>
  <div class="template-card-list">
    <div class="template-card">
      <div class="template-card-name">アブストラクト (標準)</div>
      <div class="template-card-desc">論文形式で要点を 3 行以内に凝縮します</div>
      <span class="template-card-badge">無料</span>
    </div>
    <div class="template-card">
      <div class="template-card-name">批判的分析</div>
      <div class="template-card-desc">論拠・見落とし・発展可能性を 3 セクションで分析</div>
      <span class="template-card-badge">無料</span>
    </div>
    <div class="template-card">
      <div class="template-card-name">SWOT 分析</div>
      <div class="template-card-desc">強み・弱み・機会・脅威の観点から記事を評価</div>
      <span class="template-card-badge">無料</span>
    </div>
    <div class="template-card">
      <div class="template-card-name">5W1H サマリー</div>
      <div class="template-card-desc">Who / What / When / Where / Why / How を一覧化</div>
      <span class="template-card-badge">無料</span>
    </div>
    <div class="template-card">
      <div class="template-card-name">アクション提案</div>
      <div class="template-card-desc">記事を読んで次に取るべき行動を 3 つ提案</div>
      <span class="template-card-badge">無料</span>
    </div>
  </div>
`;

const EXPORT_CONTENT = `
  <div class="reading-time">約 3 分</div>
  <div class="tab-header-row">
    <h3>アブストラクト</h3>
    <button class="export-btn" style="background:#eff6ff;border-color:#1a73e8;">エクスポート ▾</button>
  </div>
  <div class="abstract-text">本稿は AI と人間の創造的協働をテーマに、技術進化が人間の創造性へ与える影響を論じる。著者は AI を「創造性の増幅器」として位置づけ、意図的な協働デザインの重要性を主張する。</div>
  <h3>キーポイント</h3>
  <ul class="key-points">
    <li>AI は人間の創造的意図を実現する協働者であり、主体性は人間にある</li>
    <li>対話的プロセスにより、個人では到達困難な表現域が拓かれる</li>
    <li>倫理・著作権・労働市場への影響という 3 層の課題が残存する</li>
  </ul>
  <!-- Export menu overlay (visible) -->
  <div class="export-menu-overlay" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;border-radius:0;">
    <div class="export-menu">
      <h4>エクスポート形式を選択</h4>
      <ul class="export-menu-list">
        <li><button>Markdown としてコピー</button></li>
        <li><button>JSON としてコピー</button></li>
        <li><button>テキストとしてコピー</button></li>
      </ul>
      <button style="appearance:none;border:none;background:transparent;color:#64748b;font-size:12px;cursor:pointer;width:100%;text-align:center;padding:4px;">キャンセル</button>
    </div>
  </div>
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Sprint 11 ストア用スクリーンショット', () => {
  let browser;
  let context;

  test.beforeAll(async () => {
    const extensionPath = path.resolve(__dirname, '..', '..');
    browser = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    context = browser;
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test('screenshot-1: 要約タブ (アブストラクト + キーポイント)', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(PANEL_HTML(SUMMARY_CONTENT, 'summary'));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'screenshot-1.png'),
      fullPage: false,
    });
    await page.close();
  });

  test('screenshot-2: 予測タブ (批判的分析 3 セクション)', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(PANEL_HTML(PREDICTION_CONTENT, 'prediction'));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'screenshot-2.png'),
      fullPage: false,
    });
    await page.close();
  });

  test('screenshot-3: 関連タブ (キーワードチップ 5 件)', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(PANEL_HTML(RELATED_CONTENT, 'related'));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'screenshot-3.png'),
      fullPage: false,
    });
    await page.close();
  });

  test('screenshot-4: テンプレート一覧 (30 種プロンプト)', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(PANEL_HTML(TEMPLATE_CONTENT, 'settings'));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'screenshot-4.png'),
      fullPage: false,
    });
    await page.close();
  });

  test('screenshot-5: エクスポートメニュー展開状態', async () => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(PANEL_HTML(EXPORT_CONTENT, 'summary'));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'screenshot-5.png'),
      fullPage: false,
    });
    await page.close();
  });
});
