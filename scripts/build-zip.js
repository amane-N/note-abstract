'use strict';

/**
 * build-zip.js — Chrome 拡張機能の本番 ZIP を生成する
 *
 * 外部依存なし。Node 標準モジュール (fs, path, zlib) のみ使用。
 * 出力先: dist/note-abstract-v<version>.zip
 *
 * 使い方: node scripts/build-zip.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// manifest.json から version を取得
// ---------------------------------------------------------------------------
const manifest = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'manifest.json'), 'utf8')
);
const VERSION = manifest.version;

const OUT_DIR = path.join(PROJECT_ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, `note-abstract-v${VERSION}.zip`);

// ---------------------------------------------------------------------------
// 含めるエントリの決定
// ---------------------------------------------------------------------------
/**
 * 以下を含める:
 *   manifest.json
 *   assets/icon-*.png
 *   src/** (全ファイル)
 *   docs/privacy-policy.md
 *   docs/terms-of-use.md
 *
 * 以下を除外:
 *   node_modules/
 *   tests/
 *   playwright.config.js
 *   package-lock.json
 *   scripts/
 *   dist/
 *   .git/
 *   *.zip
 *   test-results/
 *   docs/screenshots/
 *   docs/store-listing.md
 *   docs/SPRINT_LOG.md
 *   "# note アブストラクト - Claude Code 統合指示書.md"
 *   CLAUDE.md
 *   .claude/
 *   .gitignore
 *   README.md
 */

/**
 * ディレクトリを再帰的に走査し、ファイル一覧 (絶対パス) を返す。
 */
const collectFiles = (dir, results = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
};

/**
 * 明示的に含めるパス/パターンを定義して収集する。
 * 除外はこのリスト自体の構成で制御する (allowlist 方式)。
 */
const gatherEntries = () => {
  const entries = []; // [ { absPath, entryName } ]

  const add = (absPath, entryName) => {
    if (fs.existsSync(absPath)) {
      entries.push({ absPath, entryName });
    } else {
      console.warn(`  warn: ${absPath} が見つかりません (スキップ)`);
    }
  };

  // manifest.json
  add(path.join(PROJECT_ROOT, 'manifest.json'), 'manifest.json');

  // assets/icon-*.png
  const assetsDir = path.join(PROJECT_ROOT, 'assets');
  if (fs.existsSync(assetsDir)) {
    const icons = fs.readdirSync(assetsDir).filter((f) => /^icon-\d+\.png$/.test(f));
    for (const icon of icons) {
      add(path.join(assetsDir, icon), `assets/${icon}`);
    }
  }

  // src/** (全ファイル)
  const srcDir = path.join(PROJECT_ROOT, 'src');
  if (fs.existsSync(srcDir)) {
    const files = collectFiles(srcDir);
    for (const f of files) {
      const rel = path.relative(PROJECT_ROOT, f).replace(/\\/g, '/');
      entries.push({ absPath: f, entryName: rel });
    }
  }

  // docs/privacy-policy.md
  add(
    path.join(PROJECT_ROOT, 'docs', 'privacy-policy.md'),
    'docs/privacy-policy.md'
  );

  // docs/terms-of-use.md
  add(
    path.join(PROJECT_ROOT, 'docs', 'terms-of-use.md'),
    'docs/terms-of-use.md'
  );

  return entries;
};

// ---------------------------------------------------------------------------
// 軽量 ZIP ライター (DEFLATE + CRC32 を純 Node で実装)
// ---------------------------------------------------------------------------

/** CRC32 テーブルを生成する */
const buildCrcTable = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
};

const CRC_TABLE = buildCrcTable();

const crc32 = (buf) => {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** リトルエンディアン 16/32 bit 書き込みヘルパ */
const le16 = (n) => {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n, 0);
  return b;
};
const le32 = (n) => {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
};

/**
 * バッファ配列を DEFLATE 圧縮し ZIP エントリを生成する。
 * 返り値: { localHeader, data, centralHeader, localOffset }
 */
const makeZipEntry = (entryName, content, localOffset) => {
  const nameBytes = Buffer.from(entryName, 'utf8');
  const compressed = zlib.deflateRawSync(content, { level: 9 });
  const crc = crc32(content);
  const now = new Date();

  // MS-DOS 時刻形式
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) >>> 0;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()) >>>
    0;

  // Local file header (signature 0x04034b50)
  const localHeader = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
    le16(20),                               // version needed
    le16(0),                                // general purpose bit flag
    le16(8),                                // compression method (DEFLATE)
    le16(dosTime),
    le16(dosDate),
    le32(crc),
    le32(compressed.length),
    le32(content.length),
    le16(nameBytes.length),
    le16(0),                               // extra field length
    nameBytes,
  ]);

  // Central directory header (signature 0x02014b50)
  const centralHeader = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
    le16(20),                               // version made by
    le16(20),                               // version needed
    le16(0),
    le16(8),
    le16(dosTime),
    le16(dosDate),
    le32(crc),
    le32(compressed.length),
    le32(content.length),
    le16(nameBytes.length),
    le16(0),                               // extra field
    le16(0),                               // file comment
    le16(0),                               // disk number start
    le16(0),                               // internal attributes
    le32(0),                               // external attributes
    le32(localOffset),
    nameBytes,
  ]);

  return { localHeader, data: compressed, centralHeader };
};

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
const build = () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const entries = gatherEntries();

  const localParts = [];
  const centralHeaders = [];
  let offset = 0;

  for (const { absPath, entryName } of entries) {
    const content = fs.readFileSync(absPath);
    const { localHeader, data, centralHeader } = makeZipEntry(entryName, content, offset);
    localParts.push(localHeader, data);
    centralHeaders.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirOffset = offset;
  const centralDirBuf = Buffer.concat(centralHeaders);

  // End of central directory record (signature 0x06054b50)
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), // signature
    le16(0),                                // disk number
    le16(0),                                // disk with start of central dir
    le16(entries.length),
    le16(entries.length),
    le32(centralDirBuf.length),
    le32(centralDirOffset),
    le16(0),                               // comment length
  ]);

  const zip = Buffer.concat([...localParts, centralDirBuf, eocd]);
  fs.writeFileSync(OUT_FILE, zip);

  const sizeKB = (zip.length / 1024).toFixed(1);
  console.log(`\n=== Build completed ===`);
  console.log(`Output : ${OUT_FILE}`);
  console.log(`Size   : ${sizeKB} KB (${zip.length} bytes)`);
  console.log(`Entries: ${entries.length}`);
  console.log('\nIncluded files:');
  for (const { entryName } of entries) {
    console.log(`  ${entryName}`);
  }
};

build();
