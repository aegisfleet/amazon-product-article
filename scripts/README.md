# Scripts

このディレクトリにはAmazon PA-APIを使用した調査用スクリプトが含まれています。

## paapi_get_item.py

Amazon Product Advertising API (PA-API) を使用して商品情報を取得するPythonスクリプトです。

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

### 使い方

```bash
python scripts/paapi_get_item.py
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

### カスタマイズ

- `ItemIds`: 取得したい商品のASINを配列で指定
- `Resources`: 取得したい情報のリソースを指定

### Julesでの使用

Julesで商品調査を行う際、このスクリプトを実行することで商品情報を取得できます。
環境変数を設定した上で実行してください。
