# note アブストラクト - Claude Code 統合指示書

> このドキュメント 1 つで、note アブストラクト Chrome 拡張機能の開発を Claude Code に依頼できます。
>
> **手順**: (1) このファイルを空フォルダに置く → (2) そのフォルダで `claude` を起動 → (3) §0 のコードブロック内部をコピーして貼り付ける。これだけでフォルダ階層作成・ファイル生成・git 初期化・Sprint 1 実装まで自動進行します。

---

## 目次

- §0 マスタープロンプト (最初に Claude Code に渡す)
- §1 プロジェクト概要
- §2 絶対遵守ルール (NEVER / ALWAYS)
- §3 設計書
- §4 ハーネス設計 (3 エージェント構成)
- §5 Sprint 構成
- §6 Sprint 別 Generator / Evaluator プロンプト集
- §7 トラブルシューティング

---

# §0 マスタープロンプト

## 使い方 (3 ステップ)

1. このドキュメント (`note-abstract-master.md`) を、これから作るプロジェクト用の空フォルダの中に配置する
   - 例: `~/projects/note-abstract/note-abstract-master.md`
2. そのフォルダで `claude` コマンドを実行して Claude Code を起動する
3. 下記「コピーするコードブロック」の **コードブロック内部 (3 つのバッククォートに挟まれた部分)** をすべてコピーして Claude Code に貼り付ける

これだけで、Claude Code は自動的にフォルダ階層・ファイル群を作成し、`git init` を実行し、Sprint 1 の実装に入ります。

## コピーするコードブロック

下のコードブロック (グレーの枠) の **中身をすべて** 選択してコピーしてください。先頭の「あなたは〜」から末尾の「〜入ってください。」までです。コードブロックの上下にあるこの説明文はコピー不要です。

```text
あなたは「note アブストラクト」という Chrome 拡張機能を開発する Claude Code エージェントです。
本プロジェクトは 3 エージェント構成のハーネス設計 (Planner / Generator / Evaluator) で進めます。
あなたは Generator と Evaluator の 2 役を担います。Planner は人間 (ユーザー) です。

================================================================
ステップ 1: ドキュメント読み込み
================================================================
まず、現在の作業ディレクトリにある note-abstract-master.md 全体を読み込んでください。
このファイルがプロジェクトの完全な仕様書です。読了後、要点を 3 行で確認報告してください。

================================================================
ステップ 2: 初期セットアップ (フォルダ・ファイルの自動生成)
================================================================
作業ディレクトリ直下に、以下のフォルダとファイルをすべて自動で作成してください。
ディレクトリは存在しなければ mkdir -p で再帰作成し、各ディレクトリに .gitkeep を置いて
git で空ディレクトリも追跡できるようにしてください。

[作成するディレクトリ]
- src/
- src/content/
- src/background/
- src/popup/
- src/options/
- src/lib/
- src/templates/
- assets/
- tests/
- tests/e2e/
- tests/fixtures/
- docs/

[作成するファイル (内容は以下に従う)]

(1) .gitignore
   Node.js / VS Code / macOS / 拡張機能ビルド成果物の標準的な無視リスト
   最低限: node_modules/ , dist/ , *.zip , .DS_Store , .vscode/ , .env

(2) README.md
   - プロジェクト名: note アブストラクト
   - 1 行説明: note.com の記事を論文のアブストラクト形式で要約する Chrome 拡張機能
   - 開発状況: "現在開発中 (Sprint 1)"
   - 詳細は note-abstract-master.md を参照と明記
   - ライセンスは未定 (Sprint 11 で決定) と明記

(3) package.json
   npm init -y で生成後、以下を設定:
   - name: "note-abstract"
   - version: "0.1.0"
   - private: true
   - description: "Chrome extension that summarizes note.com articles in abstract format"
   - devDependencies に @playwright/test を追加 (Sprint 1 でインストール)
   - scripts に "test:e2e": "playwright test"

(4) CLAUDE.md
   Claude Code が各タスク開始時に自動読み込みする設定ファイル。以下を含めること:
   - プロジェクト概要 (note-abstract-master.md §1 を簡潔に要約)
   - NEVER ルール 6 項目 (§2.1 を全文抜粋)
   - ALWAYS ルール 5 項目 (§2.2 を全文抜粋)
   - コードスタイル (§2.3 を全文抜粋)
   - 「詳細仕様は note-abstract-master.md を参照」と明記
   - ハーネス設計の運用ルール (§4 の運用サイクルを箇条書きで)

(5) docs/privacy-policy.md
   プレースホルダ (Sprint 10 で正式版作成予定 と明記)

(6) docs/store-listing.md
   プレースホルダ (Sprint 11 で正式版作成予定 と明記)

[git の初期化]
- git init を実行
- 上記すべてを git add . でステージ
- git commit -m "chore: initial scaffold and CLAUDE.md setup" でコミット

================================================================
ステップ 3: 仕様の理解 (内省)
================================================================
note-abstract-master.md の §1〜§4 を完全に理解してください:
- §1 プロジェクト概要
- §2 絶対遵守ルール (NEVER 6 項目、ALWAYS 5 項目をすべて暗記)
- §3 設計書
- §4 ハーネス設計

理解後、以下の質問に自分で答えて確認してください (回答はチャットには出力不要、内省のみ):
- NEVER ルール 6 項目をすべて言えるか?
- ALWAYS ルール 5 項目をすべて言えるか?
- 3 層フリーミアムの各層で何ができるか?
- ハーネス設計のサイクルは?

================================================================
ステップ 4: Sprint 1 の開始
================================================================
§5 の Sprint 構成を確認し、§6 の Sprint 1 の Generator プロンプトに従って実装を開始してください。
ステップ 2 で作成したフォルダ階層がすでに存在する前提で、Sprint 1 では各フォルダ内に
具体的な実装ファイル (manifest.json / src/content/content.js 等) を作成してください。

================================================================
Sprint の進め方 (全 Sprint 共通)
================================================================
Sprint ごとに以下のサイクルを厳守してください:

  ① Generator プロンプトを実行 → 実装する
  ② 自己評価チェックリストを実行 → 全項目 ✓ になるまで自己修正
  ③ Evaluator プロンプトを実行 → Playwright MCP でテスト
  ④ 合格基準に達するまで Generator にフィードバックして修正
  ⑤ 合格したら git commit し、ユーザーに「Sprint N 完了」と報告
  ⑥ ユーザーの「次の Sprint へ進んで」指示を待ってから次へ

================================================================
絶対遵守
================================================================
§2 の NEVER ルール 6 項目と ALWAYS ルール 5 項目は、いかなる場合も違反してはなりません。
仕様変更が必要だと感じた場合は、実装前にユーザーに必ず確認してください。

================================================================
Playwright MCP
================================================================
Evaluator のテストは Playwright MCP を使用します。Chrome 拡張機能のテストは
persistent context (--load-extension) で行います。Sprint 1 で環境を構築し、以降の
Sprint ではその環境を再利用してください。

================================================================
コミット規約
================================================================
各 Sprint 完了時に必ず 1 コミット。フォーマット:
  [Sprint N] <Sprint タイトル>
  - 実装した主要機能を箇条書き
  - Evaluator の合格基準クリア状況

================================================================
質問・確認のタイミング
================================================================
- 仕様の不明点 → 実装着手前に質問
- §2 のルールに違反する可能性がある提案 → 必ず確認
- Sprint 完了報告時 → ユーザーの次指示を待つ (勝手に次の Sprint へ進まない)

================================================================
最初の宣言
================================================================
それでは、ステップ 1〜4 を順に実行してください。
ステップ 2 の初期セットアップが完了したら、ファイル一覧を ls -R 等で表示し、
「初期セットアップ完了。Sprint 1 を開始します」と宣言してから Sprint 1 の実装に入ってください。
```

