import json
import os

ASINS_INFO = [
    {
        "asin": "B096F19ZC6",
        "category": "PC・周辺機器",
        "reason": "M1チップ搭載のMacBook Air整備済み品で、コストパフォーマンスに優れています。高いパフォーマンスと長寿命バッテリーを兼ね備えています。",
        "whyBuyNow": "新生活・新学期の準備に向けて、高性能なノートPCを通常より安価に入手できる絶好のタイミングです。",
        "source": {
            "name": "Amazon 整備済み品ストア",
            "url": "https://www.amazon.co.jp/b?node=10287132051"
        }
    },
    {
        "asin": "B09VGH8MZ1",
        "category": "食品・飲料",
        "reason": "サントリー「グリーンダカラ やさしい麦茶」の680ml大容量ペットボトル24本セット。ノンカフェインで飲みやすいです。",
        "whyBuyNow": "本日のAmazon特選タイムセール対象となっており、まとめ買いで更にお得になるまとめ売り実施中です。気温が上がり始める春からのストックに最適です。",
        "source": {
            "name": "Amazon 特選タイムセール",
            "url": "https://www.amazon.co.jp/gp/goldbox/"
        }
    },
    {
        "asin": "B08CD9QDP3",
        "category": "ファッション・衣類",
        "reason": "綿素材で柔らかく、締め付け感のない深めのレディースショーツ5枚セットです。通気性が良く快適な履き心地を提供します。",
        "whyBuyNow": "本日の特選タイムセールにラインナップされており、セット商品で大変お買い得になっています。衣替えの季節に合わせた買い替えにおすすめです。",
        "source": {
            "name": "Amazon 特選タイムセール",
            "url": "https://www.amazon.co.jp/gp/goldbox/"
        }
    },
    {
        "asin": "B08VS44PKP",
        "category": "キッチン家電",
        "reason": "ティファールのドリップ式コーヒーメーカー「メゾン」。0.6L（5杯分）のコンパクトサイズと2つの抽出モードを備えています。",
        "whyBuyNow": "春の新生活に向けて、キッチンを彩る新デザインの家電需要が高まっており、新居でのリラックスタイム充実に最適なアイテムです。",
        "source": {
            "name": "Amazon 新生活特集",
            "url": "https://www.amazon.co.jp/gp/goldbox/"
        }
    },
    {
        "asin": "B0G6YXL5RP",
        "category": "スマートウォッチ・ウェアラブル",
        "reason": "ChatGPT搭載、1.43インチAMOLEDディスプレイとサファイアガラスを採用した第3世代の最新スマートウォッチです。10日間のバッテリー持ちと多彩な機能を備えています。",
        "whyBuyNow": "2026年の最新・第3世代モデルとして登場。最新AI機能をいち早く体験したい方にうってつけの最新ガジェットです。",
        "source": {
            "name": "Amazon 最新スマートウォッチ特集",
            "url": "https://www.amazon.co.jp/s?k=2026+%E6%9C%80%E6%96%B0"
        }
    },
    {
        "asin": "B0GQD61437",
        "category": "バッグ・リュック",
        "reason": "PUレザー素材で防水・防盗設計の韓国風大容量バックパック。女子学生や旅行用に適したスタイリッシュなデザインです。",
        "whyBuyNow": "「春の新生活応援アイテム」として展開されている商品で、新学期や春の旅行シーズンに向けたバッグの買い替えにまさに今買うべきアイテムです。",
        "source": {
            "name": "Amazon 春 新生活",
            "url": "https://www.amazon.co.jp/s?k=%E6%98%A5+%E6%96%B0%E7%94%9F%E6%B4%BB"
        }
    },
    {
        "asin": "B0CN415PTV",
        "category": "エンターテイメント・家電",
        "reason": "AmazonのFire TV Stick 4K Select。4Kの高画質ストリーミングに対応し、様々な動画配信サービスを大画面で楽しめます。",
        "whyBuyNow": "新生活でテレビ環境を整える際に必須のアイテム。最新のストリーミングデバイスで自宅のエンタメ環境をすぐにアップグレードできます。",
        "source": {
            "name": "Amazonデバイス ストア",
            "url": "https://www.amazon.co.jp/Fire-TV-Stick-4K/dp/B0CN415PTV"
        }
    },
    {
        "asin": "B0G6JYKJVX",
        "category": "生活家電",
        "reason": "110Kpaの超強力吸引と最軽量クラスを両立したコードレス掃除機。LEDライトや液晶ディスプレイなど最新機能を搭載しています。",
        "whyBuyNow": "2026年の最新モデルとして「衝撃的デビュー」を果たした新製品です。新生活の引っ越しや春の大掃除に向けて、最新の掃除効率を手に入れるチャンスです。",
        "source": {
            "name": "Amazon ホーム＆キッチン",
            "url": "https://www.amazon.co.jp/s?k=%E6%8E%83%E9%99%A4%E6%A9%9F"
        }
    },
    {
        "asin": "B0DTKHNK9G",
        "category": "ホーム＆キッチン",
        "reason": "パナソニックの全自動コーヒーメーカー。ミル付き、沸騰浄水機能、さらにデカフェ豆コースも搭載した本格派です。",
        "whyBuyNow": "テレワークや自宅での時間が定着する中、より高品質なコーヒー体験を求めるトレンドに合致した最新多機能モデルです。",
        "source": {
            "name": "Amazon ホーム＆キッチン",
            "url": "https://www.amazon.co.jp/s?k=%E3%82%B3%E3%83%BC%E3%83%92%E3%83%BC%E3%83%A1%E3%83%BC%E3%82%AB%E3%83%BC"
        }
    },
    {
        "asin": "B0G2GG79KV",
        "category": "アウトドア・防災",
        "reason": "2000mAhの大容量電池を搭載し、高輝度・広角COB作業灯を備えた最新LED懐中電灯。10時間連続使用可能で防水・軽量設計です。",
        "whyBuyNow": "2026年最新進化版。春からのキャンプシーズン到来に加え、防災・避難対策グッズの見直しとして今すぐ備えておくべきアイテムです。",
        "source": {
            "name": "Amazon キャンプ 最新",
            "url": "https://www.amazon.co.jp/s?k=%E3%82%AD%E3%83%A3%E3%83%B3%E3%83%97+%E6%9C%80%E6%96%B0"
        }
    }
]

