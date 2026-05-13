# Chrome Web Store 掲載情報

## 短い説明 (132 文字以内)

note.com の記事を論文のアブストラクト形式で要約。批判的分析と関連キーワードで深い読書を支援する Chrome 拡張。 (56 文字)

## 詳細説明

**note アブストラクト** は、note.com の記事を読みながら論文のアブストラクト形式で要約・分析する Chrome 拡張機能です。記事を開くだけで、記事の核心・論点・示唆を瞬時に整理し、深い読書をサポートします。

### できること

- **アブストラクト要約**: 記事の主旨・キーポイント・示唆を論文形式で自動抽出。読了時間の目安も表示します。
- **批判的予測・分析**: 論拠の強度・見落とされた視点・発展可能性を 3 セクション構造で分析します。
- **関連キーワード生成**: 記事テーマに関連するキーワード 5 件と note.com 検索リンクを自動提示します。
- **テンプレート 30 種**: 標準要約・SWOT 分析・5W1H・反論検討など、目的に合わせて使い分けられます。
- **Markdown / JSON エクスポート + 履歴**: 要約結果を Markdown や JSON でコピーし、過去の要約を履歴として端末内に保存できます。

### 2 つの AI エンジン

| エンジン | 説明 |
|----------|------|
| Chrome Built-in AI (Gemini Nano) | Chrome 138 以上で API キー不要。端末内で処理するため、テキストが外部に送信されません。 |
| BYOK (Google AI Studio) | 無料で取得できる Google AI Studio の API キーを設定すると利用できます。Nano 未対応環境でも全機能が使えます。 |

### プライバシー設計

本拡張機能は **個人情報を一切収集しません**。テレメトリ・アクセス解析・クラッシュレポートも実装していません。API キーはお使いのブラウザ内 (`chrome.storage.local`) にのみ保存され、Google のサーバーへ直接送信されます。開発者サーバーを経由しません。

### note.com 利用規約遵守

本拡張機能は note.com の利用規約を遵守して設計されています。有料記事の有料部分には一切アクセスせず、無料公開部分のみを処理対象とします。要約結果は個人利用の補助のみを目的とし、外部公開・商業利用は禁止しています。また、バックグラウンドでの自動巡回・スクレイピングは行いません。

---

## カテゴリ

Productivity

## 言語

日本語 (Japanese)

## 主要機能 (5 つ)

1. **アブストラクト要約** — 記事の主旨・キーポイント・示唆を論文のアブストラクト形式で抽出
2. **批判的予測・分析** — 論拠の強度・見落とし・発展可能性を 3 セクションで分析
3. **関連キーワード生成** — テーマ関連キーワード 5 件と note.com 検索リンクを自動提示
4. **テンプレート 30 種** — 標準要約から SWOT・5W1H まで多彩なプロンプトを選択可能
5. **Markdown / JSON エクスポート + 履歴** — 要約結果の書き出しと過去履歴の端末内保存

## 価格モデル

- **無料 (Gemini Nano)**: Chrome 138 以上であれば API キー不要。端末内処理で完全無料。
- **BYOK 無料**: Google AI Studio の API キー (無料) を設定すると、Nano 未対応環境でも全機能が利用可能。
- **現在の状態**: 履歴・テンプレート・エクスポート等すべての機能を無料で公開中。将来的にプレミアムオプションを設ける可能性がありますが、現時点では全機能が制限なく使えます。

## アイコン / スクリーンショット素材

| 種別 | ファイル |
|------|---------|
| アイコン 128px | [assets/icon-128.png](../assets/icon-128.png) |
| アイコン 48px | [assets/icon-48.png](../assets/icon-48.png) |
| アイコン 16px | [assets/icon-16.png](../assets/icon-16.png) |
| スクリーンショット 1 (要約タブ) | [docs/screenshots/screenshot-1.png](screenshots/screenshot-1.png) |
| スクリーンショット 2 (予測タブ) | [docs/screenshots/screenshot-2.png](screenshots/screenshot-2.png) |
| スクリーンショット 3 (関連タブ) | [docs/screenshots/screenshot-3.png](screenshots/screenshot-3.png) |
| スクリーンショット 4 (テンプレート一覧) | [docs/screenshots/screenshot-4.png](screenshots/screenshot-4.png) |
| スクリーンショット 5 (エクスポートメニュー) | [docs/screenshots/screenshot-5.png](screenshots/screenshot-5.png) |

## サポート連絡先

amane.n4802@gmail.com

## ホームページ URL

https://amane-n.github.io/note-abstract/

## プライバシーポリシー URL

https://amane-n.github.io/note-abstract/privacy-policy.html

## 利用規約 URL

https://amane-n.github.io/note-abstract/terms-of-use.html