## コピーが正しくできたかの確認

貼り付け後、Claude Code が以下のような応答を始めれば成功です。

- 「note-abstract-master.md を読み込みます」と宣言する
- mkdir / touch / git init などのコマンドを実行する
- 作成したファイル一覧を ls -R で表示する
- 「初期セットアップ完了。Sprint 1 を開始します」と宣言する

もしいきなり Sprint 1 の実装に入ろうとしたり、初期セットアップを飛ばす素振りがあれば、「ステップ 2 の初期セットアップを先に実行してください」と指示してください。

---

# §1 プロジェクト概要

## 1.1 プロダクト基本情報

| 項目 | 内容 |
|---|---|
| プロダクト名 | note アブストラクト |
| 種類 | Chrome 拡張機能 (Manifest V3) |
| 動作対象 | `https://note.com/*/n/*` (note 個別記事ページのみ) |
| 収益モデル | 3 層フリーミアム (無料 / BYOK 無料 / 有料 480 円買い切り) |
| 開発期間目安 | 全 11 Sprint で約 14 日 (Claude Code 並走前提) |

## 1.2 ビジョン

note.com の累計 7,000 万件以上のコンテンツ群から、ユーザーが「自分に必要な記事か」を最短時間で判断できるようにする。論文のアブストラクトのように記事の核心を抽出し、批判的分析と関連探索の起点を提供する。

## 1.3 技術スタック

- Manifest V3
- Vanilla JavaScript (ES2022) — フレームワーク不使用
- Chrome Built-in AI APIs (Summarizer API, Prompt API)
- Google AI Studio API (Gemini API) — BYOK
- chrome.storage.local / chrome.storage.sync
- ライセンス決済: ExtensionPay (Sprint 5 で簡易版、将来拡張)
- テスト: Playwright MCP

依存関係は最小限とし、バンドラーも初版では使用しない。

## 1.4 ディレクトリ構造

```
note-abstract/
├── note-abstract-master.md      # 本ドキュメント
├── CLAUDE.md                    # Claude Code 向け簡易設定 (本ドキュメントから自動生成)
├── manifest.json                # 拡張機能マニフェスト
├── src/
│   ├── content/
│   │   ├── content.js           # note 記事ページに注入
│   │   └── side-panel.js        # サイドパネル UI
│   ├── background/
│   │   └── service-worker.js
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   ├── options/
│   │   ├── options.html
│   │   └── options.js
│   ├── lib/
│   │   ├── nano-summarizer.js
│   │   ├── gemini-client.js
│   │   ├── note-parser.js
│   │   ├── storage.js
│   │   ├── license.js
│   │   └── crypto.js
│   └── templates/
│       └── prompts.json
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── tests/
│   ├── e2e/
│   └── fixtures/
└── docs/
    ├── store-listing.md
    └── privacy-policy.md
```

---

# §2 絶対遵守ルール

## 2.1 NEVER ルール (絶対にやってはいけないこと)

これらは違反するとプロジェクトが致命傷を負う規則です。Generator は実装中にこれらを破る提案があった場合、必ずユーザーに確認してください。

### NEVER 1: 有料記事の有料部分にアクセスしない

note の有料記事は `<div class="note-common-styles__textnote-body"><div class="o-noteContentText">` 構造で、有料部分は購入後にしかレンダリングされない。仮にトークン化された情報や非公開フィールドが DOM に存在しても、それを処理対象に含めてはならない。**抽出対象は無料部分のみ**。

### NEVER 2: バックグラウンドで自動巡回・スクレイピングしない

ユーザーが現在開いているタブのページのみ処理する。タブ切替時に過去のタブをバックグラウンドで再処理する仕組みを入れてはならない。一覧ページから記事 URL を収集する機能も入れてはならない。

### NEVER 3: 記事の DOM を改変しない

サイドパネルは Shadow DOM 内で完結させる。note のオリジナル DOM ツリーには一切の変更を加えない。CSS の影響も note 側に漏らさない (Shadow DOM で隔離)。例外的に許容されるのは `document.body` 直下の `id="note-abstract-host"` 要素 1 つの追加のみ。

### NEVER 4: 要約結果を外部公開・販売しない

個人利用補助の範囲を厳守。SNS シェアボタンも初版では実装しない (規約解釈のグレーゾーン回避)。

### NEVER 5: ユーザーの API キーを開発者サーバーに送信しない

chrome.storage.local に保存し、Google AI Studio への直接通信のみ。暗号化キーもクライアント側固定値を使用 (流出時の生キー露出回避が目的、強固な暗号化ではない)。

### NEVER 6: ユーザーに無断でテレメトリを送信しない

初版では一切のテレメトリ・分析を実装しない。将来追加する場合はオプトイン方式とする。

## 2.2 ALWAYS ルール (常に守ること)

### ALWAYS 1: 最小権限の原則

manifest.json の permissions は実際に使うものだけ。host_permissions は `https://note.com/*` のみ。tabs 権限は使わず activeTab で十分。

### ALWAYS 2: Shadow DOM でサイドパネルを実装する

note 側 CSS の干渉を受けず、こちらの CSS が note 側に漏れない設計を厳守。

### ALWAYS 3: エラー時はユーザーに分かるメッセージを表示

"Failed" や "Error" のような不親切な表示は禁止。例: "記事の取得に失敗しました。ページを再読み込みしてください"。常に「次に何をすればよいか」を提示する。

### ALWAYS 4: 各機能のオン/オフをユーザーが切り替えられる

サイドパネル自体の表示切替、個別機能 (要約 / 予測 / 関連) の有効化フラグを設ける。

### ALWAYS 5: Gemini Nano 未対応環境への配慮

Chrome 138 未満 / 非 Chromium ブラウザ / モバイル等の検出ロジックを必ず実装し、未対応時は BYOK 誘導を表示する。

## 2.3 コードスタイル

- インデント: スペース 2 個
- 文字列: シングルクォート `'` を基本
- セミコロン: あり
- 関数: アロー関数を基本、メソッドのみ短縮構文
- 変数: `const` 優先、再代入のみ `let`、`var` 禁止
- 非同期処理: async/await を使用
- console.log: 開発中のみ。リリース版では削除する Sprint を別途設ける

---

# §3 設計書

## 3.1 機能境界 (3 層フリーミアム)

### 3.1.1 無料層 (即利用・APIキー不要)

Chrome 組み込みの Gemini Nano のみで動作。摩擦ゼロの入り口。

| 機能 | 入力 | 出力 | 使用 API |
|---|---|---|---|
| 基本要約 | 記事本文テキスト | 3〜5 文のアブストラクト | Summarizer API |
| キーポイント抽出 | 記事本文テキスト | 箇条書き 3〜5 項目 | Summarizer API (key-points) |
| 読了時間目安 | 記事本文文字数 | "約 N 分" 表示 | (計算のみ) |

### 3.1.2 BYOK 無料層 (Google AI Studio APIキー設定済み)

| 機能 | 入力 | 出力 | 使用 API |
|---|---|---|---|
| 将来予測・含意分析 | 記事本文 + テンプレート | 3 観点の批判的分析 | Gemini API (gemini-2.5-flash) |
| 関連キーワード提案 | 記事本文 + タイトル | 5 キーワード + note 検索 URL | Gemini API |
| 基本テンプレート切替 | テンプレート ID | 標準/ビジネス/学術 視点 | (プロンプト切替) |

### 3.1.3 有料層 (480 円買い切り)

| 機能 | 内容 |
|---|---|
| 履歴保存 | 各タブの結果を chrome.storage.local に保存 (上限 1,000 件) |
| 履歴横断検索 | キーワード全文検索 (オプションページ) |
| テンプレート集 30 種以上 | 視点別プロンプト |
| エクスポート連携 | Obsidian / Notion / note 下書き |
| JSON/CSV エクスポート | 履歴全体のバックアップ |

