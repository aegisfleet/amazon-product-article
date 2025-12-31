# Scripts

このディレクトリにはAmazon PA-APIを使用した調査用スクリプトが含まれています。

## 共通の準備

### 必要な環境変数

```bash
AMAZON_ACCESS_KEY=your_access_key
AMAZON_SECRET_KEY=your_secret_key
AMAZON_PARTNER_TAG=your_partner_tag
```

### 依存関係

```bash
pip install requests
```

## paapi_get_item.py

Amazon Product Advertising API (PA-API) を使用して指定したASINの商品情報を取得するPythonスクリプトです。

### 使い方

```bash
python scripts/paapi_get_item.py <ASIN>
# 例: python scripts/paapi_get_item.py B06WRS9737
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

## paapi_search_items.py

Amazon PA-API を使用してキーワードで商品を検索するPythonスクリプトです。競合調査やASINの特定に使用します。

### 使い方

```bash
python scripts/paapi_search_items.py "<検索キーワード>"
# 例: python scripts/paapi_search_items.py "アテックス ルルド ふくらはぎゅ"
```

### 出力

成功すると、PA-APIからの生のレスポンスが `search_results.json` に保存されます。

## Julesでの使用

Julesで商品調査を行う際、これらのスクリプトを実行することで商品情報の取得や競合商品の検索が可能です。
環境変数を設定した上で実行してください。
