import json

with open('tmp/search_results.json', 'r') as f:
    data = json.load(f)

for item in data.get('searchResult', {}).get('items', data.get('items', [])):
    try:
        title = item['itemInfo']['title']['displayValue']
        price = item['offersV2']['listings'][0]['price']['money']['amount']
        asin = item['asin']
        print(f"{asin} | {price} | {title[:40]}")
    except Exception as e:
        pass