## 3.2 UI 設計

### 3.2.1 サイドパネル方式

note 記事ページの右側にサイドパネルとして表示。Shadow DOM でホストページから完全分離。

- 拡張機能アイコンクリックでトグル
- ESC キーで閉じる
- ドラッグで幅変更可能 (300〜600px)
- 状態は chrome.storage.sync に保存 (デバイス間同期)

### 3.2.2 タブ構成

| タブ | 表示内容 | 必要層 |
|---|---|---|
| 要約 | アブストラクト / キーポイント / 読了時間 | 無料 |
| 予測 | 将来予測 + 含意分析 | BYOK 以上 |
| 関連 | キーワード 5 つ + note 検索リンク | BYOK 以上 |
| 履歴 | 過去の要約一覧 + 検索 | 有料 |
| 設定 | APIキー / テンプレート / エクスポート | 全層 |

未開放層のタブには鍵アイコン + 開放案内を表示。

### 3.2.3 オプションページとポップアップ

- **オプションページ**: APIキー入力・検証、テンプレート管理、履歴検索 + エクスポート、ライセンス管理
- **ポップアップ**: 現在ページの状態、サイドパネル開閉、設定リンク、ライセンス状態

## 3.3 データ保存仕様

| データ | 保存先 | 暗号化 | 同期 | 保持期間 |
|---|---|---|---|---|
| Google AI Studio APIキー | chrome.storage.local | あり (固定鍵) | × | ユーザー削除まで |
| ユーザー設定 | chrome.storage.sync | × | ○ | ユーザー削除まで |
| 要約履歴 | chrome.storage.local | × | × | 上限 1,000 件 (FIFO) |
| ライセンス情報 | chrome.storage.local | あり (固定鍵) | × | ユーザー削除まで |

履歴データの構造:
```json
{
  "id": "uuid-v4",
  "url": "https://note.com/example/n/abc123",
  "title": "記事タイトル",
  "createdAt": "ISO8601",
  "summary": "アブストラクト文",
  "keyPoints": ["..."],
  "prediction": "予測テキスト",
  "keywords": ["..."],
  "templateId": "standard"
}
```

## 3.4 技術アーキテクチャ

### 3.4.1 構成要素

```
┌─────────────────────────────────────┐
│  Service Worker (background)        │
│  - メッセージルーティング            │
│  - APIコール代行 (CORS回避)          │
│  - ライセンス検証                    │
└──────────────┬──────────────────────┘
               │ chrome.runtime
┌──────────────▼──────────────────────┐
│  Content Script (note.com/*/n/*)    │
│  - note DOM 解析                    │
│  - サイドパネル UI 注入 (Shadow DOM) │
│  - Gemini Nano 直接呼び出し          │
└─────────────────────────────────────┘
```

### 3.4.2 note DOM 解析セレクタ

```javascript
const ARTICLE_SELECTORS = {
  title: 'h1.o-noteContentHeader__title',
  body: '.note-common-styles__textnote-body .o-noteContentText',
  paywallMarker: '.o-noteAreaPaymentWall',
  freeBodyOnly: '.note-common-styles__textnote-body .o-noteContentText p:not(.paywall-content)'
};
```

DOM 構造変更時の堅牢性: セレクタ取得失敗時は段階的フォールバック (A → B → C)。それでも失敗時は "記事を取得できませんでした" 表示。

### 3.4.3 Gemini Nano 統合

```javascript
const checkNanoAvailability = async () => {
  if (!('Summarizer' in self)) return 'unsupported';
  const { available } = await Summarizer.availability();
  return available; // 'readily' | 'after-download' | 'no'
};

const summarize = async (text) => {
  const summarizer = await Summarizer.create({
    type: 'tldr',
    length: 'short',
    format: 'plain-text'
  });
  return await summarizer.summarize(text);
};
```

### 3.4.4 Gemini API (BYOK) 統合

- モデル: `gemini-2.5-flash` (デフォルト) / `gemini-2.5-flash-lite` (フォールバック)
- リクエストは Service Worker 経由 (CORS 対策)
- リトライポリシー: 429 は指数バックオフで最大 3 回
- レスポンスサイズ上限: 8,000 トークン

## 3.5 テンプレート集 (有料層 30 種以上)

`src/templates/prompts.json` に定義。各テンプレートの構造:

```json
{
  "id": "investor",
  "name": "投資家視点",
  "category": "business",
  "tier": "premium",
  "promptPrefix": "あなたはベンチャー投資家です...",
  "outputSections": ["市場機会", "リスク", "投資妥当性"]
}
```

カテゴリ別候補 (各 5 種、合計 30 種):

- **ビジネス**: 投資家 / 起業家 / マーケター / PM / コンサル
- **学術**: 研究者 / 論文 Discussion 風 / 批判的検証 / 文献レビュー / メタ分析
- **クリエイティブ**: 作家 / 編集者 / 企画屋 / コピーライター / 脚本家
- **読者層別**: 初心者向け / 専門家向け / 子供向け / 海外読者向け / 高速スキャン
- **目的別**: 購入判断補助 / 引用元検証 / 反論ポイント抽出 / 行動抽出 / 類似事例想起
- **その他**: 感情分析 / 文体分析 / 信頼性スコア / 著者立場分析 / 時事文脈づけ

## 3.6 重要な UX 設計

### 3.6.1 サイドパネルの初期動作

自動展開せず、以下のフロー:

1. 拡張機能アイコンに小さなバッジ表示 ("要約準備完了")
2. ユーザーがアイコンクリックで初めて展開
3. ユーザーが「次回から自動展開」をチェックすれば、以降は自動展開

### 3.6.2 要約処理のロード表示

ローカル AI でも数秒かかるため、段階表示:

- "記事を解析中..." (DOM 解析)
- "要約を生成中..." (Gemini Nano 実行)
- "完了"

### 3.6.3 BYOK の APIキー設定フロー

1. 予測タブ・関連タブをクリック
2. "Google AI Studio APIキーが必要です" の説明 + 取得手順リンク
3. キー入力フォーム + ペーストボタン
4. 入力後に Gemini API へ ping (`gemini-2.5-flash` で短い応答取得)
5. 検証成功時にキーを暗号化保存

### 3.6.4 Gemini Nano 未対応ブラウザ向けフォールバック

Chrome 138 未満 / 非 Chromium ブラウザ等で `Summarizer in self === false` のとき:

1. 要約タブに "お使いの環境ではローカル AI 機能が利用できません" 表示
2. "Google AI Studio の無料 APIキーを設定すると、すべての機能が利用可能になります" の誘導
3. 設定タブへのジャンプボタン
4. 設定後は要約も Gemini API 経由 (`gemini-2.5-flash-lite` を使用しコスト最小化)

### 3.6.5 Gemini Nano 初回ダウンロード時の UX

`Summarizer.availability()` が `'after-download'` を返す場合:

1. 拡張機能アイコンに "準備中" バッジ表示
2. サイドパネル展開時、要約タブに進捗バー表示
3. 進捗イベント (`monitor.addEventListener('downloadprogress', ...)`) を購読し UI 更新
4. ダウンロード中もユーザー操作を妨げない (BYOK 設定済みならクラウド経由で動作)
5. 完了時にトースト通知

## 3.7 規約遵守の境界線

### 3.7.1 安全圏

- ユーザーが自分のブラウザで開いたページを、ユーザー本人のために処理する
- 認知補助の延長として解釈可能
- 2025 年 8 月以降 note は AI 学習対価還元プログラムを開始しており、AI 処理への態度は寛容化

### 3.7.2 グレーゾーンと回避策

| グレーな行為 | 回避策 |
|---|---|
| 有料記事の有料部分推測 | `.paywall-content` 除外設計 |
| バックグラウンド巡回 | activeTab + ユーザー操作起点に限定 |
| DOM 改変 | Shadow DOM で完結 |
| 複数記事横断分析 | ユーザー手動で各記事を開く前提に限定 |

