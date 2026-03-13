# Walkthrough

## 2026-03-13
- `static/js/search.js` に検索結果の再ランキング処理を追加。
  - Fuse.js の `result.score` を正規化し、テキスト一致スコアとして利用。
  - `item.score`（商品評価）、`item.price`/`item.price_value`（価格情報・価格帯一致）、`item.last_investigated`（鮮度）を加点。
  - クエリ長・語数に応じて重みを動的調整し、短いクエリではテキスト一致重視、長いクエリでは品質指標の比重を増加。
  - 再ランキング後に上位20件を表示する既存UIと統合。
- `layouts/index.json` に再ランキングで使う `price_value`（数値化価格）と `last_investigated` を追加出力。
