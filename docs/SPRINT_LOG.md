# Sprint 評価ログ

## Sprint 1 評価結果(2026-05-08 試行1回目)

### 静的検査
- ファイル構造: ✅ (manifest.json, src/content/content.js, src/background/service-worker.js, assets/*.png すべて存在)
- Manifest検証: ✅ (manifest_version:3, permissions:["storage","activeTab"], host_permissions:["https://note.com/*"], content_scripts matches:"https://note.com/*/n/*")
- コード静的検査: ✅ (IIFE でグローバル汚染なし, innerHTML直接代入なし, console.error を握りつぶしていない, タイトル/本文ともフォールバックセレクタ実装済み)

### Playwright自動テスト (npx playwright test tests/e2e/sprint-01.spec.js)
- 拡張機能ロードしてnote記事ページでタイトルログ出力: ✅ ([note-abstract] title: これからもみなさんの創作のそばに。noteの会員数が1000万人になりました)
- note以外のページ(example.com)でcontent.js非実行: ✅ ([note-abstract] content script loaded ログ出力なし、shadow host 要素なし)
- console.error ([note-abstract]プレフィックス) 0件: ✅
- note-abstract-host 要素が document.body 直下に 1 つだけ存在: ✅
- DOM改変なし(Shadow DOM経由で追加、既存DOM無改変): ✅
- テスト結果: 2 passed (8.0s)

### 手動確認
- 対象なし (Sprint 1 はUIなし)

### 総合判定: 合格

## Sprint 2 評価結果(2026-05-08 試行1回目)

### 静的検査
- ファイル構造: ✅ (src/lib/note-parser.js, src/lib/nano-summarizer.js, src/content/side-panel.js, src/content/content.js, src/background/service-worker.js すべて存在)
- Manifest検証: ✅ (manifest_version:3, permissions:["storage","activeTab"]のみ, host_permissions:["https://note.com/*"]のみ, default_popup 削除済み)
- コード静的検査: ✅
  - グローバル汚染なし (全ファイル IIFE + __noteAbstract 名前空間)
  - innerHTML代入: panel.innerHTML は静的テンプレートリテラルのみ。ul.innerHTML='' はリセット専用。ユーザー入力経路なし (XSSリスクなし)
  - setKeyPoints は li.textContent でユーザーデータを安全に挿入
  - console.error を握りつぶしていない (catchブロックは console.warn または無視)
  - フォールバックセレクタ実装済み (title: 4段階, body: 3段階)
  - z-index: 2147483647 (999999以上 ✅)

### Playwright自動テスト (npx playwright test tests/e2e/sprint-02.spec.js --reporter=list)
- テスト結果: 2 passed (4.5s)
- サイドパネルが5秒以内に表示される: ✅ (waitForFunction timeout=5000ms でパス)
- 5タブ存在(summary/prediction/related/history/settings): ✅
- 初期状態が closed: ✅
- リサイズハンドル存在: ✅
- TOGGLE_SIDE_PANEL でパネルが open 状態になる: ✅
- 読了時間が "約N分" 形式で表示: ✅ (readingTime が /約\s*\d+\s*分/ にマッチ)
- 要約テキストまたはフォールバックメッセージが表示: ✅ (Playwright環境はNano非対応 → フォールバック「お使いの環境ではローカルAI機能が利用できません」を表示)
- キーポイント: フォールバック表示で代替検証 ✅ (Nano非対応環境では正常動作の期待値どおり)
- Shadow DOM の CSS が note 側に漏れていない: ✅ (note 本来の h1 が DOM 上に存在し、CSS 計算値が Shadow DOM 内スタイルに侵食されていないことを確認)
- ESC キーでサイドパネルが closed になる: ✅
- リサイズドラッグで幅が変動(300-600px 範囲内): ✅
- [note-abstract] prefixのconsole.errorが0件: ✅
- 有料部分除去 (fixture テスト): ✅ (o-noteAreaPaymentWall 以降の兄弟ノード・paywall-content が完全除去、hasPaywall フラグも true)
- 段階表示 (analyzing → generating → done/error) のコード実装: ✅ (STAGES定数に全4段階、content.js で setStage('analyzing') → setStage('generating') → setStage('done') の遷移を実装)

### 手動確認
- 実ブラウザでの視覚的UI確認 (Playwright headful で動作確認済み。外観・アニメーションの主観評価は人間確認を推奨)

### 総合判定: 合格

### 備考
- Gemini Nano (Summarizer API) は Playwright 起動の Chromium では利用不可。仕様書通り「Nano未対応時はフォールバックメッセージ表示 (Sprint 9で本格対応)」の動作を確認。
- パフォーマンス: テスト全体 4.5秒 (警告なし)

## Sprint 3 評価結果(2026-05-08 試行1回目)

### 静的検査
- ファイル構造: ✅ (src/lib/crypto.js, src/lib/storage.js, src/lib/gemini-client.js, src/options/options.html, src/options/options.js, tests/e2e/sprint-03.spec.js すべて存在)
- Manifest検証: ✅ (content_scripts に crypto.js / storage.js を追加、host_permissions は依然として note.com のみ)
- セキュリティ静的検査: ✅
  - APIキーは平文で保存しない (XOR + Base64 で難読化、chrome.storage.local の値は Base64 文字列のみ)
  - APIキーを開発者サーバーに送信しない (fetch 先は generativelanguage.googleapis.com のみ)
  - Crypto モジュールはユーザーの端末を出ない固定パッドを使用 (仕様通り「強固な暗号化ではない」)
  - options.js は input 値を localStorage 等に書き出さず、検証成功時のみ Storage.setApiKey を経由
- 入力バリデーション: ✅ (validateInputShape で短すぎるキー / 空白文字を事前に拒否)

### Playwright自動テスト (npx playwright test --reporter=list)
- テスト結果: 10 passed (Sprint 1 + Sprint 2 + Sprint 3)
- crypto round-trip works and encrypted output does not leak plaintext: ✅ (4種類の入力で encrypt→decrypt が一致、暗号化文字列に元キーが含まれないことを検証)
- storage saves API key encrypted and getApiKey decrypts back: ✅ (chrome.storage.local の生値に "AIzaSy" プレフィックスや FAKE_API_KEY が含まれないことを確認)
- options page renders form with password input, validate, clear: ✅ (input[type=password]、検証ボタン、削除ボタン (初期 disabled)、未設定メッセージ表示)
- validate button stores encrypted key on stubbed Gemini success and clear removes it: ✅ (page.route で 200 OK を返却 → 暗号化保存 → 削除ダイアログ accept で全消去)
- validate button shows friendly error on stubbed 401 response: ✅ (401 でユーザーフレンドリーな日本語エラー表示、保存は行われない)
- side panel settings tab reflects API key status and open-options button is wired: ✅ (未設定 → 「未設定」表示、worker 経由でキー注入後にタブ切替で「設定済み」へ更新、開くボタンクリックで openOptionsPage 経由のタブ追加を確認)

### 手動確認
- options ページ UI は Playwright headful で表示確認済み。色合い・余白の主観評価は人間確認を推奨。

### 総合判定: 合格

### 備考
- Gemini API へのリトライは 429 / 5xx に対して指数バックオフ (500ms, 1s, 2s) で最大 3 回。
- 暗号化は仕様通り簡易方式 (XOR + Base64)。Sprint 9 以降で WebCrypto による強化を検討。
- chrome.runtime.openOptionsPage は content script から直接呼べないため、サービスワーカー経由でリレー。
