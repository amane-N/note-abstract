'use strict';

// Chrome Web Store 用スクリーンショット 5 枚 (1280x800 PNG) を生成する
// スタンドアロン Node スクリプト。tests/e2e/screenshot.spec.js のような
// Playwright テストランナー経由ではなく、headless Chromium を直接駆動して
// 全 5 枚を **同一の DPR / viewport で** レンダリングし、スケールを揃える。
//
// 実行: node scripts/generate-screenshots.js
// 出力先: docs/screenshots/screenshot-{1..5}.png

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const VIEWPORT = { width: 1280, height: 800 };
const DEVICE_SCALE_FACTOR = 1;

const ARTICLE = {
  meta: 'テックライター / 2026年5月9日',
  title: 'AI と人間の協働:新しい創造性の地平線',
  paragraphs: [
    '人工知能技術の急速な進化に伴い、クリエイティブな領域における AI と人間の協働が注目されています。本稿では、AI が単なるツールを超えた存在として機能するとき、人間の創造性はどのように変容するかを考察します。',
    '生成 AI の登場により、文章・画像・音楽など多様な領域で AI が作品を生み出せるようになりました。しかし重要なのは、AI は人間の意図を実現する補助者であり、創造性の主体はあくまで人間だという点です。',
    '本稿では 3 つの視点から検討します。(1) AI が増幅する人間の創造性、(2) 人間と AI の対話的制作プロセス、(3) 倫理的・哲学的課題。これらを通じて、AI 時代における人間の役割を再定義します。',
  ],
};

// ------- 共通テンプレート ----------------------------------------------------