### 3.7.3 緊急対応設計

- 機能フラグを `chrome.storage.local` に保持
- 連絡先 (開発者メール) をオプションページとストア説明文に明記

## 3.8 リスクと対策

| リスク | 確度 | 影響 | 対策 |
|---|---|---|---|
| note の DOM 構造変更 | 中 | 高 | セレクタを config 化 |
| Gemini Nano API 仕様変更 | 中 | 中 | Chrome の origin trial 動向監視 |
| Google AI Studio 無料枠廃止 | 低 | 高 | OpenRouter 等への切替パス |
| Chrome Web Store 審査落ち | 低 | 中 | Sprint 10 で事前点検 |
| note 運営からの停止要請 | 低 | 致命 | §3.7.3 を Sprint 1 から組み込み |

## 3.9 成功指標 (リリース後 3 ヶ月時点)

| 指標 | 撤退ライン | 中間 | 成功 |
|---|---|---|---|
| インストール数 | < 50 | 100〜500 | 500+ |
| 有料転換率 | 0% | 1〜3% | 5%+ |
| Chrome Web Store 評価 | < 3.0 | 3.5〜4.2 | 4.3+ |

---

# §4 ハーネス設計 (3 エージェント構成)

## 4.1 役割分担

| エージェント | 担当者 | 役割 |
|---|---|---|
| **Planner** | 人間 (ユーザー) | 仕様策定。本ドキュメント §3 がその出力物 |
| **Generator** | Claude Code | 各 Sprint を 1 つずつ実装 |
| **Evaluator** | Claude Code + Playwright MCP | 実装の動作検証 |

## 4.2 運用サイクル

```
[Generator プロンプト投入]
        ↓
   Claude Code 実装
        ↓
  自己評価チェック
        ↓ (全項目 ✓ なら次へ)
[Evaluator プロンプト投入]
        ↓
  Playwright MCP テスト
        ↓
   合格基準判定
   ┌────┴────┐
   ↓         ↓
 不合格      合格
   ↓         ↓
 Generator   git commit
 へ修正FB    次の Sprint
```

## 4.3 各 Sprint の Definition of Done

以下をすべて満たしたとき完了:

1. 該当 Sprint の機能仕様を満たしている
2. Generator の自己評価チェックリスト全項目が ✓
3. Evaluator の Playwright テスト全基準が閾値クリア
4. NEVER ルール / ALWAYS ルールに違反していない
5. コミット済み

## 4.4 Playwright MCP の運用

Chrome 拡張機能のテストは Playwright の persistent context を使用:

```bash
chrome --disable-extensions-except=<拡張機能パス> --load-extension=<拡張機能パス>
```

Sprint 1 で環境を構築し、以降の Sprint ではその環境を再利用。

## 4.5 評価軸 (全 Sprint 共通)

1. **機能性**: 仕様通りに動くか
2. **規約遵守**: NEVER ルールに違反していないか
3. **UX**: ユーザーに親切か
4. **パフォーマンス**: 想定時間内に動くか
5. **保守性**: コードが読みやすく拡張可能か

## 4.6 サブエージェントによる実装

§4.1〜§4.5 で定義した 3 エージェント構成は、Claude Code の
サブエージェント機能 (`.claude/agents/` 配下のファイル) として実装されている。

| 役割 | サブエージェントファイル | 使用 model |
|------|--------------------------|------------|
| Planner | `.claude/agents/planner.md` | opus |
| Generator | `.claude/agents/generator.md` | sonnet |
| Evaluator | `.claude/agents/evaluator.md` | sonnet |

Sprint 6 以降のオーケストレーション手順は CLAUDE.md の「サブエージェント運用」
セクションを参照。

---

# §5 Sprint 構成 (全 11 Sprint)

| Sprint | タイトル | 目的 | 期間目安 |
|---|---|---|---|
| 1 | プロジェクト基盤 | 拡張機能の骨組みと note 記事検出 | 1 日 |
| 2 | 無料層コア | Gemini Nano 要約 + サイドパネル UI | 2 日 |
| 3 | API キー管理 | BYOK 設定 UI と暗号化保存 | 1 日 |
| 4 | BYOK 層 | 将来予測 + 関連キーワード + 基本テンプレート | 2 日 |
| 5 | ライセンス基盤 | 有料層解放の仕組み | 1 日 |
| 6 | 履歴保存・横断検索 | 有料機能① | 2 日 |
| 7 | テンプレート集 30 種 | 有料機能② | 1 日 |
| 8 | エクスポート連携 | 有料機能③ | 1 日 |
| 9 | UX 洗練 | 初回 DL UX / 未対応ブラウザ / エラー処理 | 1 日 |
| 10 | 規約コンプライアンス強化 | 有料記事保護 / 最小権限再点検 | 1 日 |
| 11 | ストア提出準備 | アイコン / スクショ / 説明文 | 1 日 |

合計 14 日の見積もり。

---

# §6 Sprint 別 Generator / Evaluator プロンプト集

## Sprint 1: プロジェクト基盤

**目的**: Chrome 拡張機能の骨組みを作り、note 記事ページを検出する Content Script を動作させる。Playwright MCP のテスト環境も整える。

**依存**: なし

### Generator プロンプト

```text
Sprint 1 を実装してください。

【前提】
ステップ 2 の初期セットアップは完了済みのはずです。以下を確認してから開始:
- src/, tests/, docs/ などのフォルダが存在する
- CLAUDE.md, README.md, package.json, .gitignore が存在する
もし不足があればこの Sprint の冒頭で補完してください。

【タスク】
1. Playwright のインストール
   - npm install --save-dev @playwright/test を実行
   - npx playwright install chromium で Chromium をインストール
   - playwright.config.js をプロジェクトルートに作成
     (testDir: './tests/e2e', timeout: 60000)

2. manifest.json (Manifest V3) を作成
   - name: "note アブストラクト"
   - version: "0.1.0"
   - manifest_version: 3
   - description: "note.com の記事を要約・分析する Chrome 拡張機能"
   - permissions: ["storage", "activeTab"] のみ
   - host_permissions: ["https://note.com/*"] のみ
   - content_scripts: https://note.com/*/n/* で content.js を注入
   - background.service_worker: src/background/service-worker.js
   - action.default_popup: src/popup/popup.html
   - options_page: src/options/options.html
   - icons: 16/48/128 (assets/ 内、ダミー単色 PNG で OK)

3. src/content/content.js を実装
   - note 記事ページかどうかを判定 (URL パターンで)
   - 記事タイトルと本文を DOM から抽出 (§3.4.2 のセレクタ)
   - 抽出成功/失敗をコンソールログに出力 (デバッグ用)
   - サイドパネル UI はまだ実装しない (Sprint 2 で実装)
   - Shadow DOM 用のホスト要素のみ document.body に追加
     (id="note-abstract-host")

4. src/background/service-worker.js を実装 (起動ログのみの最小実装)

5. src/popup/popup.html / popup.js (ウェルカム表示のみ)

6. src/options/options.html / options.js (プレースホルダのみ)

7. assets/ にダミーアイコン 3 サイズを作成
   - 単色 PNG で OK (Sprint 11 で本番化)
   - icon-16.png / icon-48.png / icon-128.png

8. tests/e2e/sprint-01.spec.js を作成
   - Playwright で persistent context を起動して拡張機能をロード
   - https://note.com/info/n/nf3f7ff494105 を開く
   - content.js のコンソールログにタイトルが出力されているか確認
   - note 以外のページ (example.com 等) では content.js が動作しないことを確認

【絶対遵守】
- §2 の NEVER / ALWAYS ルール全てに従う
- DOM 改変は Shadow DOM ホスト要素の追加のみ
- permissions の追加は禁止 (storage と activeTab のみ)

【完了後】
すべての成果物を git add . & git commit "[Sprint 1] プロジェクト基盤" する前に、
自己評価チェックリストを実行し、Evaluator プロンプトを実行してください。
合格基準を満たした後にコミットしてください。
```

