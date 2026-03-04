import json

def convert_units():
    with open('data/investigations/B0FPFFZ93G.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # インチからセンチメートルへ変換 (1インチ = 2.54cm)
    # ポンドからキログラムへ変換 (1ポンド = 0.453592kg)

    dims = data['analysis']['technicalSpecs']['dimensions']

    try:
        height_in = float(dims['height'].replace('インチ', ''))
        dims['height'] = f"{height_in * 2.54:.1f}cm"
    except: pass

    try:
        length_in = float(dims['length'].replace('インチ', ''))
        dims['length'] = f"{length_in * 2.54:.1f}cm"
    except: pass

    try:
        width_in = float(dims['width'].replace('インチ', ''))
        dims['width'] = f"{width_in * 2.54:.1f}cm"
    except: pass

    try:
        weight_lb = float(dims['weight'].replace('ポンド', ''))
        dims['weight'] = f"{weight_lb * 0.453592:.2f}kg"
    except: pass

    with open('data/investigations/B0FPFFZ93G.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

convert_units()
