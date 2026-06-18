import json
import subprocess
import os

categories = [
    "PC周辺機器",
    "食品",
    "日用品",
    "家電",
    "スポーツ",
    "スキンケア",
    "文房具",
    "ファッション",
    "Amazonデバイス",
    "ゲーム"
]

results = []

for cat in categories:
    print(f"Searching for {cat}...")
    subprocess.run(["uv", "run", "python", "scripts/creators_search_items.py", cat])

    with open("tmp/search_results.json", "r") as f:
        data = json.load(f)

    items = data.get("searchResult", {}).get("items", [])

    if not items:
        print(f"No items found for {cat}")
        continue

    for item in items[:2]:
        asin = item.get("asin")
        if asin:
            print(f"  Got ASIN {asin} for {cat}")
            results.append({"category": cat, "asin": asin})

with open("scratch/candidates.json", "w") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
