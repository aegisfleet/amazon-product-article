import json

with open('data/investigations/B0DZ8LXH2K.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Fix sources crossCheck
data['analysis']['sources'].append({
    "id": "src-2",
    "name": "Apple公式サイト: iPad Air (M3)",
    "url": "https://www.apple.com/jp/ipad-air/",
    "tier": "high",
    "evidenceType": "primary",
    "publishedAt": "2025-03-12",
    "author": "Apple",
    "conflictOfInterest": "possible",
    "notes": "M3チップの性能に関する公式スペックを確認。"
})
data['analysis']['claims'][0]['supportingSourceIds'].append("src-2")

# Fix scoreRationale
data['analysis']['recommendation']['scoreRationale'] = """[基本点: 70]
[加点: +5] (M3チップ搭載による非常に高い基本性能を備えているため)
[加点: +5] (上位のProモデルより安価でありながら、多くのユーザーにとって十分すぎる性能を提供する優れたコストパフォーマンス)
[加点: +4] (約460gという薄型軽量設計で、日常的な持ち運びにおいて高い実用性とデザイン性を誇るため)
[加点: +5] (Apple Pencil Pro対応やステージマネージャなどの機能をサポートし、幅広いユースケースに応える高い汎用性)
[加点: +3] (Apple Intelligence機能などの将来のアップデートに対応できるため)
[加点: +2] (Wi-Fi 6E対応による高速かつ安定した通信が可能なため)
[加点: +1] (P3広色域ディスプレイによる鮮やかな画面表示が可能なため)
[減点: -5] (リフレッシュレートが60Hzにとどまり、画面の滑らかさにおいて上位モデルとの明確な差があるため)
[合計: 90]"""

with open('data/investigations/B0DZ8LXH2K.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
