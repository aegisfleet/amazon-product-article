# Amazon Product Research System

Amazon Creators API と Google Jules を活用した商品調査・レビュー記事の自動生成・公開システムである。

## 概要

本システムは、Amazon Creators APIを通じて商品データを取得し、Google Jules（AIエージェント）による徹底した調査レポートをもとに、詳細なレビュー記事を自動生成してGitHub Pagesで公開するWebプラットフォームである。

単なる個別記事の生成にとどまらず、カテゴリ階層分類、ブランド別一覧、セール対象（`/deals/`）、あともう一品（`/bargain/`）、低スコア・ワーストバイ調査（`/low-scores/`）、商品比較（Compare）、お気に入り（Favorites）など、購買意思決定を多角的にサポートする機能群を備えている。

## ディレクトリ構成

```text
./
├── scripts/                      # 調査・保守ユーティリティスクリプト（TypeScript/Python）
│   ├── creators_api_client.py   # Creators APIクライアント（Python）
│   ├── creators_get_item.py     # ASIN商品詳細取得
│   ├── creators_search_items.py # キーワード検索・競合調査
│   ├── validate_artifact.py     # 生成JSONのスキーマ・リンク・単位バリデータ
│   ├── prune-dead-products.ts   # 取扱終了商品の監査・削除スクリプト
│   ├── find-score-discrepancy.ts# バリエーション間スコア乖離の検出
│   └── reset-category-cache.ts  # カテゴリキャッシュリセット
├── src/                          # TypeScriptソースコード
│   ├── affiliate/               # アフィリエイトリンク生成
│   ├── analysis/                # 価格推移・スコア分析
│   ├── api/                     # Amazon Creators API クライアント (v1)
│   ├── article/                 # Hugo記事生成・フロントマター管理
│   │   ├── ArticleGenerator.ts       # Markdown記事生成
│   │   └── ArticleQualityManager.ts  # 品質検証・最適化
│   ├── category/                # カテゴリツリー管理・補強処理
│   ├── config/                  # 環境変数・設定管理
│   ├── github/                  # GitHub API / Octokit連携
│   ├── jules/                   # Google Jules API連携・プロンプト管理
│   ├── navigation/              # サイトナビゲーションデータ生成
│   ├── schemas/                 # Zodバリデーションスキーマ
│   ├── scripts/                 # CLIエントリポイント（各種自動化コマンド）
│   ├── search/                  # 検索インデックス生成・処理
│   ├── types/                   # TypeScript型定義
│   └── utils/                   # ユーティリティ（ロガー、レートリミッター等）
├── layouts/                      # Hugoテンプレート
│   ├── _default/                # 共通レイアウト（記事詳細、子・親カテゴリ一覧等）
│   ├── bargain/                 # あともう一品（/bargain/）
│   ├── brand/                   # ブランド別一覧（/brand/）
│   ├── deals/                   # セール対象一覧（/deals/）
│   ├── favorites/               # お気に入り一覧（/favorites/）
│   ├── low-scores/              # ワーストバイ一覧（/low-scores/）
│   ├── recommendations/         # 本日のおすすめ（/recommendations/）
│   ├── partials/                # 共通コンポーネント（商品カード、ヒーローカード等）
│   └── index.html               # トップページテンプレート
├── content/                      # 生成されたHugo記事（Markdown）
├── static/                       # 静的アセット（CSS、JavaScript、画像等）
│   ├── css/                     # スタイルシート（Material Design 3ベース）
│   └── js/                      # クライアントサイドJS（検索、フィルター、比較等）
├── data/                         # データソース・キャッシュ
│   ├── investigations/          # Jules調査結果データ（JSON）
│   ├── categorygroups.json      # 親カテゴリグループ定義（手動管理）
│   ├── brandgroups.json         # ブランドグループ・マッチャー定義（手動管理）
│   ├── categories.yml           # 自動生成カテゴリ階層
│   └── cache/                   # APIレスポンス・商品情報キャッシュ
├── .github/workflows/            # CI/CD・自動化ワークフロー
│   ├── product-research.yml     # 定期商品調査・Jules依頼
│   ├── pr-auto-merge.yml        # Jules PRの検証・自動マージ
│   ├── deploy-articles.yml      # 記事生成・Hugoビルド・Pagesデプロイ
│   ├── maintenance.yml          # 定期保守（デッド商品チェック等）
│   └── build-and-test.yml       # CIテスト・ビルド検証
├── config.toml                   # Hugo設定
├── hugo.dev.toml                 # 開発サーバー用Hugo最適化設定
├── package.json                  # Node.jsプロジェクト定義（pnpm）
├── pyproject.toml / uv.lock      # Python環境定義（uv）
├── tsconfig.json                 # TypeScript設定
├── biome.json                    # Biome設定
└── jest.config.js                # Jestテスト設定
```

