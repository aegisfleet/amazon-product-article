---
description: Amazon商品ページが存在しないデッド商品の調査・棚卸し（削除）手順
---

# デッド商品（Amazon 404）棚卸しワークフロー

Amazon上で出品終了や商品削除等によりページ（`https://www.amazon.co.jp/dp/<ASIN>`）が存在しなくなった商品（デッド商品）を検出し、サイトから安全に削除・棚卸しする手順です。

## 1. 概要

- **デッド商品の原因**:
  出品取り下げ、ASIN廃止、規約違反、カタログ統合等により、Amazonアクセス時に `HTTP 404`（「ページが見つかりません」）が返される状態。
- **404デッド商品と在庫切れ商品の違い**:
  - **404デッド商品（削除対象）**: Amazonの商品ページ自体が消滅しており、アクセス不能な状態。
  - **一時的な在庫切れ（要経過観察）**: Amazonページは存在する（HTTP 200）が、「現在在庫切れです」「価格情報なし」となっている状態。これらは入荷再開の可能性があるため、即時削除ではなく定期監視する。
  - **デジタル商品（Audible/Kindle等）**: 価格「￥0」で「すぐにダウンロード可能」となっている正規の無料体験・デジタルコンテンツ。
- **削除対象の関連ファイル**:
  1. `content/articles/<ASIN>.md`（記事ページ）
  2. `data/investigations/<ASIN>.json`（調査データ）
  3. `data/cache/paapi-product-cache.json`（APIキャッシュエントリ）
- **サイト整合性の再構築**:
  削除後に `pnpm run prebuild:hugo` を実行し、ブランド別ページやカテゴリ別リストを自動更新。

---

## 2. 調査・監査手順 (Audit)

### 2.1 高速監査（推奨・定期実行）
Creators APIで `permanent_invalid`（取得不可）となった記事（数十件）を対象に、Amazonページの実在性を確認します。

```bash
pnpm run audit:dead
# または
pnpm ts-node scripts/prune-dead-products.ts --audit
```

### 2.2 単一ASINの確認
特定のASINがデッド商品かどうかを確認します。

```bash
pnpm ts-node scripts/prune-dead-products.ts --asin <ASIN>
```

### 2.3 全記事スキャン（大規模棚卸し）
サイト内の全記事（5,800+件）を対象にスキャンを実施します。

```bash
pnpm ts-node scripts/prune-dead-products.ts --scope all --audit
```

---

## 3. 棚卸し（削除）手順 (Prune)

### 3.1 ドライラン（事前確認）
実際に削除を行わずに、削除対象のファイル一覧とサマリーを確認します。

```bash
pnpm ts-node scripts/prune-dead-products.ts --prune --dry-run
```

### 3.2 削除の実行
デッド商品の記事・調査データ・キャッシュを一括削除し、サイトインデックス（`prebuild:hugo`）を再生成します。

```bash
pnpm run prune:dead
# または
pnpm ts-node scripts/prune-dead-products.ts --prune
```

### 3.3 特定ASINを個別に削除する場合
```bash
pnpm ts-node scripts/prune-dead-products.ts --asin <ASIN> --prune
```

---

## 4. 検証手順 (Verification)

棚卸し作業完了後は、以下の検証コマンドが全て正常終了することを確認します。

```bash
# 1. 構文・定義の検証
pnpm run biome:check

# 2. TypeScriptコンパイル
pnpm run build

# 3. ユニットテスト
pnpm test
```

