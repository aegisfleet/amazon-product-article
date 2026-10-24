# SEO・インデックス管理方針

Google Search Console で「登録済み 1ページ / 未登録 8,710ページ」（2026-10-24時点、
内訳: 検出 - 未登録 5,908、クロール済み - 未登録 2,579）という状態への対策として、
インデックス対象の選別と巨大ページの軽量化を導入した際の設計記録。

一方で Bing 経由の流入と ChatGPT（ai-assistant）経由の流入は健全であり、
AI エージェント向け配信（llms.txt / 各種 JSON）は現行仕様を維持する。
Google 向けの選別が Bing / AI 経由を壊さないことを設計条件とする。

## 実施した対策

### 1. インデックス対象の選別（単一の判定ロジック）

判定は `layouts/partials/seo-indexable.html` に集約し、以下2箇所から参照する。

- `layouts/partials/head.html`: robots メタを `index, follow` / `noindex, follow` に切替
- `layouts/_default/sitemap.xml`: 対象外ページを sitemap に含めない

対象外とするページ:

| 対象 | 条件 | 理由 |
|---|---|---|
| カテゴリページ | 商品数が `params.seo.minCategoryProducts`（既定5）未満 | 商品1〜2点の薄い分類ページが約1,150件あり、サイト全体の品質評価を下げていた |
| カテゴリ一覧 `/categories/` | 常時 | 全タームのカード描画で約8.9MB に肥大化し、固有の検索意図も持たない |
| 全商品一覧 `/articles/` | 常時 | 全商品カードの描画で約55MB に肥大化し、検索導線と重複する |

対象外ページは削除せず軽量なリンク集（`layouts/partials/simple-index.html`）として残し、
内部リンク経路（カテゴリ／商品ページの発見可能性）は維持する。
商品ページ自体は noindex にしない（Bing / AI 経由の流入を維持するため）。

あわせて、head.html で計算されながら出力されていなかった
`<meta name="description">` を出力するよう修正した。

### 2. 特集ページのデータ外部 JSON 化

`/bargain/`（約11MB）、`/deals/`（約1.4MB）は、絞り込み用商品データ全件を
HTML 内に JSON 埋め込みしていた。これを Hugo の JSON 出力へ分離した。

- `content/{bargain,deals,low-scores}/_index.md` に `outputs: [HTML, JSON]` を追加
- データ構築は `layouts/partials/product-dataset.html` に共通化し、
  `layouts/{bargain,deals,low-scores}/list.json` から出力（`/bargain/index.json` 等）
- データ取得は `static/js/filter-common.js` の共通ヘルパー `loadProductDataset` に集約
  （各 `*-filter.js` の重複実装を排除。埋め込みが存在する場合は即時パースする後方互換付き）
- 取得失敗時は「結果なし」要素に読み込みエラーの文案を表示するフォールバックを実装
- `product-dataset.html` のフィールドは全てカード描画・検索・比較機能で使用中のため削減対象なし
  （2026-10-24 に使用状況を監査済み）。bargain の対象範囲もスライダー仕様
  （最低スコア 0〜100、上限価格 〜¥200,000 まで可変）と競合するため絞り込んでいない

HTML 本体は通常のページサイズに戻り、データ側はブラウザキャッシュや
AI エージェントからの直接取得（llms.txt にもエンドポイントを追記）が可能になる。

## 運用手順（デプロイ後）

1. Search Console で代表URL（トップ、親カテゴリ、商品数5以上のカテゴリ、商品ページ数件）を
   URL検査し、インデックス登録をリクエストする。全URLへのリクエストは行わない。
2. 2〜4週間、「クロール済み - インデックス未登録」「検出 - インデックス未登録」の
   件数推移と、登録済みページ数の増分を観測する。
3. 改善が見られたら、`params.seo.minCategoryProducts` の引き下げや
   優先商品の選別（スコア・需要ベースの sitemap 分割）を次段階として検討する。

## 既知の残課題（本対策の範囲外）

- カテゴリページ自体のサイズ（例: 商品124件のカテゴリで約830KB）。
  クライアントサイド絞り込みが DOM カード前提のため、描画上限の導入には
  絞り込み方式の変更が別途必要。
- 商品ページ全件（約7,200件）の登録は Google の品質判定次第であり、
  本対策は「登録されるべきページに評価を集中させる」ことが目的。
  全件登録を保証するものではない。
- Search Console の 404（48件）の個別精査。
