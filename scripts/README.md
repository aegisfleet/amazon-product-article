# スクリプト利用リファレンス

本リポジトリでは、言語と実行環境の明確な責務分離を行っている：
- `scripts/`: Amazon Creators API との直接通信、調査成果物（JSON）の品質検証を行う **Python スクリプト（uv 管理）**
- `src/scripts/maintenance/`: キャッシュ保守、取扱終了品（デッド商品）の棚卸し、スコア監査などを行う **TypeScript スクリプト（pnpm / tsx 管理）**

---

## 1. 共通の準備

### 1.1 必要な環境変数

```bash
AMAZON_CREATORS_APPLICATION_ID=your_app_id
AMAZON_CREATORS_CREDENTIAL_ID=your_credential_id
AMAZON_CREATORS_CREDENTIAL_SECRET=your_credential_secret
AMAZON_PARTNER_TAG=your_partner_tag
```

### 1.2 依存関係の同期

- **Python環境 (uv)**:
  安全なロックファイルに基づき仮想環境を同期する。
  ```bash
  uv sync
  ```
- **Node.js環境 (pnpm)**:
  ```bash
  pnpm install --frozen-lockfile
  ```

---

## 2. Python スクリプト（scripts/ 配下、uv 実行）

### 2.1 `validate_artifact.py`（成果物・リンク自動検証）

生成された調査JSONファイル（`data/investigations/*.json`）のスキーマ、単位系、およびURLリンクの有効性を自動検証する。

```bash
# 特定の調査ファイルを検証
uv run python scripts/validate_artifact.py data/investigations/<ASIN>.json

# 複数ファイルを指定
uv run python scripts/validate_artifact.py data/investigations/B000*.json
```

- **検証項目**:
  - 必須JSONスキーマ構造（Zod定義と整合）
  - 非メートル法表記（インチ、ポンド、オンス等）の完全排除
  - 記載された参照元URLリンクの有効性（リンク切れ、Soft-404の検出）

### 2.2 `creators_get_item.py`（ASIN商品詳細取得）

Amazon Creators API を使用して、指定したASINの商品情報を取得する。

```bash
uv run python scripts/creators_get_item.py <ASIN>
# 例: uv run python scripts/creators_get_item.py B003AZZS4A
```

- 成功時、カレントディレクトリに `product_info.json` が生成される。

### 2.3 `creators_search_items.py`（商品キーワード検索）

Creators API を使用してキーワードで商品を検索する。

```bash
uv run python scripts/creators_search_items.py "<検索キーワード>"
# 例: uv run python scripts/creators_search_items.py "完全ワイヤレスイヤホン"
```

- 成功時、生レスポンスが `search_results.json` に保存される。

### 2.4 `debug_dump.py`（生のBrowseNode情報ダンプ）

カテゴリ正規化ロジックのデバッグ用に、商品に紐づく生のカテゴリ階層（BrowseNodes）をダンプする。

```bash
uv run python scripts/debug_dump.py <ASIN>
```

- 結果は `tmp/debug_output.json` に出力される。

---

## 3. TypeScript 保守スクリプト（src/scripts/maintenance/ 配下、pnpm 実行）

### 3.1 `prune-dead-products.ts`（デッド商品の監査・削除）

Amazon上で販売終了となった商品、またはCreators APIで取得不能となったデッド商品を監査・棚卸しする。

```bash
# 取扱終了商品の監査（一覧表示のみ）
pnpm run audit:dead
# または: npx tsx src/scripts/maintenance/prune-dead-products.ts --audit

# 取扱終了商品の削除（記事・調査JSON・キャッシュの棚卸し）
pnpm run prune:dead
# または: npx tsx src/scripts/maintenance/prune-dead-products.ts --prune
```

### 3.2 `find-score-discrepancy.ts`（スコア乖離の検出）

同一商品・同一バリエーション（カラー・容量違い等）間で評価スコアに大きな開きが生じているケースを検出する。

```bash
pnpm run audit:score-discrepancy
# または: npx tsx src/scripts/maintenance/find-score-discrepancy.ts
```

### 3.3 `reset-category-cache.ts`（カテゴリキャッシュリセット）

カテゴリ正規化ルールの修正後などに、指定キーワードを含むカテゴリに属する全商品のキャッシュタイムスタンプをリセットする。

```bash
pnpm run reset:category-cache -- "リセット対象のカテゴリ名"
# または: npx tsx src/scripts/maintenance/reset-category-cache.ts "イヤホン"
```

### 3.4 `reset-cache-timestamp.ts`（ASIN個別キャッシュリセット）

特定商品のみキャッシュの有効期限を強制的に切らし、次回記事生成時に再取得させる。

```bash
pnpm run reset:cache-timestamp -- <ASIN>
# または: npx tsx src/scripts/maintenance/reset-cache-timestamp.ts <ASIN>
```

### 3.5 `sort-cache-by-status.ts`（キャッシュソート）

キャッシュファイル `data/cache/paapi-product-cache.json` のキーを、ステータス順（`valid` > `invalid` > `permanent_invalid`）に並べ替えて保存する。

```bash
npx tsx src/scripts/maintenance/sort-cache-by-status.ts
```