const layout = ({ activeTab, content, captionTitle, captionLead, overlay }) => `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; }
    body {
      font-family: -apple-system, 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif;
      background: #eef2f7;
      color: #0f172a;
      overflow: hidden;
    }
    .frame {
      position: relative;
      width: 1280px;
      height: 800px;
      display: flex;
    }
    /* キャプション帯 (上) */
    .caption {
      position: absolute;
      left: 32px; right: 432px; top: 28px;
      padding: 14px 18px 14px 18px;
      background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%);
      color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 6px 24px rgba(15,118,110,0.25);
      z-index: 5;
    }
    .caption h2 { font-size: 18px; font-weight: 800; letter-spacing: 0.01em; }
    .caption p  { font-size: 13px; line-height: 1.55; opacity: 0.92; margin-top: 4px; }
    /* 左: 記事側 */
    .article {
      flex: 1 1 auto;
      background: #ffffff;
      padding: 116px 56px 40px;
      overflow: hidden;
    }
    .article .meta {
      display: flex; align-items: center; gap: 10px;
      font-size: 13px; color: #64748b; margin-bottom: 14px;
    }
    .article .meta::before {
      content: ''; display: inline-block;
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, #94a3b8, #64748b);
    }
    .article h1 {
      font-size: 30px; font-weight: 800;
      color: #0f172a; line-height: 1.4;
      margin-bottom: 22px;
    }
    .article p {
      font-size: 15px; line-height: 1.85;
      color: #1f2937; margin-bottom: 16px;
    }
    /* 右: サイドパネル */
    .panel {
      flex: 0 0 400px;
      width: 400px;
      height: 100%;
      background: #ffffff;
      box-shadow: -8px 0 28px rgba(15,23,42,0.12);
      display: flex;
      flex-direction: column;
      font-size: 13px;
      line-height: 1.6;
    }
    .panel-header {
      flex: 0 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px;
      border-bottom: 1px solid #e2e8f0;
      background: linear-gradient(180deg, #f8fafc, #ffffff);
    }
    .panel-header .brand { display: flex; align-items: center; gap: 10px; }
    .icon-tile {
      width: 26px; height: 26px;
      border-radius: 6px;
      background: linear-gradient(145deg, #2ec4a3, #1da688);
      color: #ffffff;
      font-size: 16px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 2px 8px rgba(46,196,163,0.4);
      position: relative;
    }
    .icon-tile::after {
      /* 要約マーク (右下に小さく ≡) */
      content: ''; position: absolute; right: 3px; bottom: 3px;
      width: 8px; height: 6px;
      background:
        linear-gradient(#ffffff,#ffffff) top/100% 1.4px no-repeat,
        linear-gradient(#ffffff,#ffffff) center/80% 1.4px no-repeat,
        linear-gradient(#ffffff,#ffffff) bottom/100% 1.4px no-repeat;
      opacity: 0.95;
    }
    .brand-title { font-size: 15px; font-weight: 700; color: #0f172a; }
    .close-btn {
      appearance: none; border: none; background: transparent;
      font-size: 20px; line-height: 1; color: #64748b; cursor: default;
    }
    .tabs {
      flex: 0 0 auto;
      display: flex;
      padding: 6px 12px 0;
      border-bottom: 1px solid #e2e8f0;
      gap: 2px;
    }
    .tab {
      appearance: none; border: none; background: transparent;
      padding: 10px 14px; font-size: 13px; cursor: default;
      color: #64748b; border-bottom: 2px solid transparent; white-space: nowrap;
      font-weight: 500;
    }
    .tab.active {
      color: #0f766e; border-bottom-color: #14b8a6; font-weight: 700;
    }
    .stage {
      flex: 0 0 auto;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 18px;
      background: #ecfdf5; color: #065f46;
      font-size: 12px; border-bottom: 1px solid #d1fae5;
    }
    .stage-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #10b981;
    }
    .panel-body {
      flex: 1 1 auto; overflow-y: auto; padding: 16px 18px 24px;
      position: relative;
    }
    .h-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; margin: 0 0 12px;
    }
    h3 {
      font-size: 12px; color: #475569;
      text-transform: uppercase; letter-spacing: 0.06em;
      font-weight: 700; margin: 0;
    }
    h4 { font-size: 12px; font-weight: 700; color: #0f766e; letter-spacing: 0.04em; }
    .reading-time {
      display: inline-block; padding: 3px 10px;
      background: #e0f2fe; color: #075985;
      border-radius: 999px; font-size: 11px; margin-bottom: 12px;
    }
    .export-btn {
      appearance: none; border: 1px solid #cbd5e1; background: #ffffff;
      color: #0f766e; padding: 5px 11px; border-radius: 6px;
      font-size: 11px; cursor: default; font-weight: 600;
    }
    .abstract-text {
      white-space: pre-wrap; color: #1f2937;
      font-size: 13.5px; line-height: 1.75; margin-bottom: 14px;
    }
    .key-points { margin: 0 0 14px; padding-left: 22px; }
    .key-points li {
      margin-bottom: 8px; color: #1f2937;
      font-size: 13px; line-height: 1.7;
    }
    .engine-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 10px;
      background: #ecfdf5; color: #047857;
      border: 1px solid #a7f3d0; border-radius: 999px;
      font-size: 11px; letter-spacing: 0.02em; margin-top: 6px;
    }
    .engine-badge::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #10b981;
    }
    .pred-card {
      margin-bottom: 12px; padding: 12px 14px;
      border: 1px solid #e2e8f0; border-radius: 8px;
      background: #f8fafc;
    }
    .pred-card h4 { margin: 0 0 6px; }
    .pred-card p {
      margin: 0; white-space: pre-wrap; color: #1f2937;
      font-size: 13px; line-height: 1.65;
    }
    .keyword-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .keyword-link {
      display: flex; align-items: center; justify-content: space-between;
      padding: 11px 14px;
      border: 1px solid #e2e8f0; border-radius: 8px;
      background: #ffffff; color: #1f2937;
      text-decoration: none; font-size: 13px; font-weight: 500;
    }
    .keyword-link .arrow { color: #14b8a6; font-size: 13px; font-weight: 700; }
    .controls-row {
      display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
    }
    .template-select {
      flex: 1 1 auto; padding: 7px 10px; font-size: 12px;
      border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff;
      color: #0f172a;
    }
    .run-btn {
      appearance: none; border: 1px solid #0f766e; background: #14b8a6;
      color: #ffffff; padding: 7px 14px; border-radius: 6px;
      font-size: 12px; cursor: default; font-weight: 600;
    }
    .template-card-list { display: flex; flex-direction: column; gap: 8px; }
    .template-card {
      padding: 11px 14px;
      border: 1px solid #e2e8f0; border-radius: 8px;
      background: #ffffff;
    }
    .template-card.active {
      border-color: #14b8a6; background: #f0fdfa;
      box-shadow: 0 0 0 2px rgba(20,184,166,0.15);
    }
    .template-card-name { font-size: 13px; font-weight: 700; color: #0f172a; }
    .template-card-desc { font-size: 12px; color: #64748b; margin-top: 4px; }
    .template-card-badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 10px; background: #ecfdf5; color: #047857;
      margin-top: 6px; font-weight: 600;
    }
    .template-counter {
      font-size: 11px; color: #64748b; font-weight: 500;
    }
    /* エクスポートメニュー (オーバーレイ) */
    .export-overlay {
      position: absolute; inset: 0;
      background: rgba(15,23,42,0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 50;
    }
    .export-menu {
      background: #ffffff; border-radius: 12px;
      padding: 18px 20px;
      min-width: 268px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.24);
    }
    .export-menu h4 {
      margin: 0 0 12px; font-size: 14px; color: #0f172a; font-weight: 700;
      text-transform: none; letter-spacing: 0;
    }
    .export-menu-list {
      list-style: none; padding: 0; margin: 0 0 8px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .export-menu-list button {
      width: 100%; text-align: left; appearance: none;
      border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a;
      padding: 10px 14px; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: default;
      display: flex; align-items: center; gap: 10px;
    }
    .export-menu-list button .ico {
      display: inline-flex; width: 22px; height: 22px;
      align-items: center; justify-content: center;
      background: #ecfeff; color: #0e7490;
      border-radius: 4px; font-size: 11px; font-weight: 800;
    }
    .export-menu-cancel {
      appearance: none; border: none; background: transparent;
      color: #64748b; font-size: 12px; cursor: default;
      width: 100%; text-align: center; padding: 6px 0 0;
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="caption">
      <h2>${captionTitle}</h2>
      <p>${captionLead}</p>
    </div>
    <div class="article">
      <div class="meta">${ARTICLE.meta}</div>
      <h1>${ARTICLE.title}</h1>
      ${ARTICLE.paragraphs.map((p) => `<p>${p}</p>`).join('')}
    </div>
    <div class="panel">
      <div class="panel-header">
        <div class="brand">
          <div class="icon-tile">n</div>
          <div class="brand-title">note アブストラクト</div>
        </div>
        <button class="close-btn">×</button>
      </div>
      <div class="tabs">
        ${['summary','prediction','related','history','settings'].map((id, i) => {
          const labels = ['要約','予測','関連','履歴','設定'];
          return `<button class="tab ${id === activeTab ? 'active' : ''}">${labels[i]}</button>`;
        }).join('')}
      </div>
      <div class="stage"><div class="stage-dot"></div><span>完了</span></div>
      <div class="panel-body">
        ${content}
        ${overlay || ''}
      </div>
    </div>
  </div>
</body>
</html>`;

