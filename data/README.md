# Data Directory

Amazon Product Research Systemが生成するデータを格納するディレクトリです。

## 概要

このディレクトリには、Google Julesによる商品調査の結果やシステムが生成する各種データがコミットされます。GitHub Actionsワークフローを通じて自動的に更新されます。

## ディレクトリ構造

```
data/
├── investigations/     # Jules調査結果（JSONファイル）
│   └── {ASIN}.json    # 商品ごとの調査データ
└── README.md
```

## ファイル形式

### 調査結果 (`investigations/{ASIN}.json`)

Julesが各商品について調査した結果を格納します：

- **positivePoints**: ユーザーレビューから抽出した良い点
- **negativePoints**: ユーザーレビューから抽出した気になる点
- **useCases**: 具体的な使用シーン
- **competitiveAnalysis**: 競合商品との比較
- **userStories**: ユーザー体験談
- **recommendation**: 購入推奨度と対象ユーザー
- **sources**: 情報源の参照先

## ワークフロー

1. **product-research.yml**: Jules APIを呼び出し、商品調査を実行
2. JulesがPRを作成し、調査結果を `data/investigations/` に保存
3. **pr-auto-merge.yml**: Jules PRを自動マージ
4. **deploy-articles.yml**: 調査結果から記事を生成し、GitHub Pagesにデプロイ