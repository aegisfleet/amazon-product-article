#!/usr/bin/env python3
"""
スペック未調査・欠損商品の高速抽出スクリプト
"""
import os
import json
import re
import sys

# Windows環境での文字化け・UnicodeEncodeError防止
sys.stdout.reconfigure(encoding='utf-8')

INVESTIGATIONS_DIR = os.path.join(os.path.dirname(__file__), '../data/investigations')

def main():
    if not os.path.exists(INVESTIGATIONS_DIR):
        print(f"Directory not found: {INVESTIGATIONS_DIR}")
        return

    files = [f for f in os.listdir(INVESTIGATIONS_DIR) if f.endswith('.json')]
    
    phone_pattern = re.compile(r'(?:スマートフォン|スマホ|iPhone|Galaxy|Xperia|Pixel|Xiaomi|AQUOS|OPPO|Motorola|Redmi|POCO|arrows)', re.I)
    exclude_pattern = re.compile(r'(?:ケース|カバー|フィルム|ガラス|スタンド|ホルダー|ケーブル|充電器|ストラップ|アーム|アダプタ|リング|ポーチ|クリップ|保護|マウント|イヤホン|ヘッドホン|互換|交換用|車載|モバイルバッテリー|マグネット|三脚|自撮り)', re.I)
    
    incomplete_list = []

    for f in files:
        asin = f[:-5]
        path = os.path.join(INVESTIGATIONS_DIR, f)
        try:
            with open(path, 'r', encoding='utf-8') as fp:
                data = json.load(fp)
            
            analysis = data.get('analysis', {})
            name = analysis.get('productName', '')
            
            if phone_pattern.search(name) and not exclude_pattern.search(name):
                specs = analysis.get('technicalSpecs')
                missing = []
                
                if not specs:
                    missing.append('technicalSpecs全体なし')
                else:
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
                
                if missing:
                    incomplete_list.append({
                        'asin': asin,
                        'name': name,
                        'missing': missing,
                        'has_specs': specs is not None
                    })
        except Exception:
            continue

    print(f"\n======================================================")
    print(f"スペック未調査・欠損スマートフォン一覧 ({len(incomplete_list)}件)")
    print(f"======================================================\n")

    for item in incomplete_list:
        print(f"[ASIN: {item['asin']}] {item['name']}")
        print(f"  欠損項目: {', '.join(item['missing'])}")
        print("------------------------------------------------------")

if __name__ == '__main__':
    main()