// ------- 各画面のコンテンツ --------------------------------------------------

const SUMMARY_BODY = `
  <div class="reading-time">読了時間 約 3 分</div>
  <div class="h-row">
    <h3>アブストラクト</h3>
    <button class="export-btn">エクスポート ▾</button>
  </div>
  <div class="abstract-text">本稿は AI と人間の創造的協働をテーマに、技術進化が人間の創造性へ与える影響を論じる。著者は AI を「創造性の増幅器」として位置づけ、意図的な協働デザインの重要性を主張する。</div>
  <h3 style="margin-bottom:8px;">キーポイント</h3>
  <ul class="key-points">
    <li>AI は人間の創造的意図を実現する協働者であり、主体性は人間にある</li>
    <li>対話的プロセスにより、個人では到達困難な表現域が拓かれる</li>
    <li>倫理・著作権・労働市場への影響という 3 層の課題が残存する</li>
  </ul>
  <span class="engine-badge">Gemini Nano (端末内処理)</span>
`;

const PREDICTION_BODY = `
  <div class="controls-row">
    <select class="template-select">
      <option selected>批判的分析 (標準)</option>
    </select>
    <button class="run-btn">予測する</button>
  </div>
  <div class="h-row">
    <h3>批判的分析</h3>
    <button class="export-btn">エクスポート ▾</button>
  </div>
  <div class="pred-card">
    <h4>論拠の強度</h4>
    <p>著者の主張は実例への言及が少なく、抽象論に留まる部分がある。AI 協働の具体的成果事例を示せば説得力が増す。</p>
  </div>
  <div class="pred-card">
    <h4>見落とされた視点</h4>
    <p>アクセシビリティの観点が欠如している。AI ツールのコスト・学習コストにより、恩恵を受けられる層が限定される可能性がある。</p>
  </div>
  <div class="pred-card">
    <h4>発展可能性</h4>
    <p>AI との協働を制度・教育システムに組み込む政策論へ展開できれば、個人論から社会論として昇華される。</p>
  </div>
`;

const RELATED_BODY = `
  <div class="controls-row">
    <button class="run-btn" style="flex:1 1 auto;">関連キーワードを提案</button>
  </div>
  <div class="h-row">
    <h3>関連キーワード (5 件)</h3>
    <button class="export-btn">エクスポート ▾</button>
  </div>
  <ul class="keyword-list">
    <li><a class="keyword-link">生成AI 創造性<span class="arrow">→</span></a></li>
    <li><a class="keyword-link">AI 協働 クリエイティブ<span class="arrow">→</span></a></li>
    <li><a class="keyword-link">人工知能 倫理<span class="arrow">→</span></a></li>
    <li><a class="keyword-link">ChatGPT 創作<span class="arrow">→</span></a></li>
    <li><a class="keyword-link">AI アート 著作権<span class="arrow">→</span></a></li>
  </ul>
  <p style="font-size:11px;color:#64748b;margin-top:12px;">各キーワードをクリックすると note.com 内で検索できます。</p>
`;

