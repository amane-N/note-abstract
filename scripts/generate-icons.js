'use strict';

// Renders a "note abstract" icon (lowercase n on a teal rounded tile with
// summary-mark lines) at three resolutions using Playwright's headless Chromium.
// Run with: `node scripts/generate-icons.js`

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const SIZES = [16, 48, 128];
const OUT_DIR = path.join(__dirname, '..', 'assets');

/**
 * Build the HTML page for a given icon size.
 *   - 16px: "n" glyph + single bottom bar only (detail would be lost)
 *   - 48/128px: "n" glyph + 3 summary bars (short / long / short)
 */
const renderPage = (size) => {
  const radius = Math.round(size * 0.22);
  const isSmall = size <= 16;

  // Font sizes
  const glyphSize = Math.round(size * (isSmall ? 0.58 : 0.52));
  const glyphOffsetY = Math.round(size * (isSmall ? 0.03 : 0.01));

  // Bar geometry (summary lines ≡)
  const barH = Math.max(1, Math.round(size * 0.06));
  const barGap = Math.max(1, Math.round(size * 0.05));
  const barShortW = Math.round(size * 0.28);
  const barLongW = Math.round(size * 0.40);

  // Vertical center for bars block (below the glyph area, roughly lower-right)
  const barBlockH = isSmall
    ? barH                                        // 1 bar
    : barH * 3 + barGap * 2;                     // 3 bars
  const barBlockTop = size - Math.round(size * 0.22) - barBlockH;
  const barLeft = size - Math.round(size * 0.14) - barLongW;

  const bars = isSmall
    ? `
    <div class="bar" style="
      width:${barShortW + 4}px;
      height:${barH}px;
      top:${barBlockTop}px;
      left:${barLeft - 2}px;
    "></div>`
    : `
    <div class="bar" style="
      width:${barShortW}px;
      height:${barH}px;
      top:${barBlockTop}px;
      left:${barLeft + Math.round((barLongW - barShortW) / 2)}px;
    "></div>
    <div class="bar" style="
      width:${barLongW}px;
      height:${barH}px;
      top:${barBlockTop + barH + barGap}px;
      left:${barLeft}px;
    "></div>
    <div class="bar" style="
      width:${barShortW}px;
      height:${barH}px;
      top:${barBlockTop + (barH + barGap) * 2}px;
      left:${barLeft + Math.round((barLongW - barShortW) / 2)}px;
    "></div>`;

  return `<!DOCTYPE html>
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
      position: relative;
      width: ${size}px;
      height: ${size}px;
      background: linear-gradient(145deg, #2ec4a3 0%, #1da688 60%, #17967a 100%);
      border-radius: ${radius}px;
      box-shadow: inset 0 -1px 0 rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.18);
      overflow: hidden;
    }
    .glyph {
      position: absolute;
      top: 50%;
      left: ${isSmall ? '36' : '28'}%;
      transform: translateY(calc(-50% + ${glyphOffsetY}px));
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-weight: 800;
      font-size: ${glyphSize}px;
      color: #ffffff;
      line-height: 1;
      letter-spacing: -0.02em;
      text-shadow: 0 1px 2px rgba(0,0,0,0.22);
    }
    .bar {
      position: absolute;
      background: rgba(255,255,255,0.90);
      border-radius: ${Math.max(1, Math.round(barH / 2))}px;
    }
  </style>
</head>
<body>
  <div class="tile">
    <span class="glyph">n</span>
    ${bars}
  </div>
</body>
</html>`;
};

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