## 詳細ドキュメント

システムの詳細な仕様・規約については、[docs/README.md](docs/README.md) および以下の個別仕様書を参照のこと。

| ドキュメント | 内容 |
|---|---|
| **[自動記事更新・生成システム](docs/article-automation-system.md)** | 調査からAIレビュー、PR自動マージ、記事生成、Pagesデプロイまでのパイプライン解説 |
| **[カテゴリ管理・整理システム](docs/category-management.md)** | 親カテゴリ命名規約（14文字以内）、Jules自動分類、正規化エンジン（CategoryNormalizer）仕様 |
| **[ブランド管理システム](docs/brand-management.md)** | ブランド定義マッチャー、単語境界（`\b`）誤判定防止規約、自動抽出とページ生成仕様 |
| **[キャッシュ & データアーキテクチャ](docs/cache-and-data-architecture.md)** | 本番（56MB）と開発用ダミーキャッシュの2層設計、TTL、ステータス遷移、リセット運用 |
| **[フロントエンド & UIアーキテクチャ](docs/frontend-architecture.md)** | HugoテンプレートとVanilla JSカード描画の同期規約、M3バッジ、検索・比較機能の仕様 |
| **[読者リクエスト処理システム](docs/user-requests-system.md)** | Google Forms / GAS / Issue連携による読者調査リクエストの受付と自動投入フロー |
| **[サイトデザイン設計ガイドライン](DESIGN.md)** | Material Design 3 (M3) トークン、タイポグラフィ、サーフェス階層、コントラスト規定 |
| **[スクリプト利用リファレンス](scripts/README.md)** | 調査・保守・バリデーション用 Python / TypeScript スクリプトのコマンド仕様 |

## 主要ファイルと責務

| ファイル / ディレクトリ | 説明 |
|---|---|
| `src/api/CreatorsAPIClient.ts` | Amazon Creators API v1 通信クライアント。商品情報取得、レートリミット制御、署名検証を担当 |
| `src/article/ArticleGenerator.ts` | 調査JSONデータからHugo用Markdown記事を生成。Front matter、スペック表、長所・短所を構成 |
| `src/jules/JulesInvestigator.ts` | Google Jules APIへの調査タスク投入とプロンプト構成を担当 |
| `data/categorygroups.json` | 親カテゴリと子カテゴリのマッピング定義。14文字以内の親カテゴリ名規約に準拠 |
| `data/brandgroups.json` | ブランド名マッチャー（正規表現）定義。単語境界（`\b`）によるブランド誤認防止を適用 |
| `scripts/validate_artifact.py` | 調査成果物JSONの整合性検証（非メートル法表記の排除、URLリンク有効性チェック、スキーマ検証） |
| `scripts/prune-dead-products.ts` | Amazon上で取扱終了となったデッド商品の検出およびコンテンツ棚卸し |
| `static/js/filter-common.js` | 一覧画面における動的フィルター、ソート、M3バッジカード描画の共通ロジック |