const TEMPLATE_BODY = `
  <div class="h-row">
    <h3>テンプレート一覧</h3>
    <span class="template-counter">全 30 種</span>
  </div>
  <div class="template-card-list">
    <div class="template-card active">
      <div class="template-card-name">アブストラクト (標準)</div>
      <div class="template-card-desc">論文形式で要点を 3 行以内に凝縮</div>
      <span class="template-card-badge">使用中</span>
    </div>
    <div class="template-card">
      <div class="template-card-name">批判的分析</div>
      <div class="template-card-desc">論拠・見落とし・発展可能性を 3 セクションで分析</div>
    </div>
    <div class="template-card">
      <div class="template-card-name">SWOT 分析</div>
      <div class="template-card-desc">強み・弱み・機会・脅威の観点から記事を評価</div>
    </div>
    <div class="template-card">
      <div class="template-card-name">5W1H サマリー</div>
      <div class="template-card-desc">Who / What / When / Where / Why / How を一覧化</div>
    </div>
    <div class="template-card">
      <div class="template-card-name">アクション提案</div>
      <div class="template-card-desc">記事を読んで次に取るべき行動を 3 つ提案</div>
    </div>
  </div>
`;

const EXPORT_BODY_BASE = `
  <div class="reading-time">読了時間 約 3 分</div>
  <div class="h-row">
    <h3>アブストラクト</h3>
    <button class="export-btn" style="background:#f0fdfa;border-color:#14b8a6;">エクスポート ▾</button>
  </div>
  <div class="abstract-text">本稿は AI と人間の創造的協働をテーマに、技術進化が人間の創造性へ与える影響を論じる。著者は AI を「創造性の増幅器」として位置づけ、意図的な協働デザインの重要性を主張する。</div>
  <h3 style="margin-bottom:8px;">キーポイント</h3>
  <ul class="key-points">
    <li>AI は人間の創造的意図を実現する協働者であり、主体性は人間にある</li>
    <li>対話的プロセスにより、個人では到達困難な表現域が拓かれる</li>
    <li>倫理・著作権・労働市場への影響という 3 層の課題が残存する</li>
  </ul>
`;

const EXPORT_OVERLAY = `
  <div class="export-overlay">
    <div class="export-menu">
      <h4>エクスポート形式を選択</h4>
      <ul class="export-menu-list">
        <li><button><span class="ico">M</span>Markdown としてコピー</button></li>
        <li><button><span class="ico">{}</span>JSON としてコピー</button></li>
        <li><button><span class="ico">T</span>テキストとしてコピー</button></li>
      </ul>
      <button class="export-menu-cancel">キャンセル</button>
    </div>
  </div>
`;

// ------- メイン --------------------------------------------------------------

const SCREENS = [
  {
    file: 'screenshot-1.png',
    activeTab: 'summary',
    captionTitle: '記事を 3 行に凝縮 — アブストラクト要約',
    captionLead: 'note の長文記事を、論文のアブストラクト形式で瞬時に要点抽出。',
    body: SUMMARY_BODY,
  },
  {
    file: 'screenshot-2.png',
    activeTab: 'prediction',
    captionTitle: '批判的に読む — 予測・分析',
    captionLead: '論拠の強度・見落とされた視点・発展可能性を 3 セクションで分析。',
    body: PREDICTION_BODY,
  },
  {
    file: 'screenshot-3.png',
    activeTab: 'related',
    captionTitle: '次の一冊へ — 関連キーワード',
    captionLead: '記事テーマから派生するキーワード 5 件で読書体験を拡張。',
    body: RELATED_BODY,
  },
  {
    file: 'screenshot-4.png',
    activeTab: 'settings',
    captionTitle: '目的に合わせて選ぶ — テンプレート 30 種',
    captionLead: 'SWOT 分析・5W1H・アクション提案など、用途別プロンプトを切替。',
    body: TEMPLATE_BODY,
  },
  {
    file: 'screenshot-5.png',
    activeTab: 'summary',
    captionTitle: '結果を持ち出す — Markdown / JSON エクスポート',
    captionLead: 'コピー一発で Obsidian や Notion へ。要約は端末内に履歴保存。',
    body: EXPORT_BODY_BASE,
    overlay: EXPORT_OVERLAY,
  },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    const page = await context.newPage();

    for (const s of SCREENS) {
      const html = layout({
        activeTab: s.activeTab,
        content: s.body,
        captionTitle: s.captionTitle,
        captionLead: s.captionLead,
        overlay: s.overlay || '',
      });
      await page.setViewportSize(VIEWPORT);
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.waitForTimeout(120);
      const out = path.join(OUT_DIR, s.file);
      const buf = await page.screenshot({
        clip: { x: 0, y: 0, ...VIEWPORT },
        type: 'png',
      });
      fs.writeFileSync(out, buf);
      console.log(`wrote ${out} (${buf.length} bytes, ${VIEWPORT.width}x${VIEWPORT.height})`);
    }

    await context.close();
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
