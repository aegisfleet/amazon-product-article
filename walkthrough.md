# Walkthrough

## 2026-04-08
- `layouts/index.html` のヒーロー文面を、比較の速さと選びやすさを先に伝える構成へ変更。
- AI誤り可能性の注意喚起を削除せず、`details` 折りたたみ注記へ移動。
- ヒーロー下に主導線ボタン（高評価）と補助導線（検索・カテゴリ）を追加し、主導線を1つに整理。
- `static/css/style.css` にヒーロー注記/導線のスタイルを追加。
- `static/js/home-hero-entry-tracking.js` を新規作成し、ヒーロー導線のクリックを `home_entry_click` として `entry_type` 別に計測。
- `layouts/partials/footer.html` でホーム時に上記トラッキングスクリプトを読み込むよう変更。
