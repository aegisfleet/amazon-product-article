1. **Understand the target product (B08XR3JJ87)**
   - Target product: AGF ちょっと贅沢な珈琲店 ブラックインボックス スティックブラック 焙煎アソート 50個 (x 1)
   - Read the data obtained from `creators_get_item.py B08XR3JJ87`.
   - The product offers 4 different roasting levels (Light, Medium, Medium-Dark, Dark) in one box. It contains 50 sticks (15 Medium, 15 Dark, 10 Light, 10 Medium-Dark).

2. **Conduct competitive analysis**
   - Competitor 1: B0F51ZVY93 (ネスカフェ ゴールドブレンド スティック ブラック 100P)
     - Price: ¥2792 / 100 sticks (¥27.9/stick).
     - Single type vs. Target's assortment.
   - Competitor 2: B07573V7WV (AGF ちょっと贅沢な珈琲店 ブラックインボックス スティックブラック 産地アソート 50個)
     - Price: ¥1832 / 50 sticks.
     - Origin assortment (Brazil, Mocha, Colombia, Kilimanjaro) vs. Roasting assortment of target product.
   - Search for other relevant competitors using `creators_search_items.py` or `google_search`. Need 6-8 ASINs.

3. **Construct JSON data**
   - Format: `data/investigations/B08XR3JJ87.json`
   - Map information like nutritional value, ingredients, roasting levels to features and technicalSpecs.
   - Ensure the required format is respected, such as metric units only.
   - Create user stories focusing on real-world scenarios for this product (e.g. comparing roasts for morning vs afternoon, easy preparation).
   - Ensure `lastInvestigated` is updated to `2026-03-18`.

4. **Verify Artifact**
   - Run `python scripts/validate_artifact.py data/investigations/B08XR3JJ87.json`
   - Fix any errors reported by the validation script.

5. **Pre-commit step**
   - Run pre-commit instructions.
   - Check again.

6. **Submit**
   - Commit and submit.
