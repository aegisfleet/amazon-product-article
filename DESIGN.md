# DESIGN.md - サイトデザイン設計・ガイドライン

ポちのAmazon商品徹底比較.com（[https://www.amazon-hikaku.com/](https://www.amazon-hikaku.com/)）のUI/UXおよびデザインシステム定義書です。  
本サイトは **Material Design 3 (M3)** の設計思想をベースとし、視覚的ノイズの低減、情報アクセシビリティの向上、および大量の商品比較データに対する快適なスキャン性の提供を目指します。

---

## 1. デザイン理念 (Design Principles)

1. **Clear Information Hierarchy (明瞭な情報階層)**
   - 4,000点を超える商品データの中から、ユーザーが価格・評価・主要スペックを短時間で比較・判断できるよう、視覚的優先度を厳格に管理します。
2. **Minimal Visual Noise (視覚的ノイズの最小化)**
   - 絵文字の過剰使用を避け、標準化されたM3アイコンとトナルカラーバッジを活用して洗練された統一感を実現します。
3. **Accessibility & Consistency (アクセシビリティと一貫性)**
   - WCAG 2.1 AA規格に準拠したコントラスト比を確保し、すべてのデバイスで読みやすく操作しやすいUIを提供します。

---

## 2. カラーシステム (Color System)

Material 3 のトナルカラーシステム（Tonal Color System）に準拠します。

| 役割 | 用途 / トークン例 | 説明 |
| :--- | :--- | :--- |
| **Primary** | ブランド主要色・CTAボタン | `🛒 Amazonで見る` ボタン、アクティブ状態のコントロール |
| **Primary Container** | 評価・強調領域 | 🏆 高評価スコア（例: 80点以上）の背景バッジ |
| **Secondary** | 補助的要素 | カテゴリタグ、二次アクションボタン |
| **Secondary Container** | フィルターバッジ・チップ | ブランド・カテゴリの選択チップ、件数バッジ |
| **Tertiary / Warning** | セール・注意事項 | 🔥 セール対象表示、AI調査結果の注意事項バナー |
| **Surface 0〜5** | 背景・カード・フォーム | サーフェスの高度（Elevation）に応じた背景色定義 |
| **Outline** | 境界線・カード枠 | M3 Outlined Card、Outlined Text Field のボーダー |

---

## 3. タイポグラフィ & スペーシング (Typography & Spacing)

### 3.1 タイプスケール (Type Scale)
M3 タイプスケールに準拠し、CSS変数として管理します。

- **Display / Headline**: ヒーローセクションのキャッチコピー（「どれが良い？」がすぐわかる。）
- **Title Large / Medium**: 商品カードタイトル、セクション見出し（「本日の注目商品10選」等）
- **Body Large / Medium**: 商品説明文、主要スペック一覧
- **Label Large / Small**: 価格、ポイント、評価スコア、チップ内テキスト、フッター権利表記

### 3.2 8dp グリッドスペーシング (Spacing System)
すべての余白（Margin / Padding / Gap）は 8px の倍数を標準とします。

- `8px`: チップ内要素間隔、小アイコン余白
- `16px`: カード内パディング、フォーム要素間隔
- `24px`: カード間ギャップ、グリッドスペーシング
- `32px`: セクション間余白
- `48px`: ヒーローセクション上下パディング

---

## 4. コンポーネント設計 (Component Specifications)

### 4.1 ヒーローセクション & 注意事項バナー
- **Hero Title**: Headline スケールを適用し、十分な余白を確保。
- **AI Disclaimer Banner**: ヒーロー本文から独立した **M3 Banner / Callout Card** コンポーネント化。
  - 警告アイコンと `Warning Container` 背景色を適用し、キャッチコピーの視認性と注意書きの識別性を両立。

### 4.2 ブランド・カテゴリ選択 (Filter Chips)
- 従来のインライン重複一覧を全廃し、**M3 Filter Chips**（または検索付きドロップダウン）へ統一。
- 絵文字装飾を整理し、アイコン＋テキスト＋件数バッジ（`Secondary Container`）の構造に変更。

### 4.3 検索・フィルターパネル (Search & Filter)
- キーワード検索、スコア範囲（Min/Max）、価格範囲（Min/Max）、カテゴリ選択を一体化された **M3 Filter Panel** として構成。
- 入力フォームには **Outlined Text Field** を適用。
- アクティブな絞り込み条件はアイコン付き Filter Chip として表示し、ワンタップ解除を可能とする。

### 4.4 商品カード (Product Card)
- **M3 Elevated / Outlined Card** に準拠した4ブロック構造：
  1. **Header/Media**: サムネイル画像、商品名、カテゴリタグ
  2. **Body/Specs**: 主要スペック（重量・サイズ・容量等）の構造化表示
  3. **Badges**: 評価スコア（🏆 84点）、価格（💰 ￥9,900）、ポイントを視認しやすいコンテナで配置
  4. **Actions**: カード下部に主要CTA (`🛒 Amazonで見る`) と補助アクション (`🤍 お気に入り`) を配置

### 4.5 フッター (Footer)
- M3 Surface Container Background と Divider（境界線）でコンテンツ本文との区切りを明確化。
- Amazonアソシエイト免責事項、著作権表記、最終更新日をグループ分けして整列配置。

---

## 5. レスポンシブ & アクセシビリティ (Responsive & Accessibility)

- **Touch Targets**: モバイル表示時のボタン・チップ等のタップターゲットは最小 `48px × 48px` を確保。
- **Contrast**: テキストと背景のコントラスト比は 4.5:1 以上（大サイズテキストは 3:1 以上）を確保。
- **Dark Mode**: M3 Dark Theme カラーパレットと連動し、暗所環境での視認性をサポート。
