'use strict';

// Renders a small "n" mark icon (lowercase n on a rounded blue tile) at three
// resolutions using Playwright's headless Chromium so we don't need an image
// library dependency. Run with: `node scripts/generate-icons.js`.

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const SIZES = [16, 48, 128];
const OUT_DIR = path.join(__dirname, '..', 'assets');

const renderPage = (size) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      width: ${size}px;
      height: ${size}px;
    }
    .tile {
      width: ${size}px;
      height: ${size}px;
      background: linear-gradient(135deg, #1d4ed8 0%, #1a73e8 60%, #38bdf8 100%);
      border-radius: ${Math.round(size * 0.22)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }
    .glyph {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-weight: 800;
      color: #ffffff;
      line-height: 1;
      letter-spacing: -0.02em;
      font-size: ${Math.round(size * 0.78)}px;
      transform: translateY(${size >= 48 ? Math.round(size * 0.04) : 1}px);
      text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
    }
  </style>
</head>
<body>
  <div class="tile"><span class="glyph">n</span></div>
</body>
</html>`;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 256, height: 256 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (const size of SIZES) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(renderPage(size));
      const tile = await page.locator('.tile');
      const buf = await tile.screenshot({ omitBackground: true });
      const out = path.join(OUT_DIR, `icon-${size}.png`);
      fs.writeFileSync(out, buf);
      console.log(`wrote ${out} (${buf.length} bytes, ${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
