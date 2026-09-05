# AIエージェント開発ガイドライン

このドキュメントは、Amazon商品調査システムに携わるAIコーディングエージェントのためのベストプラクティス、必須手順、およびコード規約を体系的にまとめたものである。

## 1. 基本方針と開発原則

### 1.1 セキュリティと機密情報管理

Amazon Creators APIの認証情報の取り扱いには、最優先でセキュリティを確保すること。

- **ログ出力の禁止**:
  `AMAZON_CREATORS_APPLICATION_ID`, `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET` をコンソール、ログ、ファイル、またはコミットメッセージに出力しないこと。
- **環境変数の利用**: 秘密情報には `process.env` を通じてアクセスすること。キーをハードコードしたり、平文のファイルに保存したりしないこと。
- **エラーハンドリング**: API失敗時のエラーメッセージから機密情報が漏洩しないようにすること。

### 1.2 コミュニケーション・設計方針

- 積極的に提案を行いつつも、既存 of 設計パターンを尊重すること。
- 要件が曖昧な場合は、実装を進める前にユーザーに確認を行うこと。
- 変更内容は `walkthrough.md` に明確に記録すること。

---

## 2. 開発環境の構築と運用

### 2.1 パッケージマネージャー (pnpm)

- 本プロジェクトでは **pnpm** を使用する。`npm` や `yarn` は使用しないこと。
- 依存関係をインストールする際は、不慮のロックファイル更新を防ぐため、必ず `pnpm install --frozen-lockfile` を実行すること。

### 2.2 開発用ローカルサーバーの起動と停止

ローカル動作確認を行う際は、以下の手順でサーバーを制御する。

- **サーバー起動手順**:

  ```bash
  # バックグラウンドで起動する場合 (Windows PowerShell)
  Start-Process pnpm -ArgumentList "run", "server:dev" -WindowStyle Hidden
  
  # または通常通り起動
  pnpm run server:dev
  ```

  > [!NOTE]
  > 開発用サーバー（`server:dev`）は、起動およびビルド時間短縮のために以下の最適化が施されている：
  > - **不要データの除外**: テンプレートで参照されない `data/investigations/` 配下の数千件のJSONファイルは、本番・開発ともにマウント設定（`config.toml`）でロード対象から完全に除外されている。
  > - **キャッシュの軽量化**: 約56MBある本番用キャッシュ `data/cache/paapi-product-cache.json` はロードされず、空のダミーキャッシュ（`data/cache/paapi-product-cache.dev.json`）を代わりにマウントして起動する。そのため、一部の画像が開発環境では `No Image` にフォールバックされるが、本番ビルド時には正常にキャッシュから取得される。
  > - **Git情報の無効化**: 8400件超のコミット履歴探索をスキップするため、`hugo.dev.toml` にて `enableGitInfo = false` を設定している。

- **サーバー停止手順**:
  作業終了後、不要になったサーバーは `Ctrl+C` またはプロセス終了で停止すること。

### 2.3 安全な Python 実行環境 (uv)

- pipによるサプライチェーン攻撃を防ぐため、Python スクリプトの実行時は **`uv`** を使用すること。
- これにより、`uv.lock` に基づいた安全で一貫性のある仮想環境が自動構築され、外部パッケージの改ざんや不正な即時アップデートのリスクを完全に排除できる。
- 実行例: `uv run python scripts/validate_artifact.py <生成したJSONファイル>`

---

## 3. 品質保証と検証フロー

### 3.1 必須の検証手順（CIエラーの防止）

GitHub Actions CIはLintやBiomeのエラーがあると失敗するため、いかなるタスクも以下のコマンドが正常終了することを確認するまでは完了とみなしてはならない。

- **Biome (コード・定義検証)**: `pnpm run biome:check`
  - ソースコードおよび手動管理定義JSON（`brandgroups.json`, `categorygroups.json` 等）の構文・フォーマットエラーが0件であることを確認する。自動フォーマットを適用する場合は `pnpm run biome:fix` を使用すること。
- **Lint**: `pnpm run lint`
  - ESLintエラーが0件であることを確認する。
- **ビルド**: `pnpm run build`
  - TypeScriptのコンパイルエラーがないことを確認する。
- **テスト**: `pnpm test`
  - すべてのユニットテストおよびプロパティベースのテストがパスすることを確認する。
