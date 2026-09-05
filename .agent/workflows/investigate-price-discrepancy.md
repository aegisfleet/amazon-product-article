---
description: 調査時価格と現在価格の乖離、またはAmazonセールによる価格乖離商品の調査・是正手順
---

# 価格乖離・調査時価格乖離商品の調査・是正ワークフロー

調査レポート作成時点の価格（`investigatedPrice`）と最新キャッシュの販売価格（`price`）の間に極端な差額が発生している商品（例: ふるさと納税返礼品から市販品への出品切替や相場急変など）、またはAmazon上で大幅なセール対象となっている商品を検出し、再調査を行う手順です。

## 1. 概要

- **主な発生要因**:
  1. **出品形態の変更（例: B06WRS9737）**:
     調査時点では自治体のふるさと納税返礼品（寄付金額11,500円）として出品されていたが、その後一般市販品（3,593円）として販売されるようになり、記事本文の前提（返礼品利用を前提としたレビュー）と販売価格が著しく乖離したケース。
  2. **Amazonセール・大幅値下げ**:
     タイムセールや特選セール等により、記事作成時より大幅に価格が下がり、コスパや競合優位性の再評価が必要になったケース。
  3. **終売・価格高騰・プレミア価格化**:
     生産終了や在庫僅少により、調査時の適正価格から倍以上の高値に跳ね上がったケース。
- **対象ファイル**:
  - `data/investigations/<ASIN>.json`（調査レポート・`investigatedPrice`）
  - `data/cache/paapi-product-cache.json`（最新キャッシュデータ・価格・セールバッジ）
  - `content/articles/<ASIN>.md`（公開記事）

---

## 2. 乖離商品の検出手順

### 2.1 ローカルでの抽出コマンド実行

```bash
# デフォルト条件（Amazon割引15%以上、または調査時価格乖離30%以上）で抽出
pnpm run investigate:price-discrepancy

# 環境変数を指定して極端な乖離（例: 調査時価格から50%以上の差額）のみ抽出
$env:INVESTIGATED_PRICE_DISCREPANCY_THRESHOLD="50"; pnpm run investigate:price-discrepancy
```

実行結果は `tmp/price_discrepancy_candidates.json` に出力されます。

### 2.2 抽出基準と優先順位

1. **優先順位 1 (最優先)**:
   調査時価格（`investigatedPrice`）と現在価格の乖離率（`investigatedPriceDiffRate`）が高い商品。
   ※ レビュー内容の前提が崩れているリスクが最も高いため最優先されます。
2. **優先順位 2**:
   最終調査日時が古い順。
3. **優先順位 3**:
   セールバッジが付与されている商品。
4. **優先順位 4**:
   Amazonの割引率（`savingsPercentage`）が高い順。

---

## 3. GitHub Actions による自動運用

本システムでは、以下のワークフローによって定期自動再調査が運用されています：

- **ワークフロー**: `.github/workflows/investigate-price-discrepancy.yml`
- **実行タイミング**: 毎日 08:00 JST (23:00 UTC 前日)
- **自動化フロー**:
  1. `findPriceDiscrepancy` により乖離商品（調査時価格乖離 & セール商品）を抽出
  2. Creators API（PA-API）から最新商品情報を取得
  3. Google Jules により最新価格・最新カタログ情報に基づいた再調査セッションを発行
  4. 完了後、PR が自動作成される
