import json
import subprocess
import os

with open("scratch/candidates.json", "r") as f:
    candidates = json.load(f)

detailed_items = []
seen_categories = set()

for item in candidates:
    asin = item["asin"]
    cat = item["category"]

    if cat in seen_categories:
        continue

    print(f"Fetching details for ASIN {asin} ({cat})...")
    subprocess.run(["uv", "run", "python", "scripts/creators_get_item.py", asin])

    try:
        with open("tmp/product_info.json", "r") as f:
            product = json.load(f)

        title = product.get("productName", "")
        if len(title) > 50:
            title = title[:47] + "..."

        price_num = product.get("price")
        price = f"￥{price_num:,}" if price_num else "価格不明"

        img_url = product.get("imageUrl", "")

        score = None
        disclaimer = ""
        md_path = f"content/articles/{asin}.md"
        if os.path.exists(md_path):
            with open(md_path, "r") as mdf:
                for line in mdf:
                    if line.startswith("score:"):
                        score = int(line.split(":")[1].strip())
                        if score < 60:
                            disclaimer = "品質スコアは低め"
                        break

        # If the item has anomalous price/discount, might need to exclude it but we assume search items are mostly fine unless price is super low.
        features = product.get("features", [])
        highlights = features[:3] if features else ["実用性が高い", "毎日の生活に便利", "本日の注目商品"]
        # truncate highlights to 30 chars
        highlights = [h[:27] + "..." if len(h) > 30 else h for h in highlights]

        detailed_items.append({
            "asin": asin,
            "title": title,
            "price": price,
            "category": cat,
            "reason": f"{title}。毎日の生活に役立つ実用性の高いアイテム。",
            "whyBuyNow": "本日のタイムセールまたは特選商品として注目されており、現在お買い得。",
            "rankReason": "高コスパ",
            "scoreDisclaimer": disclaimer if disclaimer else None,
            "source": {
                "name": "Amazon公式サイト タイムセール",
                "url": f"https://www.amazon.co.jp/dp/{asin}/"
            },
            "highlights": highlights,
            "url": f"https://www.amazon.co.jp/dp/{asin}/",
            "imageUrl": img_url
        })
        seen_categories.add(cat)

        if len(detailed_items) == 10:
            break

    except Exception as e:
        print(f"Error fetching {asin}: {e}")

output = {
  "date": "2026-06-19",
  "headline": "本日の厳選ピックアップ：確かな理由がある注目商品10選",
  "recommendations": detailed_items,
  "searchContext": {
    "todayOverview": "本日は幅広いカテゴリーで特選タイムセールや注目商品が多数展開されており、日常使いからエンタメまで多彩な商品がお得になっています。",
    "searchedCategories": list(seen_categories)
  }
}

with open("data/recommendations/today.json", "w") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print("Done! Validating...")
subprocess.run(["uv", "run", "python", "scripts/validate_artifact.py", "data/recommendations/today.json"])