- **アーティファクトおよびリンク検証**: `uv run python scripts/validate_artifact.py <変更したJSONファイル...>`
  - 調査結果（JSONファイル）の新規作成や更新を行った際は、**修正した対象ファイルに対して必ず実行**すること。
  - 全ファイルを対象にすると数千件のURL検証で時間がかかるため、**変更した対象ファイル（または `git diff` で差分のあるファイル）のみを指定して実行**する。
  - JSON構造、非メートル法（不適切なインチ・ポンド表記等）の排除、採点根拠の整合性に加え、記述されているURLリンクの有効性（リンク切れ・Soft-404）が自動検証される。

### 3.2 テスト駆動開発 (TDD) の推奨

可能な限りTDDを採用すること。

1. **まずテストを書く**: `src/**/__tests__/` に期待される挙動を定義するテストケースを作成・更新する。
2. **実装・修正**: テストをパスさせるために必要な最小限のコードを書く。
3. **リファクタリング**: テスト成功を維持しながらコードを整理する。

### 3.3 テスト作成方針と実装詳細への密結合防止

テストはシステムの品質と安全なリファクタリングを保証するために不可欠であるが、実装詳細に過度に依存した壊れやすいテスト（fragile tests）は保守コストを増大させリファクタリングを阻害するため禁止する。

- **禁止事項（実装依存・文字列マッチングテスト）**:
  - HTMLテンプレート（`layouts/`）やクライアントJS（`static/js/`）を `fs.readFileSync` で読み込み、特定のクラス名、タグ属性、内部変数構文、あるいはキーワードが含まれているか（`toContain` 等）を検査するだけのテストは作成しないこと。
  - マークアップの微修正やCSSクラス名のリファクタリング、改行・インデントの変更で容易に失敗し、コードの振る舞い（Behavior）自体は検証できないため無駄なテストとなる。
- **推奨事項（振る舞いとビジネスロジックの検証）**:
  - テストは「ソースコードの記述文字列」ではなく、**「入力に対する出力」「公開API」「ビジネスロジックの振る舞い」** を検証すること。
  - TypeScriptの関数、クラス、モジュール、データ変換パイプライン、バリデーションロジックに対して単体テストおよびプロパティベーステストを作成する。
- **UI・デザインの検証アプローチ**:
  - 静的なHTML構造やデザイン、レスポンシブ配置、ファーストビューの確認は、文字列テストではなく `browser_subagent` や Playwright 等のブラウザ自動化ツールによる実画面レンダリング検証（目視・スクリーンショット）を活用すること。

### 3.4 動作確認のアプローチ（本番検証の活用）

ローカルサーバーの起動がポート衝突などで困難な場合、あるいはローカルのキャッシュダミーのためにUIテストデータの再現が難しい場合：

- **対応方針**:
  既にデプロイされている本番環境（例: `https://www.amazon-hikaku.com/bargain/`）のURLに対して、直接 `browser_subagent` や Playwright などのブラウザ自動化ツールを適用し、モバイルビューポート設定で不具合事象（見切れやズレ）の目視確認を行うと確実である。

### 3.5 コードレビュー方針

- **`data/` ディレクトリ配下**: レビュー対象外とする。自動生成ファイル（商品調査結果、キャッシュ、メタデータ）は、既存データとの整合性よりも「最新情報であること」を優先する。
- **ユーザーストーリー**: 根拠（レビューや記事等のエビデンス）が見つからないストーリーは安易に作成せず、必要に応じて削除すること。
- **価格の妥当性**: 異常な割引率（80%～90%等）の商品は、二重価格表示の可能性があるため推奨対象から除外すること。

---

## 4. 設計・実装規約

### 4.1 リポジトリ構造

- `/scripts/`: Creators APIとの直接的なやりとりやデータ収集・検証用のPythonスクリプト（`uv` 実行）。
- `/src/scripts/`: メインアプリケーション、自動化パイプライン、および保守・運用メンテナンス用 TypeScript CLIツール群（`pnpm` / `ts-node` 実行）。
  - `src/scripts/`: 本番パイプライン（記事生成、調査CLI、PRマージ等）
  - `src/scripts/maintenance/`: 保守・棚卸し・キャッシュ操作・監査ツール群
- `/data/`: 商品データや調査結果。一時ファイルはコミットしないこと。

### 4.2 UI/UX 実装（コンポーネントの同期と注意点）

商品の魅力を伝えるUIコンポーネントおよびカード要素は、以下の全箇所でDOM構造・クラス名・バッジデザイン（M3カラーバッジ `.m3-badge` 等）の整合性を必ず保つように実装すること。

