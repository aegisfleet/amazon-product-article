import json

with open("data/investigations/B0G3TWHJC4.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# Update technicalSpecs to include color and unitCount
data["analysis"]["technicalSpecs"]["color"] = "03 milk white"
data["analysis"]["technicalSpecs"]["unitCount"] = 1

# Since we don't have sources, let's remove the claims section or adjust it to be consistent with the lack of sources.
# The prompt says: "主張やストーリーは、必ず sources の id を supportingSourceIds に含めて紐付けること。"
# Since we couldn't find any verifiable external sources, it's safer to not have claims.
data["analysis"]["claims"] = []

with open("data/investigations/B0G3TWHJC4.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
