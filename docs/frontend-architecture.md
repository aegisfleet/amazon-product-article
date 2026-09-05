# フロントエンド & UIアーキテクチャ仕様書

本ドキュメントでは、本システムにおけるHugo静的レンダリングとクライアントサイドJavaScript（Vanilla JS + Web Worker）の協調設計、Material Design 3 (M3) トークン適用ルール、およびコンポーネント同期規約について解説する。

---

## 1. フロントエンド設計方針

本サイトは、静的サイトジェネレーター（Hugo）による**初期表示の高速性・SEO最適化**と、クライアントサイドJavaScriptによる**リッチで動的なユーザー体験（インタラクティブ性）**を両立するハイブリッドアーキテクチャを採用している。

### 1.1 主な特徴

- **ビルド時レンダリング**: 記事詳細ページ、カテゴリ一覧、トップページの初回表示分は Hugo が静的HTMLとして生成。
- **動的フィルタ・無限ロード**: セール一覧（`/deals/`）、あともう一品（`/bargain/`）、ワーストバイ（`/low-scores/`）、トップページの「もっと見る」等は クライアントサイドJS でJSONデータから動的描画。
- **高速バックグラウンド検索**: 検索ワーカー（`search-worker.js`）により、UIスレッドをブロックせずに数千件の商品インデックスを瞬時にインクリメンタル検索。
- **軽量・ノーフレームワーク**: React/Vue等の重量フレームワークは使わず、Vanilla JS と CSSカスタムプロパティ（CSS変数）により極限まで軽量化。

---

## 2. コンポーネントの同期規約（最重要）

本システムにおいて、商品カード（Product Card）は**Hugoテンプレート側**と**クライアントサイドJS側**の2箇所で生成される。
デザインやDOM構造を変更する際は、必ず両方を同時に更新しなければならない。

### 2.1 商品カードの実装箇所一覧

| 種別 | 実装ファイル | 生成タイミング |
|---|---|---|
| **商品詳細 (ヒーローカード)** | `layouts/partials/product-hero.html` | Hugo ビルド時 |
| **汎用商品カード** | `layouts/partials/product-card.html` | Hugo ビルド時 |
| **子カテゴリ一覧** | `layouts/_default/list.html` | Hugo ビルド時 |
| **親カテゴリ一覧** | `layouts/_default/parent-category.html` | Hugo ビルド時 |
| **ブランド一覧** | `layouts/_default/brand-list.html` | Hugo ビルド時 |
| **おすすめ一覧** | `layouts/recommendations/list.html` | Hugo ビルド時 |
| **動的フィルタカード** | `static/js/filter-common.js` (`renderCardMeta`) | クライアント側（`/deals/`, `/bargain/`等） |
| **お気に入りカード** | `layouts/favorites/list.html` (`favorites.js`) | クライアント側（ローカルストレージ参照） |
| **ホーム動的追加カード** | `static/js/home-load-more.js` | クライアント側（「もっと見る」押下時） |

### 2.2 カードDOM構造の二重ネスト統一

価格・ポイント表示とスコア表示は、以下のDOM構造とCSSクラス名を統一して維持する。

```html
<div class="card-meta-row">
  <!-- 価格ブロック -->
  <div class="meta-price-block">
    <span class="card-price">¥2,980</span>
    <span class="card-points">29pt (1%)</span>
  </div>
  <!-- スコアブロック -->
  <div class="meta-score-block">
    <span class="m3-badge m3-badge-score score-high">
      85点
    </span>
  </div>
</div>
```

- Hugoテンプレートと `filter-common.js` の `renderCardMeta` 関数で、この構造およびクラス名（`.card-score`, `.card-points`, `.meta-price-block`, `.meta-score-block`, `.m3-badge`）を完全に一致させる。

---

## 3. レスポンシブ & スタイル実装規約

### 3.1 モバイル表示でのセレクトボックス見切れ防止

`<select>` 要素は内包するテキストの長さに合わせて固有幅を決定しようとするブラウザ標準の挙動がある。
`flexbox` コンテナ配下で意図しない画面外へのはみ出しを防ぐため、以下のスタイルを必ず適用する：

```css
/* セレクトボックスの定義 */
.bargain-select,
.deals-select,
.filter-select {
  width: 100%;
  max-width: 100%;
  min-width: 0; /* 親コンテナの縮小に追従 */
}
```

### 3.2 Material Design 3 (M3) カラーバッジトークン

バッジやラベルには、`static/css/variables.css` で定義されたM3セマンティックカラークラスを使用する。

| バッジクラス | 用途 | 適用カラーロール |
|---|---|---|
| `.m3-badge-score.score-high` | 高評価（80点以上） | Primary Container / On-Primary Container |
| `.m3-badge-score.score-mid` | 中評価（60〜79点） | Secondary Container / On-Secondary Container |
| `.m3-badge-score.score-low` | 低評価（59点以下） | Surface Variant / On-Surface Variant |
| `.m3-badge-discount` | 割引率・セール情報 | Tertiary Container / On-Tertiary Container |
| `.m3-badge-stock` | 在庫・限定数 | Warning / Error Container |

---

## 4. 主なクライアントサイド機能とスクリプト一覧

| スクリプト | 役割 |
|---|---|
| `static/js/filter-common.js` | フィルタ・ソート・アクティブチップ描画、商品カード動的レンダリングの共通基盤 |
| `static/js/search-worker.js` | バックグラウンドで検索インデックスを高速走査するWeb Worker |
| `static/js/search.js` | リアルタイム検索モーダル・サジェスト・キーボードナビゲーション |
| `static/js/compare.js` | 複数商品を選択してスペック・価格・評価を横並び比較するモーダルUI |
| `static/js/favorites.js` | ローカルストレージを利用したお気に入り商品の保存・一覧表示 |
| `static/js/deals-filter.js` | セール対象商品（`/deals/`）の割引率・カテゴリ・価格絞り込み |
| `static/js/bargain-filter.js` | 「あともう一品」（`/bargain/`）の価格帯別（〜1000円等）動的フィルタ |
| `static/js/low-scores-filter.js` | 低スコア調査商品（`/low-scores/`）のフィルタリング |
| `static/js/home-load-more.js` | トップページの新着記事を非同期にインクリメンタルロード |
| `static/js/theme.js` | ライト／ダークテーマの切り替えと永続化（`localStorage`） |
| `static/js/category-dropdown.js` | ヘッダーナビゲーションの親カテゴリ・子カテゴリ2階層メニュー |
