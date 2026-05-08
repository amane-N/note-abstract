# CLAUDE.md — note アブストラクト

このファイルは Claude Code が各タスク開始時に自動読み込みする設定です。

## プロジェクト概要

note アブストラクトは、note.com の記事を論文のアブストラクト形式で要約する Chrome 拡張機能 (Manifest V3)。Vanilla JavaScript (ES2022) と Chrome Built-in AI (Gemini Nano / Summarizer API)、および BYOK の Google AI Studio API を組み合わせ、記事の核心抽出 + 批判的分析 + 関連探索を提供する。動作対象は `https://note.com/*/n/*` のみ。3 層フリーミアム (無料 / BYOK 無料 / 有料 480 円買い切り) で提供する。

詳細仕様は `# note アブストラクト - Claude Code 統合指示書.md` (以下「マスター」) を参照。

## NEVER ルール (絶対にやってはいけないこと)

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

## ALWAYS ルール (常に守ること)

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

## コードスタイル

- インデント: スペース 2 個
- 文字列: シングルクォート `'` を基本
- セミコロン: あり
- 関数: アロー関数を基本、メソッドのみ短縮構文
- 変数: `const` 優先、再代入のみ `let`、`var` 禁止
- 非同期処理: async/await を使用
- console.log: 開発中のみ。リリース版では削除する Sprint を別途設ける

## ハーネス設計の運用ルール

- Planner = 人間 (ユーザー)、Generator + Evaluator = Claude Code が兼務
- 各 Sprint は次のサイクルで進める:
  1. Generator プロンプトを実行 → 実装する
  2. 自己評価チェックリストを実行 → 全項目 ✓ になるまで自己修正
  3. Evaluator プロンプトを実行 → Playwright MCP でテスト
  4. 合格基準に達するまで Generator にフィードバックして修正
  5. 合格したら git commit し、ユーザーに「Sprint N 完了」と報告
  6. ユーザーの「次の Sprint へ進んで」指示を待ってから次へ
- §2 の NEVER / ALWAYS ルールは絶対遵守。仕様変更が必要なときは実装前にユーザーへ確認。
- Chrome 拡張機能のテストは Playwright の persistent context (--load-extension) で実施。
- コミットメッセージ: `[Sprint N] <タイトル>` + 主要機能の箇条書き + 合格基準クリア状況。

詳細仕様は `# note アブストラクト - Claude Code 統合指示書.md` を参照。