## コマンドリファレンス

### 依存関係と環境の準備

本プロジェクトでは、Node.jsに **pnpm**、Pythonに **uv** を使用する。

```bash
# Node.js依存関係のインストール（ロックファイル厳格適用）
pnpm install --frozen-lockfile

# Python仮想環境と依存関係の同期
uv sync
```

### 開発とビルド

```bash
# TypeScriptのコンパイル
pnpm run build

# アプリケーションのエントリポイント実行（開発用）
pnpm run dev

# ビルド成果物（dist/）のクリーンアップ
pnpm run clean
```

### テストと検証

```bash
# 全テスト実行
pnpm test

# テストのウォッチモード実行
pnpm run test:watch

# カバレッジレポート付きテスト実行
pnpm run test:coverage

# BiomeによるコードおよびJSONの検証
pnpm run biome:check

# Biomeによる自動フォーマット適用
pnpm run biome:fix

# ESLint静的解析
pnpm run lint

# ESLint自動修正
pnpm run lint:fix

# 調査JSONのバリデーション（uvを使用）
uv run python scripts/validate_artifact.py data/investigations/<ASIN>.json
```

### Hugo 開発サーバーと静的サイト生成

```bash
# 開発サーバー起動（推奨: 起動高速化・キャッシュ軽量化・GitInfo無効化適用）
pnpm run server:dev

# 高速リビルド用起動（FastRender無効、メモリ最適化）
pnpm run server:fast

# 通常のHugoサーバー起動
pnpm run server

# 静的サイトの本番ビルド（public/ ディレクトリへ出力）
hugo
```