### 自己評価チェックリスト

- [ ] manifest.json が Manifest V3 形式で valid
- [ ] permissions が "storage", "activeTab" のみ
- [ ] host_permissions が "https://note.com/*" のみ
- [ ] content.js が note 記事ページのみで動作 (URL パターンマッチ)
- [ ] note 記事のタイトルと本文を抽出できる
- [ ] note の DOM ツリーを改変していない (Shadow DOM ホスト追加のみ)
- [ ] tests/e2e/sprint-01.spec.js が記述されている
- [ ] console.error が発生していない

### Evaluator プロンプト

```text
Sprint 1 のテストを Playwright MCP で実施してください。

【テスト手順】
1. Playwright で persistent context を起動 (拡張機能をロード)
2. https://note.com/info/n/nf3f7ff494105 にアクセス
3. ページのコンソールを監視
4. 以下の確認項目をすべて検証

【合格基準】
- ✓ 拡張機能がロードされ、エラーなしで起動する
- ✓ note 記事ページでコンソールに記事タイトルがログ出力される
- ✓ note 以外のページでは content.js が動作しない
- ✓ note の DOM 構造が改変されていない
- ✓ document.body 直下に id="note-abstract-host" の要素のみ追加されている
- ✓ console.error が 0 件

合格基準: 全 6 項目で合格。1 つでも失敗で不合格。
```

---

## Sprint 2: 無料層コア (Gemini Nano 要約 + サイドパネル)

**目的**: Chrome 組み込みの Summarizer API を使って記事要約を生成し、Shadow DOM 内のサイドパネルに表示する。

**依存**: Sprint 1 完了

### Generator プロンプト

```text
Sprint 2 を実装してください。

【タスク】
1. src/lib/nano-summarizer.js を作成
   - Summarizer API の利用可能性チェック関数 checkAvailability()
   - 要約生成関数 summarize(text, options)
     - options.type: 'tldr' | 'key-points'
     - options.length: 'short' | 'medium' | 'long'
   - エラーハンドリング (未対応 / モデルダウンロード中 / API エラー)

2. src/lib/note-parser.js を作成
   - extractArticle(): タイトル/本文/有料境界の検出
   - 有料部分は絶対に含めない (NEVER ルール 1)
   - countCharacters() / calculateReadingTime() (600 字/分基準)

3. src/content/side-panel.js を作成
   - Shadow DOM 内にサイドパネル UI を構築
   - タブ構成: 要約 / 予測 / 関連 / 履歴 / 設定 (要約以外はプレースホルダ)
   - 要約タブ: アブストラクト / キーポイント / 読了時間
   - 開閉トグル / ESC で閉じる / ドラッグで幅変更 (300〜600px)

4. src/content/content.js を更新
   - 拡張機能アイコンクリック (background 経由) でサイドパネル表示切替
   - サイドパネル展開時に nano-summarizer を呼び出す

5. src/background/service-worker.js を更新
   - chrome.action.onClicked でサイドパネル展開メッセージを送信

6. tests/e2e/sprint-02.spec.js を作成

【UX 設計上の重要点】
- サイドパネル展開はユーザー操作起点 (§3.6.1)
- ロード表示は段階的に (§3.6.2)
- Shadow DOM で完全分離

【絶対遵守】
- 有料記事の有料部分には絶対にアクセスしない
- 記事 DOM を改変しない
- Gemini Nano が利用できない場合は仮メッセージ (Sprint 9 で本格対応)
```

### 自己評価チェックリスト

- [ ] Summarizer API のチェックロジックが実装されている
- [ ] 要約タブにアブストラクトが表示される (Chrome 138+ 環境)
- [ ] キーポイントが箇条書きで表示される
- [ ] 読了時間が計算され表示される
- [ ] サイドパネルが Shadow DOM 内に閉じ込められている (CSS 干渉なし)
- [ ] アイコンクリックでサイドパネルが開閉する
- [ ] ESC キーで閉じる
- [ ] ドラッグで幅変更が可能
- [ ] 有料記事の有料部分が抽出対象から除外されている

### Evaluator プロンプト

```text
Sprint 2 のテストを Playwright MCP で実施してください。

【テスト手順】
1. Playwright で拡張機能をロードして起動
2. https://note.com/info/n/nf3f7ff494105 にアクセス
3. 拡張機能アイコンをクリックしてサイドパネルを展開
4. 要約タブの内容を確認
5. ESC キーで閉じる確認
6. ドラッグで幅変更が動作するか確認
7. 有料記事の URL でも確認し、有料部分が含まれないか確認

【合格基準】
- ✓ サイドパネルが 5 秒以内に表示される
- ✓ 要約テキストが 50 文字以上 1,000 文字以下で表示される
- ✓ キーポイントが 3〜5 項目表示される
- ✓ 読了時間が "約 N 分" 形式で表示される
- ✓ Shadow DOM の CSS が note 側に漏れていない
- ✓ ESC キー押下でサイドパネルが閉じる
- ✓ 有料記事で有料部分の文字列が要約に含まれていない
- ✓ 段階表示 ("解析中" → "生成中" → "完了") が確認できる

【パフォーマンス基準】
- 要約生成: ローカル AI で 10 秒以内
- サイドパネル開閉アニメーション: 300ms 以内

合格基準: 全 8 項目で合格。パフォーマンス基準は警告のみで不合格にしない (Sprint 9 で対処)。
```

---

## Sprint 3: APIキー管理

**目的**: Google AI Studio API キーの設定 UI と暗号化保存、検証ロジックを実装する。

**依存**: Sprint 2 完了

### Generator プロンプト

```text
Sprint 3 を実装してください。

【タスク】
1. src/lib/crypto.js を作成
   - 簡易暗号化 (XOR + Base64) で OK
   - encrypt(plaintext) / decrypt(ciphertext)

2. src/lib/storage.js を作成
   - getApiKey() / setApiKey(key) / clearApiKey()
   - APIキーは暗号化して chrome.storage.local に保存
   - getSettings() / setSettings(settings) は chrome.storage.sync を使用

3. src/lib/gemini-client.js を作成
   - callGemini(prompt, options) 関数
   - モデル: gemini-2.5-flash (デフォルト) / gemini-2.5-flash-lite (オプション)
   - リトライ: 429 は指数バックオフで最大 3 回
   - エラー時の分かりやすいメッセージ

4. src/options/options.html / options.js を実装
   - APIキー入力フォーム (パスワード型 input)
   - 検証ボタン (Gemini API へ短い ping)
   - 検証成功時に保存
   - 既存キー削除ボタン

5. src/content/side-panel.js を更新
   - 設定タブに APIキー設定状況を表示
   - 「設定ページを開く」ボタンで chrome.runtime.openOptionsPage()

6. tests/e2e/sprint-03.spec.js

【絶対遵守】
- APIキーは平文で保存しない
- APIキーを開発者サーバーに送信しない
```

### 自己評価チェックリスト

- [ ] APIキーが暗号化されて保存される
- [ ] 検証ボタンで実際に Gemini API へ ping できる
- [ ] 不正なキーで検証失敗時に分かりやすいエラー表示
- [ ] キー削除機能が動作
- [ ] 設定タブから設定ページへ遷移できる

### Evaluator プロンプト

