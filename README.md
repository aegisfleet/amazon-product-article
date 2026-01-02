# Amazon Product Research System

Amazon PA-API v5とGoogle Julesを活用した商品調査記事の自動生成・公開システム

## 概要

このプロジェクトは、Amazon商品の詳細情報を取得し、Google Julesによる調査レポートを基に記事を自動生成してGitHub Pagesで公開するシステムです。

## ディレクトリ構成

```
amazon-product-article/
├── scripts/                  # 調査用スクリプト（Python）
│   ├── paapi_get_item.py     # 商品詳細取得
│   └── paapi_search_items.py # 商品検索
├── src/                      # TypeScriptソースコード
│   ├── api/                  # Amazon PA-API クライアント
│   │   └── PAAPIClient.ts    # PA-API v5 通信処理
│   ├── article/              # 記事生成モジュール
│   │   ├── ArticleGenerator.ts       # Hugo記事生成
│   │   └── ArticleQualityManager.ts  # 記事品質管理
│   ├── scripts/              # CLIエントリポイント（TypeScript）
│   │   ├── product-search-cli.ts     # 商品検索
│   │   ├── jules-investigation-cli.ts # Jules調査依頼
│   │   ├── article-generation-cli.ts # 記事生成
│   │   └── pr-merge-cli.ts           # PRマージ処理
│   ├── types/                # TypeScript型定義
│   ├── config/               # 設定管理
│   ├── github/               # GitHub API連携
│   ├── jules/                # Jules API連携
│   └── utils/                # ユーティリティ
├── layouts/                  # Hugoテンプレート
│   ├── _default/             # デフォルトレイアウト
│   ├── partials/             # 共通パーツ
│   └── index.html            # トップページ
├── content/                  # Hugo記事コンテンツ（生成）
├── static/                   # 静的ファイル（画像、CSS等）
│   └── js/
│       └── category-dropdown.js  # カテゴリドロップダウン（※1）
├── data/                     # データファイル
│   ├── investigations/       # Jules調査結果（JSON）
│   └── categorygroups.json   # カテゴリグループ定義（※1）
├── .github/workflows/        # GitHub Actions
│   ├── build-and-test.yml    # ビルド・テスト
│   ├── product-research.yml  # 商品調査ワークフロー
│   ├── pr-auto-merge.yml     # PR自動マージ
│   └── deploy-articles.yml   # GitHub Pagesデプロイ
├── config.toml               # Hugo設定
├── package.json              # npm設定
├── tsconfig.json             # TypeScript設定
└── jest.config.js            # Jest設定

※1: category-dropdown.js と categorygroups.json は同期必須
```

## 主要ファイル

| ファイル | 説明 |
|---------|------|
| `src/api/PAAPIClient.ts` | Amazon PA-API v5との通信を担当。商品情報取得、カテゴリ抽出、アフィリエイトリンク生成 |
| `src/article/ArticleGenerator.ts` | 調査データからHugo記事（Markdown）を生成。Front matterと本文構成を担当 |
| `src/article/ArticleQualityManager.ts` | 記事の品質チェックと最適化 |
| `src/scripts/*.ts` | CLIエントリポイント。npm scriptsから呼び出される |
| `config.toml` | Hugoの設定（サイトURL、言語、パーマリンク等） |
| `data/investigations/{ASIN}.json` | 各商品のJules調査結果データ |
| `data/categorygroups.json` | カテゴリの親グループ定義（⚠️ 下記と同期必須） |
| `static/js/category-dropdown.js` | フロントエンドのカテゴリドロップダウン（⚠️ 上記と同期必須）|

> **⚠️ 注意**: `data/categorygroups.json` と `static/js/category-dropdown.js` は同一のカテゴリグループ定義を維持する必要があります。片方を更新する際は必ず両方を更新してください。詳細は `AGENTS.md` を参照。

## コマンド

### 開発

```bash
# 依存関係インストール
npm install

# TypeScriptビルド
npm run build

# 開発モードで実行
npm run dev
```

### テスト

```bash
# テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジ付きテスト
npm run test:coverage
```

### Lint

```bash
# Lint実行
npm run lint

# Lint自動修正
npm run lint:fix
```

### CLI操作

```bash
# 商品検索
npm run search:products

# Jules調査依頼
npm run investigate

# 記事生成
npm run generate:articles

# PRマージ
npm run merge:pr
```

### Hugo（静的サイト生成）

```bash
# 開発サーバー起動
hugo server -D

# 静的サイトビルド
hugo
```

## 環境変数

`.env.example` を `.env` にコピーして設定：

| 変数名 | 説明 |
|-------|------|
| `AMAZON_ACCESS_KEY` | Amazon PA-API アクセスキー |
| `AMAZON_SECRET_KEY` | Amazon PA-API シークレットキー |
| `AMAZON_PARTNER_TAG` | Amazonアソシエイトタグ |
| `JULES_API_KEY` | Google Jules APIキー |
| `JULES_SOURCE` | Jules ソース名（例: sources/github/owner/repo） |
| `GITHUB_TOKEN` | GitHub API トークン |
| `GITHUB_REPOSITORY` | リポジトリ（owner/repo形式） |

## ワークフロー

1. **product-research.yml**: 商品を検索し、Jules APIで調査を依頼
2. **JulesがPR作成**: 調査結果を `data/investigations/` に保存するPRを作成
3. **pr-auto-merge.yml**: Jules PRを自動マージ
4. **deploy-articles.yml**: 調査結果から記事を生成し、GitHub Pagesにデプロイ

## 技術スタック

- **言語**: TypeScript
- **ランタイム**: Node.js
- **静的サイト生成**: Hugo
- **テスト**: Jest
- **Lint**: ESLint
- **CI/CD**: GitHub Actions
- **ホスティング**: GitHub Pages