開発用サーバー（`server:dev`）起動時は、ブラウザから [http://localhost:1313/](http://localhost:1313/) にアクセスして動作確認が可能である。

### 商品調査・記事生成 CLI

```bash
# キーワードによる商品検索
pnpm run search:products

# Jules調査依頼（標準）
pnpm run investigate

# 『本日』のおすすめ商品の調査・依頼
pnpm run investigate:recommendations

# バリエーション・価格乖離商品の調査依頼
pnpm run investigate:price-discrepancy

# 未カバーのセール対象商品の調査依頼
pnpm run investigate:uncovered-deals

# ユーザーリクエストに基づく調査依頼
pnpm run investigate:user-requests

# セール候補商品の抽出
pnpm run extract:sale-candidates

# 記事生成（全件または条件指定）
pnpm run generate:articles

# 特定ASINのみ指定して記事生成
pnpm run generate:articles -- --asin B0007TT7I0

# Creators API呼び出しをスキップして記事生成
pnpm run generate:articles -- --skip-creators-api

# Julesが作成したPRのマージ処理
pnpm run merge:pr
```

### データ保守・カテゴリ管理 CLI

```bash
# Hugoビルド前のカテゴリ階層補強処理（categories.yml等の自動生成）
pnpm run prebuild:hugo

# フロントマターのデータサニタイズ
pnpm run sanitize:frontmatter

# カテゴリの自動整理
pnpm run organize:categories

# カテゴリ定義のUnicodeコードポイント順ソート
pnpm run sort:categories

# 取扱終了（デッド）商品の監査
pnpm run audit:dead

# 取扱終了（デッド）商品の削除
pnpm run prune:dead

# バリエーション間スコア乖離の検出・監査
pnpm run audit:score-discrepancy
```

> [!TIP]
> カテゴリの階層構造、親カテゴリ命名規約（14文字以内）、Julesによる自動整理、正規化ロジックの修正手順については、[docs/category-management.md](docs/category-management.md) を参照のこと。

### Python 調査スクリプト（uv実行）

```bash
# ASINを指定して商品詳細を取得
uv run python scripts/creators_get_item.py <ASIN>

# キーワードで商品を検索
uv run python scripts/creators_search_items.py "<検索キーワード>"
```

## 環境変数

`.env.example` を複製して `.env` を作成し、必要なクレデンシャルを設定する。

| 変数名 | 必須 | 説明 |
|---|:---:|---|
| `AMAZON_CREATORS_APPLICATION_ID` | ○ | Amazon Creators API アプリケーションID |
| `AMAZON_CREATORS_CREDENTIAL_ID` | ○ | Amazon Creators API クレデンシャルID |
| `AMAZON_CREATORS_CREDENTIAL_SECRET` | ○ | Amazon Creators API クレデンシャルシークレット |
| `AMAZON_PARTNER_TAG` | ○ | Amazonアソシエイト・トラッキングID |
| `CREATORS_API_REQUESTS_PER_SECOND` | - | Creators API 秒間リクエスト上限（デフォルト: `0.8`） |
| `CREATORS_API_BURST_LIMIT` | - | Creators API バースト許容数（デフォルト: `5`） |
| `CREATORS_API_RETRY_DELAY` | - | リトライ初期待機ミリ秒（デフォルト: `1000`） |
| `CREATORS_API_MAX_RETRIES` | - | 最大リトライ回数（デフォルト: `5`） |
| `JULES_API_KEY` | ○ | Google Jules APIキー |
| `JULES_SOURCE` | ○ | Jules連携ソース名（例: `sources/github/owner/repo`） |
| `JULES_STARTING_BRANCH` | - | Jules作業ブランチ（デフォルト: `main`） |
| `GITHUB_TOKEN` | ○ | GitHub Personal Access Token |
| `GITHUB_REPOSITORY` | ○ | 対象リポジトリ（`owner/repo` 形式） |
| `GITHUB_BRANCH` | - | 対象ブランチ（デフォルト: `main`） |

> [!WARNING]
> Amazon Creators API の認証情報および API キーは最重要の機密情報である。コンソール出力、ログファイル、コミット履歴に含めてはならない。

## ワークフローの自動化サイクル

1. **商品選定と調査依頼** (`product-research.yml`, `investigate-*.yml`):
   - Creators API による検索やセール候補抽出、ユーザーリクエストから対象ASINを選定。
   - Google Jules に商品調査プロンプトを投入。
2. **AIによる調査レポート作成**:
   - Jules が商品情報取得スクリプト（`scripts/creators_get_item.py` 等）を活用し、客観的な事実・レビュー・競合比較を調査。
   - `data/investigations/{ASIN}.json` を追加する Pull Request を自動作成。
3. **PRの自動検証とマージ** (`pr-auto-merge.yml`):
   - スキーマ構造、リンク切れチェック、非メートル法検証（`validate_artifact.py`）を実施。
   - バリデーションを通過したPRを自動マージ。
4. **記事生成とデプロイ** (`deploy-articles.yml`):
   - `data/investigations/` の最新JSONからMarkdown記事を生成。
   - カテゴリ階層補強（`prebuild:hugo`）を経て Hugo による静的サイトをビルド。
   - GitHub Pages へ自動デプロイ。
5. **品質維持と定期保守** (`maintenance.yml`, `investigate-price-discrepancy.yml` 等):
   - デッド商品の棚卸しや価格・スコア乖離の検出を定期実行。

> [!TIP]
> 自動更新パイプラインの詳細仕様やアーキテクチャについては、[docs/article-automation-system.md](docs/article-automation-system.md) を参照のこと。

## 技術スタック

- **言語**: TypeScript, Python
- **パッケージマネージャー**: pnpm (Node.js), uv (Python)
- **静的サイトジェネレーター**: Hugo
- **デザインシステム**: Material Design 3 (M3) トークン、レスポンシブVanilla CSS
- **コード品質・フォーマッター**: Biome, ESLint
- **テストフレームワーク**: Jest, fast-check (プロパティベーステスト)
- **CI/CD**: GitHub Actions
- **ホスティング**: GitHub Pages

## キャラクター

![キャラクター](static/images/character.png)