| 場所 | 実装ファイル | 役割 |
|---|---|---|
| **商品詳細 (ヒーローカード)** | `layouts/partials/product-hero.html` | 記事冒頭のメインカード |
| **汎用・検索カード** | `layouts/partials/product-card.html` | 記事一覧・検索・共通カード部品 |
| **子カテゴリ一覧** | `layouts/_default/list.html` | 詳細・子カテゴリページのリスト項目 |
| **親カテゴリ一覧** | `layouts/_default/parent-category.html` | 親カテゴリページのリスト項目 |
| **ブランド一覧** | `layouts/_default/brand-list.html` | ブランド別ページのリスト項目 |
| **おすすめ一覧** | `layouts/recommendations/list.html` | 注目おすすめ商品のリスト項目 |
| **動的カードテンプレート** | `layouts/partials/product-card-template.html` | 動的生成用カードテンプレート正本（全ページ配信） |
| **動的フィルタカード** | `static/js/filter-common.js` | `/bargain/` や `/deals/` ページ等でテンプレートから動的生成されるカード |
| **お気に入りカード** | `layouts/favorites/list.html` | お気に入り保存済み商品のJS生成カード |
| **ホーム動的読み込み** | `static/js/home-load-more.js` | ホーム画面「もっと見る」で追加ロードされるカード |

> [!IMPORTANT]
> **商品カード修正時の注意点**:
> 1. **`<template>` 共通化アーキテクチャの維持**:
>    動的生成される商品カードは `layouts/partials/product-card-template.html`（`<template id="product-card-template">`）を正本（Single Source of Truth）とし、`static/js/filter-common.js` の `renderCardFromTemplate` 関数によってデータが注入される。
>    カードのマークアップやクラス名（例: `.card-score`, `.card-points`, `.meta-price-block`, `.meta-score-block`, M3バッジクラス `.m3-badge` 等）を修正する際は、Hugo静的テンプレート（`layouts/partials/product-card.html` 等）および `product-card-template.html` のスロット属性（`data-slot="..."`）を同期して更新すること。
> 2. **DOM構造の維持**:
>    価格・ポイントブロック（`.meta-price-block`）とスコアブロック（`.meta-score-block`）の二重ネスト構造を統一し、横並びや中央揃え（`align-items: center`）のCSSスタイルがどのページでも一貫して適用されるようにすること。

### 4.3 CSS・スタイル実装の注意点（モバイル表示でのはみ出し防止）

`select` 要素は、内包する `<option>` の中長文字列に合わせて固有幅（intrinsic size）を決定しようとするブラウザ固有の挙動を持つ。
このため、`flexbox` 親コンテナ（`display: flex`）の中で `flex: 1` や `min-width: 0` を指定しているだけでは、一部のモバイルブラウザやビューポート幅においてセレクトボックスが画面外にはみ出す（見切れる）現象が発生する。

- **解決策**:
  - セレクトボックスを定義するCSS（例: `.bargain-select`）には、必ず `width: 100%` および `max-width: 100%` を明示すること。
  - 親のflexコンテナ下で他の要素と横並びにする場合は、合わせて `min-width: 0`（または `flex: 1`）を付与して親の幅に縮小追従できるようにすること。

### 4.4 検索・フィルター機能改修時の注意点

検索・フィルターコントロールや表示UIを改修・拡張する際は、サイト全体で一貫した操作性とデザインを提供するため、以下の注意事項を必ず遵守すること。

- **全フィルター対象画面での整合性と同時同期**:
  本システムには「トップページ (`/`)」「あともう一品 (`/bargain/`)」「セール対象 (`/deals/`)」「親カテゴリ (`layouts/_default/parent-category.html`)」「子カテゴリ (`layouts/_default/list.html`)」「ブランド一覧 (`layouts/_default/brand-list.html`)」など複数箇所に検索・フィルターUIが存在する。
  パネル構造やM3デザイン、アクティブフィルターチップ（`renderActiveFilterChips`）の連動ロジックを変更する際は、全該当ページのHugoテンプレートおよび対応するクライアントJS（`filter-common.js`, `bargain-filter.js`, `deals-filter.js`, `category-features.js`, `search.js` 等）を漏れなく同時に更新・同期すること。
- **M3 アクティブフィルターチップの配置と解除連携**:
  フィルターパネルには適用中条件を動的表示するコンテナ（`<div id="...-active-chips" class="m3-active-chips-container">`）を必ず配置し、ユーザーがワンタップ（✕ボタン）で個別および一括クリアできるよう `renderActiveFilterChips` に適切な `onRemove` / `resetAll` ハンドラを登録すること。
- **入力要素のレスポンシブ・はみ出し防止**:
  セレクトボックスやテキスト入力領域、範囲指定スライダーは、どの画面幅でも見切れや画面外へのはみ出しが発生しないよう、`width: 100%`, `max-width: 100%`, `min-width: 0` のスタイル指定を統一維持すること。

