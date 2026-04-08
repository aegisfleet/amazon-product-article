# Walkthrough

## 2026-04-08

- 一覧カードの比較軸を揃えるため、`layouts/partials/product-spec-tags.html` に `mode="comparison"` を追加し、`軽量 / 防水 / 長時間バッテリー` の2〜3件に正規化して出し分け可能にした。
- `layouts/index.html` の pickup-card で比較タグモードを利用し、タグが無い場合はタグ領域を非表示化した。
- pickup-card のタイトルを `truncate 24` に短縮し、タグと視覚競合しにくい密度へ調整した。
- `static/js/home-load-more.js` の動的pickup描画にも同じ比較タグ正規化ロジックを導入し、シャッフル後カードでもタグ表示ルールを統一した。
- `static/js/search.js` に検索結果用の比較タグ正規化を追加し、タイトル以外の比較軸としてタグを表示（タグ無し時は非表示）するよう変更した。
- pickup/search のカード要素に `data-has-comparison-tags` 属性を追加し、タグ有無別CTR比較が可能な計測フラグを追加した。