def format_price(price):
    if price is None:
        return "価格情報なし"
    return f"￥{price:,}"

def main():
    recommendations = []

    for item_meta in ASINS_INFO:
        asin = item_meta["asin"]
        json_path = f"tmp/{asin}.json"

        # Read the product details from the tmp json
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                product_data = json.load(f)

            # Extract features (highlights)
            features = product_data.get("features", [])
            highlights = features[:2] if features else []
            if len(highlights) == 0:
                highlights = [item_meta["reason"]]

            rec = {
                "asin": asin,
                "title": product_data.get("productName", ""),
                "price": format_price(product_data.get("price")),
                "category": item_meta["category"],
                "reason": item_meta["reason"],
                "whyBuyNow": item_meta["whyBuyNow"],
                "source": item_meta["source"],
                "highlights": highlights,
                "url": f"https://www.amazon.co.jp/dp/{asin}/",
                "imageUrl": product_data.get("imageUrl", "")
            }
            recommendations.append(rec)

    # Final structure
    output_data = {
        "date": "2026-03-18",
        "headline": "本日の厳選ピックアップ：確かな理由がある注目商品10選",
        "recommendations": recommendations,
        "searchContext": {
            "todayOverview": "2026年3月18日現在、春の新生活準備や衣替え、アウトドアシーズンの幕開けに向けたトレンドが活発です。本日はAmazon特選タイムセール対象商品や、2026年最新モデルとしてリリースされたばかりの最先端ガジェット、生活家電などから、明確な『今買うべき理由』を持つ10アイテムを厳選しました。",
            "searchedCategories": [
                "PC・周辺機器",
                "食品・飲料",
                "ファッション・衣類",
                "キッチン家電",
                "スマートウォッチ・ウェアラブル",
                "バッグ・リュック",
                "エンターテイメント・家電",
                "生活家電",
                "ホーム＆キッチン",
                "アウトドア・防災"
            ]
        }
    }

    with open("data/recommendations/today.json", "w", encoding="utf-8") as out_f:
        json.dump(output_data, out_f, indent=2, ensure_ascii=False)

    print("Generated data/recommendations/today.json successfully.")

if __name__ == "__main__":
    main()
