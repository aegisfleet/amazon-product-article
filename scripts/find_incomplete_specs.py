#!/usr/bin/env python3
"""
スペック未調査・欠損商品の高速抽出スクリプト（全カテゴリ対応）
"""
import os
import json
import re
import sys

# Windows環境での文字化け・UnicodeEncodeError防止
sys.stdout.reconfigure(encoding='utf-8')

INVESTIGATIONS_DIR = os.path.join(os.path.dirname(__file__), '../data/investigations')

def detect_category(name):
    name_lower = name.lower()
    if re.search(r'(?:スマートウォッチ|watch|バンド|band|fit\d|トラッカー)', name_lower):
        return 'watch'
    elif re.search(r'(?:イヤホン|ヘッドホン|earbuds|headphones|buds)', name_lower):
        return 'audio'
    elif re.search(r'(?:モニター|ディスプレイ|monitor|g34wqi|a24i)', name_lower):
        return 'monitor'
    elif re.search(r'(?:カメラ|見守り|ベビーモニター|camera)', name_lower):
        return 'camera'
    elif re.search(r'(?:スマートフォン|スマホ|iphone|galaxy|xperia|pixel|poco|redmi|arrows|libero)', name_lower) and not re.search(r'(?:ケース|カバー|フィルム|ガラス|スタンド|バンド|ベルト|フィルター)', name_lower):
        return 'phone_tablet'
    elif re.search(r'(?:タブレット|ipad|pad|arrows tab)', name_lower) and not re.search(r'(?:ケース|カバー|フィルム|ガラス|スタンド)', name_lower):
        return 'phone_tablet'
    elif re.search(r'(?:体重計|体組成計|空気清浄機|ドライバー|ペットフィーダー|給餌器|家電)', name_lower):
        return 'appliance'
    elif re.search(r'(?:ケース|カバー|フィルム|ガラス|スタンド|バンド|ベルト|フィルター)', name_lower):
        return 'accessory'
    else:
        return 'general'

def check_missing_specs(category, specs):
    if not specs or not isinstance(specs, dict):
        return ['technicalSpecs全体なし']
    
    missing = []
    
    # 共通でチェック: other 配列に CPU やディスプレイ等の文字列が詰め込まれたままになっていないか
    other_list = specs.get('other', [])
    if isinstance(other_list, list):
        for item in other_list:
            if isinstance(item, str) and re.match(r'^(?:CPU|OS|ディスプレイ|メモリ|RAM|ROM|ストレージ|バッテリー|カメラ):', item):
                missing.append('未構造化の文字列がother配列内に残存')
                break

    if category == 'phone_tablet':
        if not specs.get('cpu'): missing.append('cpu')
        if not specs.get('ram'): missing.append('ram')
        if not specs.get('storage'): missing.append('storage')
        if not specs.get('os'): missing.append('os')
        disp = specs.get('display')
        if not disp or (isinstance(disp, dict) and not disp.get('size')):
            missing.append('display')
        bat = specs.get('battery')
        if not bat or (isinstance(bat, dict) and not bat.get('capacity')):
            missing.append('battery')
    elif category == 'watch':
        disp = specs.get('display')
        if not disp or (isinstance(disp, dict) and not disp.get('size')):
            missing.append('display (画面仕様)')
        bat = specs.get('battery')
        if not bat or (isinstance(bat, dict) and not (bat.get('capacity') or bat.get('playbackTime'))):
            missing.append('battery (バッテリー容量/駆動時間)')
        if not specs.get('weight') and not (isinstance(specs.get('dimensions'), dict) and specs.get('dimensions', {}).get('weight')):
            missing.append('weight (重量)')
    elif category == 'audio':
        bat = specs.get('battery')
        if not bat or (isinstance(bat, dict) and not (bat.get('playbackTime') or bat.get('capacity'))):
            missing.append('battery (連続再生時間/バッテリー容量)')
        if not specs.get('connectivity'):
            missing.append('connectivity (Bluetooth/コーデック)')
    elif category == 'monitor':
        disp = specs.get('display')
        if not disp or (isinstance(disp, dict) and not (disp.get('size') and disp.get('resolution'))):
            missing.append('display (画面サイズ/解像度)')
    elif category == 'camera':
        cam = specs.get('camera')
        if not cam or (isinstance(cam, dict) and not (cam.get('resolution') or cam.get('main'))):
            missing.append('camera (画素数/解像度)')
    
    return missing

def main():
    if not os.path.exists(INVESTIGATIONS_DIR):
        print(f"Directory not found: {INVESTIGATIONS_DIR}")
        return

    files = [f for f in os.listdir(INVESTIGATIONS_DIR) if f.endswith('.json')]
    category_items = {}

    for f in files:
        asin = f[:-5]
        path = os.path.join(INVESTIGATIONS_DIR, f)
        try:
            with open(path, 'r', encoding='utf-8') as fp:
                data = json.load(fp)
            
            analysis = data.get('analysis', {})
            name = analysis.get('productName', '')
            category = detect_category(name)
            
            specs = analysis.get('technicalSpecs')
            missing = check_missing_specs(category, specs)
            
            if missing:
                if category not in category_items:
                    category_items[category] = []
                category_items[category].append({
                    'asin': asin,
                    'name': name,
                    'missing': missing,
                    'category': category
                })
        except Exception:
            continue

    total_count = sum(len(items) for items in category_items.values())

    print(f"\n======================================================")
    print(f"スペック未調査・欠損商品一覧 (合計: {total_count}件)")
    print(f"======================================================\n")

    for cat, items in category_items.items():
        print(f"### カテゴリ: {cat.upper()} ({len(items)}件)")
        for item in items:
            print(f"  [ASIN: {item['asin']}] {item['name']}")
            print(f"    欠損項目: {', '.join(item['missing'])}")
        print("------------------------------------------------------")

if __name__ == '__main__':
    main()