```text
Sprint 3 のテストを Playwright MCP で実施してください。

【テスト手順】
1. オプションページを開く
2. テスト用 APIキーを入力
3. 検証ボタン押下
4. ストレージ確認: chrome.storage.local の apiKey が暗号化されているか
5. 不正キーで検証 → エラーメッセージ確認

【合格基準】
- ✓ 正しいキーで検証成功 (5 秒以内)
- ✓ 保存後に chrome.storage.local の値が平文の APIキーと異なる
- ✓ 不正キーで検証失敗時に "APIキーが無効です" 等の日本語メッセージ
- ✓ クリアボタンでキーが削除される
- ✓ 開発者サーバーへの通信が発生していない (Network タブ確認)

合格基準: 全 5 項目で合格。
```

---

## Sprint 4: BYOK 層 (将来予測 + 関連キーワード + 基本テンプレート 3 種)

**目的**: Gemini API を使った将来予測機能、関連キーワード提案 + note 検索リンク生成、基本テンプレート 3 種の切替機能を実装する。

**依存**: Sprint 3 完了

### Generator プロンプト

```text
Sprint 4 を実装してください。

【タスク】
1. src/templates/prompts.json を作成
   - 基本テンプレート 3 種 (id: standard / business / academic)
   - 各テンプレートに promptPrefix と outputSections
   - 構造は §3.5 を参照

2. src/lib/predictor.js を作成
   - generatePrediction(article, templateId) を実装
   - prompts.json からテンプレートを読み込み、Gemini API を呼ぶ
   - 出力: 3 セクション構造の批判的分析テキスト

3. src/lib/keyword-suggester.js を作成
   - suggestKeywords(article) を実装
   - Gemini API で関連キーワード 5 つ生成
   - 各キーワードの note 検索 URL を生成
     (https://note.com/search?q=<URLエンコード>)

4. src/content/side-panel.js を更新
   - 予測タブ: テンプレート選択ドロップダウン + 予測結果表示
   - 関連タブ: キーワード 5 つ + クリックで新規タブで note 検索

5. APIキー未設定時の誘導表示

6. tests/e2e/sprint-04.spec.js

【UX 注意】
- API 呼び出し中はローダー表示
- エラー時は具体的メッセージ
```

### 自己評価チェックリスト

- [ ] 予測タブで 3 セクション構造のテキストが表示される
- [ ] テンプレート切替で内容が変わる
- [ ] 関連キーワードが 5 つ表示される
- [ ] キーワードクリックで note 検索が新規タブで開く
- [ ] APIキー未設定時に分かりやすい誘導が出る
- [ ] レート制限エラーで適切なメッセージが出る

### Evaluator プロンプト

```text
Sprint 4 のテストを Playwright MCP で実施してください。

【テスト手順】
1. APIキー設定済みで note 記事ページを開く
2. サイドパネル展開 → 予測タブ
3. 「標準」「ビジネス」「学術」の各テンプレートで予測実行
4. 各結果が異なる視点であることを確認
5. 関連タブを開いてキーワード 5 つを確認
6. 1 つのキーワードをクリックし、新規タブで note 検索ページが開くことを確認

【合格基準】
- ✓ 予測結果が 30 秒以内に返る
- ✓ 各テンプレートで明らかに異なる文体・観点の結果
- ✓ キーワードがちょうど 5 つ
- ✓ キーワードクリックで https://note.com/search?q=... に遷移
- ✓ APIキー削除後にアクセスすると誘導が表示される

合格基準: 全 5 項目で合格。
```

---

## Sprint 5: ライセンス基盤

**目的**: 有料層解放の仕組みを実装する。

**依存**: Sprint 4 完了

### Generator プロンプト

```text
Sprint 5 を実装してください。

【タスク】
1. src/lib/license.js を作成
   - getLicenseStatus(): 'free' | 'premium' を返す
   - activateLicense(code): 購入コードで有料層解放
   - deactivateLicense()

2. 初版実装方式: 簡易ライセンスコード方式
   - フォーマット: NA-XXXX-XXXX-XXXX
   - テスト用コード "NA-TEST-DEMO-MODE" を有効化しておく
   - 将来 ExtensionPay 等への切替を見据えてインターフェース化

3. src/options/options.html を更新
   - ライセンス入力フォーム
   - 現在のライセンス状態表示
   - 「購入する」リンク (Sprint 11 で実販売 URL に差し替え)

4. src/content/side-panel.js を更新
   - 履歴タブを「有料機能」表示でロック (鍵アイコン)
   - 有料層解放後は履歴タブのプレースホルダ (Sprint 6 で本実装)

5. tests/e2e/sprint-05.spec.js

【設計上の注意】
- ライセンス検証はクライアント側のみ (オフライン動作)
- 「クラックされてもいい」設計思想 (善意のユーザーを邪魔しない)
```

### 自己評価チェックリスト

- [ ] テスト用コードで有料層が解放される
- [ ] 不正コードでエラーが出る
- [ ] 解放後は履歴タブの鍵が外れる
- [ ] ライセンス情報が暗号化保存される

### Evaluator プロンプト

```text
Sprint 5 のテストを Playwright MCP で実施してください。

【テスト手順】
1. オプションページを開く
2. テスト用コード "NA-TEST-DEMO-MODE" を入力 → 解放
3. サイドパネル → 履歴タブの鍵が外れていることを確認
4. ライセンス削除 → 鍵が再表示されることを確認
5. 不正コード "INVALID-CODE" → エラー表示を確認

【合格基準】
- ✓ 正しいコードで有料層解放 (1 秒以内)
- ✓ 不正コードでエラーメッセージ表示
- ✓ ライセンス情報が暗号化されて保存されている
- ✓ 解放/削除がリアルタイムにサイドパネルに反映される

合格基準: 全 4 項目で合格。
```

---

## Sprint 6: 履歴保存・横断検索 (有料機能①)

**目的**: 要約・予測・関連結果を履歴として保存し、オプションページで横断検索できるようにする。

**依存**: Sprint 5 完了

### Generator プロンプト

```text
Sprint 6 を実装してください。

【タスク】
1. src/lib/storage.js を拡張
   - addHistory(entry) / getHistory(filters) / searchHistory(query)
   - deleteHistory(id) / clearHistory()
   - 上限 1,000 件 (FIFO で古いものから削除)
   - データ構造は §3.3 を参照

2. src/content/side-panel.js を更新
   - 要約・予測・関連の各実行結果を自動で履歴に保存 (有料層のみ)
   - 履歴タブで最新 20 件を表示
   - 各エントリクリックで詳細表示モーダル

3. src/options/options.html を拡張
   - 履歴一覧画面 (ページネーション付き)
   - 検索フォーム (タイトル / 本文 / キーワード横断)
   - JSON / CSV エクスポート機能
   - 全削除ボタン (確認ダイアログ付き)

4. tests/e2e/sprint-06.spec.js

【絶対遵守】
- 履歴は chrome.storage.local のみに保存 (外部送信なし)
- 無料層・BYOK 層では履歴保存しない
```

### 自己評価チェックリスト

- [ ] 有料層で要約実行時に履歴が保存される
- [ ] 無料層・BYOK 層では履歴が保存されない
- [ ] 履歴タブに最新 20 件が表示される
- [ ] オプションページで全文検索ができる
- [ ] JSON / CSV エクスポートが動作する
- [ ] 1,000 件超過時に古いものから削除される

### Evaluator プロンプト

```text
Sprint 6 のテストを Playwright MCP で実施してください。

【テスト手順】
1. ライセンス解放状態で 3 つの note 記事を順に開いて要約
2. サイドパネル → 履歴タブで 3 件表示を確認
3. オプションページの履歴一覧で全件確認
4. キーワード検索で各記事を呼び出し
5. JSON エクスポート → ダウンロードファイル検証
6. 全削除 → 履歴が空になることを確認
7. ライセンス削除 → 履歴タブが鍵表示になることを確認

【合格基準】
- ✓ 履歴が記事ごとに正しく保存される
- ✓ 検索で部分一致がヒットする
- ✓ JSON エクスポートのフォーマットが §3.3 に準拠
- ✓ 無料層に戻ると履歴機能が即座にロックされる

合格基準: 全 4 項目で合格。
```

