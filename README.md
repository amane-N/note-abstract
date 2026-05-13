# note アブストラクト

note.com の記事を論文のアブストラクト形式で要約・分析する Chrome 拡張機能

`Manifest V3` | `Vanilla JS` | `Chrome 138+`

## 概要

**note アブストラクト** は、note.com で記事を読むとき、論文のアブストラクト形式で内容を要約・整理する Chrome 拡張機能です。記事の核心・キーポイント・示唆を瞬時に把握できるほか、批判的分析や関連キーワード探索機能で深い読書をサポートします。Chrome Built-in AI (Gemini Nano) を使うため、API キーなしで端末内処理が可能です。また、Google AI Studio の API キー (無料) を設定することで、Nano 未対応環境でも全機能が使えます。

## 主要機能

1. **アブストラクト要約** — 記事の主旨・キーポイント・示唆を論文形式で自動抽出
2. **批判的予測・分析** — 論拠の強度・見落とし・発展可能性を 3 セクション構造で分析
3. **関連キーワード生成** — テーマ関連キーワード 5 件と note.com 検索リンクを自動提示
4. **テンプレート 30 種** — 標準要約から SWOT・5W1H・反論検討まで多彩なプロンプトを選択可能
5. **Markdown / JSON エクスポート + 履歴** — 要約結果の書き出しと過去履歴の端末内保存

## 動作要件

- Chrome 138 以上 (Chrome Built-in AI / Gemini Nano を使う場合)
- Chrome 120 以上 (BYOK 利用時)
- BYOK を使う場合は Google AI Studio の API キー ([無料で取得できます](https://aistudio.google.com/app/apikey))

## インストール (開発者向け)

1. `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このリポジトリのルートディレクトリを選択する

Chrome Web Store からのインストール (申請準備完了済み) については、審査通過後にリンクを追記します。

## 使い方

1. note.com の記事ページ (`https://note.com/*/n/*`) を開く
2. ツールバーの拡張アイコンをクリックするか、`Ctrl+Shift+Y` (Mac: `Command+Shift+Y`) でサイドパネルを開く
3. タブを切り替えて要約 / 予測 / 関連 / 履歴 / 設定を利用する

## ビルド

```sh
# 依存パッケージのインストール
npm install

# E2E テストの実行 (Chrome 拡張機能ロード + Playwright)
npm run test:e2e

# 本番 ZIP の生成 → dist/note-abstract-v0.1.0.zip
npm run build:zip
```

`build:zip` の出力ファイルは Chrome Web Store へそのまま提出できます。

## アーキテクチャ

| ディレクトリ | 責務 |
|-------------|------|
| `src/content/` | コンテンツスクリプト。Shadow DOM サイドパネルの構築・イベント制御 |
| `src/background/` | Service Worker。コマンドキー受信・コンテンツスクリプトへの転送 |
| `src/lib/` | 共有ライブラリ群 (NoteParser / GeminiClient / NanoSummarizer / Exporter 等) |
| `src/options/` | オプションページ。API キー設定・ライセンス管理 |
| `src/popup/` | ツールバーポップアップ。記事以外のページでの案内表示 |
| `src/templates/` | テンプレート定義 JSON (30 種のプロンプト) |

## プライバシー

詳細は [docs/privacy-policy.md](docs/privacy-policy.md) を参照してください。

本拡張機能は **個人情報を一切収集しません**。テレメトリ・アクセス解析・クラッシュレポートも実装していません。API キーはブラウザ内 (`chrome.storage.local`) にのみ保存され、Google のサーバーへ直接送信されます。開発者サーバーを経由しません。

## ライセンス

MIT License

Copyright (c) 2026 Amane.N

本リポジトリのソースコードに対して MIT ライセンスを適用します。ただし、note.com の記事内容に関する著作権は各記事の著者 (note ユーザー) に帰属します。本拡張機能は記事の著作権を何ら侵害するものではありません。

## サポート

不具合・ご要望は Issue またはメールにてご連絡ください。

Email: amane.n4802@gmail.com

## 開発状況

Sprint 11 完了 — Chrome Web Store 申請可能状態