---

## 5. データ管理とキャッシュ操作

### 5.1 カテゴリグループ管理

カテゴリを親グループに整理する際は、**`data/categorygroups.json` のみ編集する**こと。

- **文字数制限（14文字以内）**:
  UI表示（ドロップダウンメニュー、ナビゲーション、ホーム画面一覧等）での見切れやレイアウト崩れを防ぐため、**親カテゴリ名は必ず14文字以内に収める**こと（15文字以上は禁止）。複合ジャンルを並べる場合も14文字以内となるよう簡潔に命名する。
- **ソート順**: Unicodeコードポイント順（英数字 > ひらがな > カタカナ > 漢字）を維持すること。迷った場合は `pnpm run sort:categories` を実行すること。
- **新規追加・編集後の手順**: `pnpm run prebuild:hugo` を実行し、`data/categories.yml` 等が自動生成・更新されることを確認すること。

### 5.2 ブランドグループ管理（`data/brandgroups.json`）

ブランドの定義やマッチャーの編集・追加を行う際は、以下の注意事項を必ず遵守すること。

- **単語境界の活用（誤判定の防止）**:
  短いアルファベット表記のブランド（例: `LUX`, `CIO`, `LG`, `ASUS`, `KAI`, `PLUS`, `Kate`, `DEFINE`, `Dell` 等）を `matcher.value` に定義する際は、他社ブランド（例: `NIPLUX`, `Elgato`, `FRECIOUS`, `abrAsus`, `Vacplus` 等）に部分一致で誤ヒットすることを防止するため、必ず単語境界 `\b`（JSON内では `\\b`）を使用すること。
  - 例: `"value": "\\bLUX\\b|ラックス"` , `"value": "\\bLG\\b"` , `"value": "\\bASUS\\b|エイスース"`
- **親ブランドとサブブランドの区別**:
  `Amazon` と `Amazonベーシック` や `by Amazon` のように親ブランドとサブブランドで独立したページが存在する場合、親ブランドのマッチャーは `type: "brand"` かつ完全一致 `^Amazon$` 等で定義し、タイトルや `brand` フィールドにサブブランドが明記されている商品が誤判定・重複表示されないように留意すること。
- **編集後の手順**: `data/brandgroups.json` を変更した後は、必ず `pnpm run prebuild:hugo` を実行して `static/data/brandgroups.json` および `content/brand/` 配下のマークダウンページを自動同期すること。

### 5.3 キャッシュ管理ツール

キャッシュ操作時は自作スクリプトを作成せず、以下のツールを優先的に使用すること。

| スクリプト | 用途 | 使用例 |
|---|---|---|
| `src/scripts/maintenance/reset-cache-timestamp.ts` | ASIN単位のリセット | `pnpm ts-node src/scripts/maintenance/reset-cache-timestamp.ts B003AZZS4A` |
| `src/scripts/maintenance/reset-category-cache.ts` | カテゴリ単位のリセット | `pnpm ts-node src/scripts/maintenance/reset-category-cache.ts "カテゴリー名"` |

> [!NOTE]
> 使用例の詳細はスクリプトのヘルプ、またはソースコードを参照すること。

### 5.4 定義ファイルのフォーマットと整合性

手動で編集するカテゴリ定義（`data/categorygroups.json`）およびブランド定義（`data/brandgroups.json`）は、ネストが深く括弧の記述ミスが発生しやすい。
これらのファイルを編集した後は、必ず `pnpm run biome:check` を実行し、構文エラーがないことを検証すること。フォーマットの崩れは `pnpm run biome:fix` で自動整形できる。

---

## 6. 調査・生成ロジックとプロンプト管理

### 6.1 Creators API 調査ツールの利用

以下のスクリプトは編集せずに使用すること。

| スクリプト | 用途 | 出力先 |
|---|---|---|
| `scripts/creators_get_item.py` | 商品詳細取得 | `tmp/product_info.json` |
| `scripts/creators_search_items.py` | 競合商品検索 | `tmp/search_results.json` |

### 6.2 プロンプト管理（JulesInvestigator）

`src/jules/JulesInvestigator.ts` 等のプロンプトを編集する際は以下を遵守すること。

- **構文維持**: 巨大なテンプレートリテラルのバックティックや波括弧の対応を壊さないこと。
- **フレーズの維持**: プロパティテストでチェックされている特定の指示やキーワードを慎重に扱うこと。
- **変更後の検証**: `pnpm test src/jules/__tests__/JulesInvestigator.property.test.ts` を必ず実行すること。