---

## Sprint 7: テンプレート集 30 種 (有料機能②)

**目的**: prompts.json にテンプレート 30 種以上を定義し、有料層で全テンプレートが使えるようにする。

**依存**: Sprint 6 完了

### Generator プロンプト

```text
Sprint 7 を実装してください。

【タスク】
1. src/templates/prompts.json を完成させる
   - 既存 3 種に加え、§3.5 のカテゴリと候補を参考に最低 30 種作成
   - 各テンプレートに id, name, category, tier, promptPrefix, outputSections
   - tier: 'free' (3 種) / 'premium' (27 種以上)

2. src/content/side-panel.js を更新
   - 予測タブのテンプレート選択ドロップダウンを階層表示に
   - カテゴリでグルーピング
   - tier=premium のテンプレートは無料層では「🔒 有料機能」表示

3. src/options/options.html を拡張
   - テンプレート管理画面
   - 各テンプレートの詳細プレビュー
   - お気に入り登録機能 (chrome.storage.sync で同期)

4. tests/e2e/sprint-07.spec.js

【テンプレート品質要件】
- 各 promptPrefix は 100 文字以上、視点が明確
- outputSections は 3〜5 個
- 同じ記事を異なるテンプレートで実行すると、明らかに異なる結果
```

### 自己評価チェックリスト

- [ ] テンプレートが 30 種以上定義されている
- [ ] カテゴリが 5 つ以上ある
- [ ] 有料層で全テンプレートが選択可能
- [ ] 無料層では tier=free の 3 種のみ選択可能
- [ ] お気に入り登録がデバイス間で同期される

### Evaluator プロンプト

```text
Sprint 7 のテストを Playwright MCP で実施してください。

【テスト手順】
1. 有料層解放状態でサイドパネル → 予測タブ
2. テンプレートドロップダウンを開いて全 30 種以上を確認
3. 同じ note 記事で 5 つの異なるテンプレートで実行
4. 各結果が明確に異なる観点であることを目視確認
5. 無料層に戻して、tier=premium のテンプレートが選択不可になることを確認
6. お気に入り登録 → 別デバイスエミュレートでも反映を確認

【合格基準】
- ✓ テンプレート総数 30 種以上
- ✓ 5 つの異なるテンプレートで明らかに異なる結果
- ✓ 無料層で premium テンプレートがロックされる
- ✓ お気に入り登録が chrome.storage.sync に保存される

合格基準: 全 4 項目で合格。
```

---

## Sprint 8: エクスポート連携 (有料機能③)

**目的**: 要約結果を Obsidian / Notion / note 下書きへエクスポートする機能を実装する。

**依存**: Sprint 7 完了

### Generator プロンプト

```text
Sprint 8 を実装してください。

【タスク】
1. src/lib/exporter.js を作成
   - toObsidian(entry): YAML フロントマター付き Markdown
   - toNotion(entry): Notion Web Clipper 互換フォーマット
   - toNoteDraft(entry): note 下書き向けプレーンテキスト
   - copyToClipboard(text)

2. src/content/side-panel.js を更新
   - 各タブにエクスポートボタンを追加 (有料層のみ)
   - クリックでエクスポート先選択
   - 選択後にクリップボードへコピー → トースト通知

3. note 下書き連携の特殊処理
   - 「note 下書きへ送信」選択時、新規タブで https://note.com/new を開く
   - クリップボードに整形済みテキストをコピー

4. tests/e2e/sprint-08.spec.js

【絶対遵守】
- エクスポート結果に有料記事の有料部分を含めない
- エクスポート時のテレメトリ送信なし
```

### 自己評価チェックリスト

- [ ] 3 つのエクスポート形式が動作する
- [ ] クリップボードへ正しい内容がコピーされる
- [ ] note 下書きエクスポート時に新規タブで note/new が開く
- [ ] 無料層・BYOK 層ではエクスポートボタンが表示されない

### Evaluator プロンプト

```text
Sprint 8 のテストを Playwright MCP で実施してください。

【テスト手順】
1. 有料層で note 記事の要約実行
2. エクスポートボタン → Obsidian 形式
3. クリップボード内容を取得し、YAML フロントマター + Markdown 構造を検証
4. Notion 形式 → クリップボード検証
5. note 下書き → 新規タブで https://note.com/new が開くか確認

【合格基準】
- ✓ Obsidian 形式: YAML 4 項目以上 + 本文
- ✓ Notion 形式: 見出しと箇条書きを含む構造化テキスト
- ✓ note 下書き: プレーンテキスト + URL の引用
- ✓ note 下書き選択時に新規タブが開く
- ✓ いずれもクリップボードへの copy が成功

合格基準: 全 5 項目で合格。
```

---

## Sprint 9: UX 洗練 (初回 DL UX / 未対応ブラウザ / エラー処理)

**目的**: §3.6.4 と §3.6.5 を完全実装する。

**依存**: Sprint 8 完了

### Generator プロンプト

```text
Sprint 9 を実装してください。

【タスク】
1. Gemini Nano 未対応ブラウザフォールバック (§3.6.4)
   - Summarizer API 未対応を検出
   - 要約タブに誘導表示
   - APIキー設定済みなら gemini-2.5-flash-lite で要約代替実行
   - APIキー未設定なら BYOK 設定への誘導

2. Gemini Nano 初回ダウンロード UX (§3.6.5)
   - availability() === 'after-download' の場合
   - 進捗バー表示 (downloadprogress イベント購読)
   - ダウンロード中も BYOK 設定済みならクラウド経由で動作
   - 完了時にトースト通知

3. エラーハンドリング統合
   - 全機能で try-catch + ユーザー向けメッセージ
   - エラータイプ別の対処
     - ネットワークエラー: "接続を確認してください"
     - レート制限: "しばらく待ってから再試行してください"
     - 不正な APIキー: "設定ページで APIキーを再確認してください"
     - DOM 取得失敗: "記事が取得できません。ページを再読み込みしてください"

4. tests/e2e/sprint-09.spec.js

【UX 原則】
- ユーザーが「次に何をすればよいか」を必ず示す
- "Failed" や "Error" は禁止語
- 専門用語を避け、日本語で平易に
```

### 自己評価チェックリスト

- [ ] Gemini Nano 未対応時に BYOK へ誘導される
- [ ] BYOK モードで gemini-2.5-flash-lite が動作する
- [ ] 初回ダウンロード時に進捗が表示される
- [ ] ダウンロード中も BYOK 経由で動作する
- [ ] 全エラーメッセージが日本語で分かりやすい
- [ ] エラー時に次のアクションが提示される

### Evaluator プロンプト

```text
Sprint 9 のテストを Playwright MCP で実施してください。

【テスト手順】
1. Gemini Nano が無効な環境をシミュレート
2. 要約タブを開いて誘導表示を確認
3. APIキー設定後、要約が gemini-2.5-flash-lite で動作することを確認
4. ネットワーク切断 → 各機能でエラーメッセージ確認
5. 不正な APIキー設定 → エラーメッセージ確認

【合格基準】
- ✓ Nano 未対応で BYOK 誘導が出る
- ✓ BYOK モードで要約が動作する (10 秒以内)
- ✓ ネットワークエラー時のメッセージが具体的
- ✓ どのエラーでも「次のアクション」が提示される

合格基準: 全 4 項目で合格。
```

---

## Sprint 10: 規約コンプライアンス強化

**目的**: note の利用規約遵守を最終確認し、有料記事の有料部分保護・最小権限原則を再点検する。

**依存**: Sprint 9 完了

### Generator プロンプト

