# Scripts

このディレクトリにはAmazon Creators APIを使用した調査用スクリプトが含まれています。

## 共通の準備

### 必要な環境変数

```bash
AMAZON_CREATORS_APPLICATION_ID=your_app_id
AMAZON_CREATORS_CREDENTIAL_ID=your_credential_id
AMAZON_CREATORS_CREDENTIAL_SECRET=your_credential_secret
AMAZON_PARTNER_TAG=your_partner_tag
```

### 依存関係

本リポジトリでは安全なパッケージ管理のために `uv` を使用します。依存関係をインストールするには以下を実行します：

```bash
uv sync
```

## creators_get_item.py

Amazon Creators API を使用して指定したASINの商品情報を取得するPythonスクリプトです。

### 使い方

`uv run` を使用し、ロックファイルに基づいた安全な仮想環境で起動します：

```bash
uv run python scripts/creators_get_item.py <ASIN>
# 例: uv run python scripts/creators_get_item.py B06WRS9737
```

### 出力

成功すると、以下の形式で `product_info.json` が生成されます：

```json
{
  "productName": "商品名",
  "brand": "ブランド名",
  "price": 価格,
  "imageUrl": "画像URL",
  "features": ["特徴1", "特徴2", ...]
}
```

## creators_search_items.py

Amazon Creators API を使用してキーワードで商品を検索するPythonスクリプトです。競合調査やASINの特定に使用します。

### 使い方

```bash
uv run python scripts/creators_search_items.py "<検索キーワード>"
# 例: uv run python scripts/creators_search_items.py "アテックス ルルド ふくらはぎゅ"
```

### 出力

成功すると、Creators APIからの生のレスポンスが `search_results.json` に保存されます。

## Julesでの使用

Julesで商品調査を行う際、これらのスクリプトを実行することで商品情報の取得や競合商品の検索が可能です。
環境変数を設定した上で実行してください。
