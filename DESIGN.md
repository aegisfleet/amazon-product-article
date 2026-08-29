# DESIGN.md - サイトデザイン設計・ガイドライン

Amazon商品徹底比較.com（[https://www.amazon-hikaku.com/](https://www.amazon-hikaku.com/)）のUI/UXおよびデザインシステム定義書です。  
本サイトは **Material Design 3 (M3)** の設計思想をベースとし、視覚的ノイズの低減、情報アクセシビリティの向上、および大量の商品比較データに対する快適なスキャン性の提供を目指します。

---

## 1. デザイン理念 (Design Principles)

1. **Clear Information Hierarchy (明瞭な情報階層)**
   - 4,000点を超える商品データの中から、ユーザーが価格・評価・主要スペックを短時間で比較・判断できるよう、視覚的優先度を厳格に管理します。
2. **Minimal Visual Noise (視覚的ノイズの最小化)**
   - 絵文字の過剰使用を避け、標準化されたM3アイコン（Material Symbols）とトナルカラーバッジを活用して洗練された統一感を実現します。
   - ※ 本ドキュメント内のUI例で表記している `[Icon: xxx]`（例: `[Icon: shopping_cart]`, `[Icon: trophy]`, `[Icon: favorite]`）は、Material Symbols のアイコントークンを示す視覚的プレースホルダーであり、実装ではSVGまたはMaterial Symbolsフォントを使用します。
3. **Accessibility & Consistency (アクセシビリティと一貫性)**
   - WCAG 2.1 AA規格に準拠したコントラスト比およびキーボード操作性を確保し、すべてのデバイスで読みやすく操作しやすいUIを提供します。

---

## 2. カラーシステム (Color System)

Material Design 3 のトナルカラーシステム（Tonal Color System）に準拠し、`static/css/variables.css` のCSS変数を用いてテーマ管理を行います。

### 2.1 カラーロールとCSS変数マッピング

| M3 カラーロール | CSS変数名 (Light / Dark) | 用途・適用コンポーネント | 対となるオンカラー変数 |
| :--- | :--- | :--- | :--- |
| **Primary** | `--md-sys-color-primary` | 主要ブランド色、プライマリCTAボタン | `--md-sys-color-on-primary` |
| **Primary Container** | `--md-sys-color-primary-container` | 評価スコア（例: 80点以上）の強調背景 | `--md-sys-color-on-primary-container` |
| **Secondary** | `--md-sys-color-secondary` | 補助ボタン、大サイズ見出し（大文字限定） | `--md-sys-color-on-secondary` |
| **Secondary Container** | `--md-sys-color-secondary-container` | フィルターチップ、件数バッジ | `--md-sys-color-on-secondary-container` |
| **Tertiary** | `--md-sys-color-tertiary` | アクセント要素、サブ強調（大文字限定） | `--md-sys-color-on-tertiary` |
| **Tertiary Container** | `--md-sys-color-tertiary-container` | 在庫・発送状況バッジ、プロモーションバッジ | `--md-sys-color-on-tertiary-container` |
| **Error** | `--md-sys-color-error` | エラーメッセージ、削除・危険アクション | `--md-sys-color-on-error` |
| **Error Container** | `--md-sys-color-error-container` | エラー通知バナー | `--md-sys-color-on-error-container` |
| **Warning (Custom)** | `--md-custom-color-warning` | AI注意書きバナー（カスタムセマンティック） | `--md-custom-color-on-warning` |
| **Warning Container** | `--md-custom-color-warning-container` | 注意喚起カード背景 | `--md-custom-color-on-warning-container` |

### 2.2 サーフェス階層 (Surface Container Roles)

従来のエレベーション（Surface 0〜5）を、M3のトナルサーフェスコンテナロールにマッピングします。

| M3 サーフェスロール | CSS変数名 | 用途 |
| :--- | :--- | :--- |
| **Surface** | `--md-sys-color-surface` | ページ全体基本背景 |
| **Surface Container Lowest** | `--md-sys-color-surface-container-lowest` | フラットな入力フォーム・最低強調コンテナ |
| **Surface Container Low** | `--md-sys-color-surface-container-low` | リスト背景、サイドバー |
| **Surface Container** | `--md-sys-color-surface-container` | 標準 Outlined / Elevated Card 背景 |
| **Surface Container High** | `--md-sys-color-surface-container-high` | モーダル、ドロップダウンメニュー、フッター背景 |
| **Surface Container Highest** | `--md-sys-color-surface-container-highest` | ホバー状態の背景、最高強調カード |
| **Surface Variant** | `--md-sys-color-surface-variant` | カード境界線、非アクティブバッジ |

### 2.3 コントラスト検証・運用規定 (WCAG 2.1 AA)

- **通常サイズテキスト (< 18pt / < 14pt bold)**:
  - 最小コントラスト比 **4.5:1** 以上を必須とします。
  - テキスト描画には必ず対となるオンカラー（例: `--md-sys-color-on-surface`, `--md-sys-color-on-primary`, `--md-sys-color-on-secondary-container`）を使用します。
- **大サイズテキスト (≥ 18pt / ≥ 14pt bold) およびUIコンポーネント**:
  - 最小コントラスト比 **3:1** 以上を適用します。
  - ライトテーマにおける `--md-sys-color-secondary`（コントラスト比 2.77:1）および `--md-sys-color-tertiary`（コントラスト比 3.19:1）の前景色としての直接テキスト利用は**大サイズテキスト（18pt以上）または非テキストUI枠線・グラフィックアイコン**に限定し、通常の小サイズ本文・ラベルには `--md-sys-color-on-secondary-container` / `--md-sys-color-on-tertiary-container` を使用します。

---

## 3. タイポグラフィ & スペーシング (Typography & Spacing)

### 3.1 M3 タイプスケール定義表

M3 タイプスケールに準拠し、CSS変数として共通管理します。フォントファミリーは標準でモダン・角ゴシック系フォントスタック（macOS/iOS: `"Hiragino Sans", "Hiragino Kaku Gothic ProN"`、Windows: `"Yu Gothic", "YuGothic", Meiryo`、Android: `system-ui, sans-serif`）を使用し、スマートフォン（ヒラギノ/Noto Sans）とPC（游ゴシック）で骨格や洗練されたモダンな雰囲気を完全に統一したタイポグラフィを提供します。

| タイプスタイル | CSS変数名 | font-size (Desktop / Mobile) | line-height | font-weight | letter-spacing | 用途・適用コンポーネント |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Large** | `--md-sys-typescale-display-large` | 3.5rem (56px) / 2.5rem (40px) | 1.15〜1.35 | 900 (JP) / 700 | -0.03em (-0.25px) | ヒーローメインキャッチ（日本語見出しには力強さを担保する900/Blackを適用） |
| **Headline Medium** | `--md-sys-typescale-headline-medium` | 1.875rem (30px) / 1.625rem (26px) | 1.25 | 600 | 0px | セクションタイトル（「本日の注目商品」等） |
| **Title Large** | `--md-sys-typescale-title-large` | 1.5rem (24px) / 1.375rem (22px) | 1.3 | 600 | 0px | 商品カードタイトル |
| **Title Medium** | `--md-sys-typescale-title-medium` | 1.125rem (18px) / 1.0625rem (17px) | 1.35 | 600 | 0.15px | フィルターパネル見出し、サブセクション名 |
| **Body Large** | `--md-sys-typescale-body-large` | 1.0625rem (17px) / 1.0rem (16px) | 1.6 | 400 | 0.5px | 本文、商品説明文、注意事項 |
| **Body Medium** | `--md-sys-typescale-body-medium` | 0.9375rem (15px) / 0.9375rem (15px) | 1.5 | 400 | 0.25px | 商品スペック（重量・サイズ・素材等） |
| **Label Large** | `--md-sys-typescale-label-large` | 0.9375rem (15px) / 0.9375rem (15px) | 1.45 | 600 | 0.1px | CTAボタンテキスト、検索フォーム入力値 |
| **Label Small** | `--md-sys-typescale-label-small` | 0.75rem (12px) / 0.75rem (12px) | 1.45 | 500 | 0.5px | 評価スコア・価格バッジ、フッター権利表記 |

※ レスポンシブ切り替え条件: モバイル表示は `@media (max-width: 768px)` 適用時。

### 3.2 スペーシング & タップターゲット (Spacing System & Touch Targets)

Web実装の正式な基準単位を CSS `px` および `rem`（1rem = 16px）とし、M3 の `dp` 単位とは `1dp = 1px`（標準密度）として対応付けます。

- **スペーシングスケール**:
  - `4px` (0.25rem / 4dp): 極小余白、バッジ内要素間隔
  - `8px` (0.5rem / 8dp): 小余白、チップ内アイコン・テキスト間隔
  - `12px` (0.75rem / 12dp): フォーム要素内パディング
  - `16px` (1.0rem / 16dp): 標準カード内パディング、グリッド間隔
  - `24px` (1.5rem / 24dp): カード間ギャップ、コンテナ間隔
  - `32px` (2.0rem / 32dp): セクション間マージン
  - `48px` (3.0rem / 48dp): ヒーローセクション上下パディング
- **最小タップターゲットサイズ (Interactive Touch Target)**:
  - モバイル・デスクトップ共通で、ボタン、チップ、リンク、入力フォーム等のすべてのインタラクティブ要素の最小タップターゲットエリアは **`48px × 48px` (3rem × 3rem)** を確保します。
  - 視覚的アイコンが `24px` の場合も、`padding` または透明なコンテナエリアを設定して `48px` 以上のタッチ領域を確保します。

---

## 4. コンポーネント設計 (Component Specifications)

### 4.1 ヒーローセクション & AI注意事項バナー
- **Hero Title**: `Display Large` スケールを適用し、`48px` の上下パディングを確保。
- **AI Disclaimer Banner**: ヒーロー本文から分離した **M3 Banner / Callout Card**。
  - アイコン `[Icon: info]`、`--md-custom-color-warning-container` 背景色、`--md-custom-color-on-warning-container` テキスト色を適用。

### 4.2 ブランド・カテゴリ選択 (Filter Chips)
- インライン重複一覧を廃止し、**M3 Filter Chips** に統一。
- アイコン `[Icon: label]` ＋ ブランド名 ＋ 件数バッジ（`Secondary Container`）構造。

### 4.3 検索・フィルターパネル (Search & Filter)
- キーワード検索、スコア範囲（Min/Max）、価格範囲（Min/Max）、カテゴリ選択を一体化された **M3 Filter Panel** として構成。
- 入力フォームには **M3 Outlined Text Field** を適用。
- アクティブな絞り込み条件は削除ボタン付き Filter Chip（`[Icon: close]`）として表示。

### 4.4 商品カード (Product Card)
- **M3 Elevated / Outlined Card** に準拠した4ブロック構造：
  1. **Header/Media**: サムネイル画像、商品名（`Title Large`）、カテゴリタグ
  2. **Body/Specs**: 主要スペック（`Body Medium`）の構造化表示
  3. **Badges**: 評価スコア（`[Icon: trophy] 84点`）、価格（`[Icon: payments] ￥9,900`）、ポイントをコンテナで配置
  4. **Actions**: カード下部に主要CTA (`[Icon: shopping_cart] Amazonで見る`) と補助アクション (`[Icon: favorite_border] お気に入り`) を配置
- **ミニカード (Pickup Card / 高評価おすすめ)**:
  - 省スペースで表示されるコンパクトなカードコンポーネント。
  - アクセシビリティ標準（WCAG 2.1 AA）と M3 Label Small タイプスケール規定に準拠し、価格表記 (`.pickup-card-price`) の文字サイズは **`0.75rem` (12px / モバイル)** 〜 **`0.8rem` (12.8px / デスクトップ)** 以上を保持すること。

### 4.5 フッター (Footer)
- M3 Surface Container Background と Divider（境界線）でコンテンツ本文との区切りを明確化。
- Amazonアソシエイト免責事項、著作権表記、最終更新日をグループ分けして整列配置。

### 4.6 アクションボタン体系 (Button Matrix & Styling)
サイト内のアクションボタンは目的と視覚的優先度に応じて以下の4系統に統一してスタイリングします。

1. **Tonal Button（内部主要導線・サイト内レビュー）**:
   - **用途**: 競合比較カードやおすすめリストからの自サイト内詳細記事への導線（`.btn-internal-small` 等）。外部モールボタンと競合させずに調和した主要リンク。
   - **通常時**: 背景 `var(--md-sys-color-primary-container)` / 文字 `var(--md-sys-color-on-primary-container)` / 枠線 `1px solid var(--md-sys-color-outline-variant)`
   - **ホバー時**: 背景 `var(--md-sys-color-primary)` / 文字 `var(--md-sys-color-on-primary)` / 枠線 `1px solid var(--md-sys-color-primary)`
   - **ダークテーマ**: 通常時背景 `#3730A3` / 文字 `#E0E7FF` / 枠線 `#475569`、ホバー時背景 `#818CF8` / 文字 `#1E1B4B`
2. **Primary Filled Button（最重要CTA）**:
   - **用途**: フォーム送信、最優先決定アクション。
   - **通常時**: 背景 `var(--md-sys-color-primary)` / 文字 `var(--md-sys-color-on-primary)`
   - **ホバー時**: 背景 `var(--color-primary-dark)` / 文字 `var(--md-sys-color-on-primary)`
3. **Outlined / Surface Button（補助操作・ユーティリティ）**:
   - **用途**: お気に入り追加（`.btn-favorite-card`）、商品比較追加（`.btn-compare-card`）、一覧内レビュー補助リンク。
   - **通常時**: 背景 `transparent` / 文字 `var(--color-text-main)` / 枠線 `1px solid var(--md-sys-color-outline)`
   - **ホバー時**: 背景 `var(--md-sys-color-surface-container-highest)` または状態別ハイライト
4. **ECモール専用ボタン**:
   - **用途**: Amazon、楽天市場、Yahoo!ショッピングへの外部リンク。
   - **スタイリング**: ユーザー認知向上のため、各モールの固有ブランドカラー（Amazon橙、楽天赤、Yahoo青）を専用保持。

---

## 5. レスポンシブ & アクセシビリティ受け入れ条件 (WCAG 2.1 AA Compliance)

Webサイト全体で WCAG 2.1 AA 適合を維持するため、以下の検証可能な条件を満たすこととします。

1. **キーボード操作とフォーカス表示 (2.1.1, 2.4.7)**
   - すべてのボタン、リンク、フォーム項目、チップは Tab キーおよび Shift+Tab キーで移動可能であり、Enter/Space キーで実行可能であること。
   - フォーカス時には、背景と 3:1 以上のコントラスト比を持つ視認可能なフォーカスリング（Focus Ring）を必ず表示すること (`outline: 3px solid var(--md-sys-color-primary)` 等）。
2. **コントロールの名前・役割・状態 (4.1.2)**
   - アイコンボタンや画像のみのコントロール（お気に入りボタン等）には、`aria-label` または `aria-labelledby` によるアクセシブルな名前を設定すること。
   - カスタムコントロールには適切な ARIA ロール（`role="button"`, `role="checkbox"` 等）および状態（`aria-expanded`, `aria-checked`）を定義すること。
3. **商品画像の代替テキスト (1.1.1)**
   - すべての商品サムネイル画像には、商品名を含む適切な `alt` 属性を設定すること。純粋な装飾画像には `alt=""` を明記すること。
4. **色だけに依存しない状態表示 (1.4.1)**
   - 在庫状況、セール対象、高評価などのステータス表示は、色だけでなくテキストまたは明確なアイコン形状を併用すること。
5. **フォームのラベル・説明・エラー識別 (3.3.1, 3.3.2)**
   - すべての検索・フィルター入力項目には視認可能な `<label>` または `aria-label` を紐付けること。
   - 入力エラー発生時には、エラーの存在と内容をテキストおよび `aria-live="polite"` で明確にユーザーへ通知すること。
6. **200% 文字拡大と 320 CSS px リフロー (1.4.4, 1.4.10)**
   - ブラウザの文字サイズ設定を 200% に拡大しても、テキストの重複や欠けが発生せず閲覧・操作可能であること。
   - 画面幅 320 CSS px (iPhone SE 相当) で表示した際に、データテーブル等の特別な要素を除き、横スクロールが発生しないリフローレイアウトを実現すること。
7. **非テキストコントラスト 3:1 以上 (1.4.11)**
   - ボタンの境界線、入力フォームのボーダー、フォーカスリング、グラフィックアイコンと隣接する背景色とのコントラスト比は 3:1 以上を確保すること。
8. **視覚的動きの軽減対応 (2.3.3 / AAA サポート方針)**
   - ユーザーが OS / ブラウザの「動きを減らす (prefers-reduced-motion: reduce)」を設定している場合、ホバーアニメーションやトランジション効果を自動的に無効化・簡略化するスタイルを適用すること。