```text
Sprint 10 を実装してください。

【タスク】
1. 有料記事の有料部分保護を強化
   - note-parser.js に厳格モードを追加
   - 複数のセレクタで有料境界を検出
   - 一つでも検出ミスがあれば抽出を中止
   - テスト用に有料記事のフィクスチャ HTML を tests/fixtures/ に配置

2. 最小権限の再検証
   - manifest.json の permissions を再点検
   - 不要な権限を削除
   - host_permissions を厳格化

3. NEVER ルール違反の自動検出
   - tests/compliance.spec.js を作成
   - DOM 改変チェック
   - 外部送信先のホワイトリスト検証 (Google AI Studio のみ許可)
   - バックグラウンド処理が activeTab 起点であることを確認

4. プライバシーポリシー / 利用規約の文言準備
   - docs/privacy-policy.md
   - docs/terms-of-use.md

5. 連絡先・サポート設計
   - オプションページに開発者連絡先を表示
   - "問題を報告" リンク (mailto:)

【絶対遵守事項を全機能で再確認】
§2 の NEVER ルール 1〜6 を全機能で違反していないかチェック。
```

### 自己評価チェックリスト

- [ ] 有料記事のすべてのテストフィクスチャで有料部分が含まれない
- [ ] manifest.json の permissions が最小化されている
- [ ] DOM 改変が発生していない (Shadow DOM ホスト追加除く)
- [ ] 外部送信先が Google AI Studio API のみ
- [ ] プライバシーポリシー文書が用意されている
- [ ] 開発者連絡先が表示されている

### Evaluator プロンプト

```text
Sprint 10 のテストを Playwright MCP で実施してください。

【テスト手順】
1. tests/fixtures/ の全有料記事 HTML をローカルでロード
2. 各記事で要約実行 → 有料部分の文字列が含まれないか確認
3. ネットワークタブで送信先を全記録
4. note 記事ページで note の DOM が一切改変されていないことを確認
5. プライバシーポリシー・連絡先が適切に表示されているか確認

【合格基準】
- ✓ 有料記事のテストで 0 件の有料部分流出
- ✓ ネットワーク送信先が Google AI Studio (generativelanguage.googleapis.com) のみ
- ✓ note の DOM ツリー差分が "id=note-abstract-host" の追加のみ
- ✓ プライバシーポリシーが日本語で完結している
- ✓ 開発者連絡先が機能している

合格基準: 全 5 項目で合格。1 つでも失敗すると致命的なので必ずすべてクリア。
```

---

## Sprint 11: ストア提出準備

**目的**: Chrome Web Store への提出に必要な全素材を揃える。

**依存**: Sprint 10 完了

### Generator プロンプト

```text
Sprint 11 を実装してください。

【タスク】
1. アイコン作成 (ダミーから本番化)
   - 16x16 / 48x48 / 128x128 PNG
   - シンプルな note 風 + 要約マーク
   - assets/ に配置

2. ストア用スクリーンショット 5 枚
   - 1280x800 推奨
   - 各機能のデモを撮影
   - tests/e2e/screenshot.spec.js で自動撮影

3. ストア説明文 (docs/store-listing.md)
   - 短い説明 (132 文字以内)
   - 詳細説明
   - カテゴリ: Productivity
   - 主要機能 5 つの箇条書き
   - 価格モデルの説明

4. プライバシーポリシーと利用規約を最終化

5. 本番ビルドスクリプト
   - package.json または build.sh で zip 化

6. README.md の作成

【最終チェックリスト】
- 全 Sprint の自己評価がすべて完了している
- 全 Evaluator テストが合格している
- 規約遵守が徹底されている
```

### 自己評価チェックリスト

- [ ] アイコン 3 サイズが揃っている
- [ ] スクリーンショット 5 枚が揃っている
- [ ] ストア説明文が完成している
- [ ] プライバシーポリシーが公開可能な状態
- [ ] 本番ビルドの .zip が生成できる
- [ ] README.md が完成している

### Evaluator プロンプト

```text
Sprint 11 の最終確認を実施してください。

【テスト手順】
1. .zip を解凍して別ディレクトリで Chrome 拡張機能としてロード
2. 全機能を一通り操作して動作確認
3. ストア説明文を実際の Chrome Web Store プレビューでレンダリングテスト
4. アイコンが各サイズで正しく表示されることを確認
5. プライバシーポリシーが Web 公開可能な形式

【合格基準】
- ✓ ストア提出に必要な全素材が揃っている
- ✓ .zip ロード後の動作が完全
- ✓ アイコンが各サイズで適切に表示
- ✓ ストア説明文が Chrome Web Store の文字数制限内
- ✓ プライバシーポリシーが完結している

合格基準: 全 5 項目で合格。これにて全 Sprint 完了、Chrome Web Store 申請可能状態。
```

---

# §7 トラブルシューティング

## 7.1 Generator が困ったとき

- 本ドキュメントの §1〜§4 と現在のコードを再読込
- 不明点があれば実装を進める前にユーザーに質問
- 仕様変更が必要なら Planner (ユーザー) に立ち戻る

## 7.2 Evaluator が困ったとき

- Playwright MCP のセッションをリスタート
- 拡張機能を再ロード
- ブラウザのキャッシュをクリア
- それでもだめなら Generator に「再現できない」とフィードバック

## 7.3 仕様の曖昧さに遭遇したとき

実装を勝手に進めず、必ずユーザーに以下のフォーマットで確認:

```
【仕様確認】
Sprint N の実装中に、以下の仕様の曖昧さに遭遇しました:

[曖昧な点の説明]

選択肢:
A. [選択肢 A の説明]
B. [選択肢 B の説明]
C. [選択肢 C の説明]

私のおすすめ: [理由付きで]

どれで進めましょうか?
```

## 7.4 NEVER ルール違反の疑いがある提案を受けたとき

ユーザーが「○○の機能を追加して」と指示した際、それが NEVER ルールに抵触する可能性がある場合は、実装前に以下を確認:

```
【NEVER ルール抵触の可能性】
ご指示いただいた機能は、§2 の NEVER ルール N に抵触する可能性があります。

具体的には:
- [どのルールに抵触するか]
- [どのようなリスクがあるか]

代替案として以下があります:
- [代替案 A]
- [代替案 B]

進め方をご指示ください。
```

## 7.5 全 Sprint 完了後

Chrome Web Store 申請前に以下を実施:

1. テストユーザー 3〜5 名にベータテスト依頼
2. プライバシーポリシーを公開 URL に配置 (GitHub Pages 等)
3. 開発者連絡先メールアドレスを準備
4. ストア提出 → 審査待ち (通常 1〜3 営業日)
5. 公開後に note 記事「Claude Code で作った note アブストラクト全工程」を公開

---

# 付録 A: 参考リンク

- Manifest V3: https://developer.chrome.com/docs/extensions/develop
- Summarizer API: https://developer.chrome.com/docs/ai/summarizer-api
- Prompt API: https://developer.chrome.com/docs/ai/prompt-api
- Google AI Studio: https://aistudio.google.com/
- Playwright Chrome Extension Testing: https://playwright.dev/docs/chrome-extensions

# 付録 B: コミット規約

各 Sprint 完了時に必ず 1 コミット:

```
[Sprint N] <Sprint タイトル>

- 実装した主要機能を箇条書き
- Evaluator の合格基準クリア状況
```

# 付録 C: 開発開始の最終チェック

このドキュメントを読んだ Claude Code は、以下のチェックを完了したら開発を開始してください:

- [ ] §1 プロジェクト概要を理解した
- [ ] §2 NEVER ルール 6 項目を暗記した
- [ ] §2 ALWAYS ルール 5 項目を暗記した
- [ ] §3 設計書全体を把握した
- [ ] §4 ハーネス設計のサイクルを理解した
- [ ] §5 全 11 Sprint の構成を把握した
- [ ] §6 Sprint 1 のプロンプトを開いて準備完了

「Sprint 1 を開始します」と宣言したら、Generator プロンプトの実行に入ってください。