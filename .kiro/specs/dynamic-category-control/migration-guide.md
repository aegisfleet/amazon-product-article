# 移行ガイド: 動的カテゴリ制御

本ガイドは、従来のカテゴリ管理方式から「動的カテゴリ制御機能」への移行手順を説明します。

## 概要

これまで、親カテゴリページの表示には以下の2つの作業が必要でした。
1. `data/categorygroups.json` へのカテゴリグループの追加
2. `content/parent-category/{slug}.md` の手動作成

新しいアーキテクチャでは、`prebuild:hugo` スクリプトによるデータの動的生成処理が導入され、**2番目の手順（Markdownファイルの手動作成）が不要**になりました。

## 段階的な移行手順

本プロジェクトは既に必要なスクリプトの追加・更新が完了しており、コードレベルの移行は完了しています。

### 新しく親カテゴリを追加する場合

1. `data/categorygroups.json` のみを編集します。
2. ローカルサーバーを起動するか（`npm run prebuild:hugo` または `npm run prebuild:hugo && hugo server`）、GitHubにPushするだけで完了です。

### 既存のMarkdownファイルのクリーンアップ（推奨）

過去に手動で作成した `content/parent-category/*.md` は、安全に削除することができます。
（新しい仕組みでは、`data/categorygroups.json` を参照して Hugo 側で動的にリストページがレンダリングされるためです。URLは `categories/...` ではなく、設定された `parent-category/{slug}` が維持されます）。
もし現在 `content/parent-category/` 内に既存のファイルがある場合、削除をおすすめします。

## 新機能の活用方法

`data/categorygroups.json` にて以下の新しいプロパティが使用可能になりました。

- **visible**: `false` に設定すると、手動で該当の親カテゴリを強制的に非表示にできます。
- **priority**: ドロップダウンメニューや一覧での表示順位を指定できます（デフォルトは999で、数値が小さいほど上位に表示されます）。

例:
```json
{
  "categoryGroups": [
    {
      "name": "スマートフォン",
      "slug": "smartphone",
      "visible": true,
      "priority": 1,
      "children": [
        "iPhone", "Android"
      ]
    }
  ]
}
```
※既存の `{ "スマートフォン": { "slug": "smartphone", "categories": [...] } }` という旧フォーマットも後方互換性により引き続きサポートされますが、細かい制御を行いたい場合は新フォーマットに書き換えることを推奨します。

## ロールバック手順

万が一、動的カテゴリ制御機能で問題が発生した場合は、以下の手順で以前の挙動に戻すことができます。

1. `package.json` の `prebuild:hugo` スクリプトを以前のコピーのみのスクリプトに戻す。
2. Hugo テンプレート (`layouts/_default/parent-category.html`, `layouts/_default/single.html`) の変更を `git revert` などで取り消す。
3. `static/js/category-dropdown.js` の変更を取り消す。

## トラブルシューティング

**Q. 新しく追加したカテゴリがドロップダウンや画面に表示されません**
A. 商品数が「0個」のカテゴリは、フロントエンドおよび Hugo システム側で自動的に非表示になります。該当のカテゴリが設定された記事が存在するかご確認ください。

**Q. hugo ビルド時にエラーが発生する**
A. `npm run prebuild:hugo` が正しく実行され、カテゴリデータの抽出が完了しているか確認してください。
