# キャッシュ & データアーキテクチャ仕様書

本ドキュメントでは、本システムにおける商品データキャッシュ（Amazon Creators API レスポンス）の内部構造、ライフサイクル、多重マウント設計、および運用・保守手順について解説する。

---

## 1. キャッシュシステムの概要

本プラットフォームは数千点を超えるAmazon商品記事を扱っており、Hugoの静的サイトビルドや記事生成のたびにAPIリクエストを行うと、APIレートリミット超過（429エラー）や極端なビルド遅延が発生する。
これを防ぐため、商品情報（タイトル、価格、画像、スペック、在庫、ポイント）はローカルキャッシュに永続化され、厳格なライフサイクルに基づいて管理されている。

### キャッシュの配置と役割

| ファイルパス | 容量目安 | 用途 |
|---|---|---|
| `data/cache/paapi-product-cache.json` | 約56MB | **本番用キャッシュ**。全商品のAPIレスポンスデータを保持。Git管理対象。 |
| `data/cache/paapi-product-cache.dev.json` | 数バイト（空） | **開発用ダミーキャッシュ**。ローカルサーバー起動時のメモリ削減と高速化用。 |

---

## 2. キャッシュエントリの構造とライフサイクル

キャッシュは `src/api/CreatorsAPICache.ts` によって制御され、各ASINごとに以下の形式で保存される。

```json
{
  "B003AZZS4A": {
    "data": {
      "asin": "B003AZZS4A",
      "title": "商品名",
      "price": { "amount": 2980, "currency": "JPY", "formatted": "¥2,980" },
      "images": { "primary": "https://...", "thumbnails": [] },
      "categoryInfo": { "main": "子カテゴリ名", "path": [] },
      "rating": { "average": 4.2, "count": 350 },
      "parentAsin": "B003AZZS4A"
    },
    "timestamp": 1700000000000,
    "status": "valid"
  }
}
```

### 2.1 ステータス種別と有効期限（TTL）

| ステータス (`status`) | 有効期限 (TTL) | 説明と遷移条件 |
|---|---|---|
| **`valid`** | **24時間** | Creators APIから正常に取得できたデータ。期限切れになると次回記事生成時に再取得される。 |
| **`invalid`** | **5分** | 一時的なネットワークエラーやタイムアウトによる失敗。早期リトライのため短期間で期限切れとなる。 |
| **`permanent_invalid`** | **7日間** | Amazon上で商品ページが削除された、またはCreators APIで恒久的に取得不能な商品。無駄なAPI呼び出しを防ぐため1週間再試行をブロックする。 |

> [!TIP]
> キャッシュファイルの肥大化を抑えるため、長大な商品説明文（`description`）や詳細な特徴リスト（`features`）は保存時に自動トリムされる設計となっている。

---

## 3. 本番とローカル開発の2層マウント設計

本番用のキャッシュ（約56MB）は数万行の巨大なJSONファイルであり、Hugoが開発サーバー起動時に読み込むとメモリ消費量が増大し、リロード速度が大幅に低下する。

そのため、開発サーバー起動時（`pnpm run server:dev`）は `hugo.dev.toml` を通じてキャッシュを切り替えている：

```toml
# hugo.dev.toml
[module]
  [[module.mounts]]
    source = "data/cache/paapi-product-cache.dev.json"
    target = "data/cache/paapi-product-cache.json"
```

- **開発サーバー（`server:dev`）**:
  - 空の `paapi-product-cache.dev.json` が本番キャッシュの代わりにマウントされる。
  - メモリ消費が大幅に抑制され、即時起動が可能となる。
  - （一部画像が `No Image` にフォールバックされるが、レイアウトやCSSの検証には影響しない）
- **本番ビルド（`deploy-articles.yml`）**:
  - 本番用キャッシュ `paapi-product-cache.json` がそのまま読み込まれ、全商品画像・最新価格が正常に出力される。

---

## 4. キャッシュのコミットとGit運用

GitHub Actions の `deploy-articles.yml` では、記事生成中に最新化されたキャッシュデータをGitへ自動コミット・プッシュする仕組みが備わっている。

1. **整合性チェック**:
   - `data/cache/paapi-product-cache.json` が壊れていないか `node -e "JSON.parse(...)"` で構文チェック。
2. **自動コミット & プッシュ**:
   - `.github/workflows/scripts/git-commit-push.sh` を使用し、`[skip ci]` タグを付与してリポジトリにプッシュする。
   - CIの無限ループを防止しつつ、最新のAPI取得成果を次回ビルドへ引き継ぐ。

---

## 5. キャッシュ管理・リセット手順

商品情報（カテゴリ、価格、画像）を強制的に再取得させたい場合は、専用のメンテナンススクリプトを実行してキャッシュのタイムスタンプをリセットする。

### 5.1 カテゴリ単位での一括リセット

カテゴリ正規化ロジックの修正後など、特定カテゴリに属する全商品のキャッシュをリセットする場合：

```bash
# 指定キーワード（大文字小文字区別なし、部分一致）を含む全商品のタイムスタンプを0にリセット
npx ts-node scripts/reset-category-cache.ts "イヤホン"
```

### 5.2 ASIN単位での個別リセット

特定商品のキャッシュのみをリセットする場合：

```bash
npx ts-node scripts/reset-cache-timestamp.ts B003AZZS4A
```

### 5.3 キャッシュステータス順ソート

キャッシュ内のエントリをステータス順（`valid` > `invalid` > `permanent_invalid`）に並べ替えて保守性を向上させる場合：

```bash
npx ts-node scripts/sort-cache-by-status.ts
```
