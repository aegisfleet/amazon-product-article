---
description: カテゴリが意図しないもの（その他など）になる場合の原因調査と修正手順
---

# カテゴリ調査・修正ワークフロー

商品カテゴリが正しく判定されない（例：「その他」になる、不適切なカテゴリが選ばれる）場合の調査と修正手順です。

## 1. 生データの取得
Creators APIから返される生のBrowseNode情報を確認します。
`scripts/debug_dump.py` を使用して、レスポンスをJSONファイルとして保存します（文字化け回避のため）。

```bash
# 仮想環境が有効であることを確認（必要に応じて）
# python -m venv venv
# .\venv\Scripts\Activate

python scripts/debug_dump.py <ASIN>
```
※ `<ASIN>` は調査対象のASINに置き換えてください。
実行すると `tmp/debug_output.json` に生成されます。

## 2. 正規化ロジックのテスト
現在の `CategoryNormalizer.ts` のロジックで、取得した生データがどのように処理されるかを確認します。

### 2.1 個別の BrowseNode の正規化確認
各ノードがどのような文字列に変換され、どのようなスコアが付与されるかを確認します。
`scripts/test_normalization.ts` は `tmp/debug_output.json` を読み込んでテストします。

```bash
npx ts-node scripts/test_normalization.ts
```

出力結果を確認し、意図したノードが除外（フィルタリング）されていないかを確認します。

### 2.2 最終的なカテゴリ選択のシミュレーション
複数の BrowseNode 候補の中から、最終的にどのノードが「カテゴリ」として選ばれるかのシミュレーションを行います。
これは `CreatorsAPIClient` が使用する優先順位付けロジックを含めたテストです。

```bash
npx ts-node scripts/test_asin_category.ts
```

`Final Selection` として出力される内容が、生成される記事のフロントマターに反映されます。
もし意図しないノードが選ばれている場合は、優先順位ロジック（深度や売上ランキング）、または正規表現によるフィルタリングを見直します。

## 3. ロジックの修正
必要に応じて `src/utils/CategoryNormalizer.ts` を修正します。
- `blockList`: 除外キーワードリスト
- `invalidPatterns`: 無効なパターン（正規表現）
- `normalize` メソッド: 優先順位付けロジック

修正後、再度ステップ2を実行して、意図通りの結果になるか確認します。

## 4. キャッシュの強制更新
修正が確認できたら、対象ASINのキャッシュを無効化（タイムスタンプをリセット）して、次回の生成時に最新のロジックが適用されるようにします。

`scripts/reset_cache_timestamp.ts` を実行して対象のASINを指定します。

```bash
npx ts-node scripts/reset_cache_timestamp.ts <ASIN>
```

## 5. 記事の再生成
記事を再生成して、反映を確認します。

```bash
npm run generate:articles
```

生成されたMarkdownファイル（`content/articles/<ASIN>.md`）の `categories` や `subcategory` を確認します。
