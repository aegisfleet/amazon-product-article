import json

with open("data/investigations/B0DY7MR1S9.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# Fixing the dimensions issue (removing 0mm to "不明" or removing the keys)
data["analysis"]["technicalSpecs"]["dimensions"] = {
    "thickness": "3mm"
}

# Adding more competitors to reach at least 6
new_competitors = [
    {
        "name": "SYNCWIRE Syncwire MagSafe リング (チタンブルー) (SW-RH992)",
        "asin": "B0CNV891W3",
        "priceComparison": "Andobilの方がやや高価格。SYNCWIREは軽量(26.3g)でチタンカラーなどデザインバリエーションが豊富だが、Andobilは牛革素材の採用と耐荷重4kgという強力な仕様によりハイエンド向けとして価格差に妥当性がある。",
        "featureComparison": [
          "共通点：両面マグネット機能を搭載し、360度回転が可能。iPhoneのMagSafeに対応する。",
          "相違点：Andobilが牛革素材を採用し耐荷重4kgであるのに対し、SYNCWIREはアルミ合金製で重量26.3gと軽量設計になっている。"
        ],
        "differentiators": [
          "Andobil 高級牛革製 MagStand Proの利点：牛革による高級感と、より重い端末でも安心な4kgの強力な磁力を求める場合に適している。",
          "SYNCWIRE Syncwire MagSafe リングの利点：チタンブルーなど本体色に合わせたカラーリングを好む場合や、より軽量なリングを求める場合に適している。"
        ]
    },
    {
        "name": "SYNCWIRE Syncwire MagSafe リング (ナチュラルチタニウム) (SW-RH991)",
        "asin": "B0CP4VG648",
        "priceComparison": "Andobilの方がやや高価格。基本機能はSYNCWIREも優れているが、Andobilは最高級牛革というプレミアム素材を使用しているため、その分の価格差が生じている。",
        "featureComparison": [
          "共通点：両面マグネット機能、360度回転、MagSafe対応といった主要機能は共通している。",
          "相違点：素材が異なり、Andobilが牛革と金属の組み合わせであるのに対し、SYNCWIREは金属のみ（ナチュラルチタニウムカラー）である。"
        ],
        "differentiators": [
          "Andobil 高級牛革製 MagStand Proの利点：金属だけでなく、革の温かみや独特の質感を求めるユーザーに適している。",
          "SYNCWIRE Syncwire MagSafe リングの利点：iPhone 15/16 Proシリーズのチタニウムカラーと統一感を出したい場合に適している。"
        ]
    },
    {
        "name": "Andobil スマホリング MagRing Pro (MagRing Pro-Black)",
        "asin": "B0BXKHCCFC",
        "priceComparison": "Andobil MagStand Pro（本商品）の方がやや高価格。同ブランドの製品であり、本商品は「牛革素材」を採用した上位モデルであるため、その素材コストが価格に反映されている。",
        "featureComparison": [
          "共通点：同ブランドであり、両面マグネット機能、ダンパーヒンジ技術による高い耐久性を備える。",
          "相違点：本商品は「牛革素材」を使用し耐荷重4kgであるのに対し、MagRing Proは金属製で耐荷重3kg、重量25gと軽量である。"
        ],
        "differentiators": [
          "Andobil 高級牛革製 MagStand Proの利点：牛革の質感による高い高級感と、さらに強力な磁力（4kg）を求める場合に適している。",
          "Andobil スマホリング MagRing Proの利点：同等の高い耐久性を持ちつつ、より軽量（25g）で価格を少し抑えたい場合に適している。"
        ]
    }
]

data["analysis"]["competitiveAnalysis"].extend(new_competitors)

with open("data/investigations/B0DY7MR1S9.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
