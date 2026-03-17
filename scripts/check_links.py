#!/usr/bin/env python3
"""
JSON Link Checker for Amazon Product Investigation
JSONファイル内のURLの有効性を確認します。
"""

import os
import json
import sys
import re
import requests
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Set

def extract_urls_from_json(data) -> Set[str]:
    """JSONデータから再帰的にURLを抽出する"""
    urls = set()
    
    if isinstance(data, dict):
        for key, value in data.items():
            # 特定のキー "url" の場合は直接追加
            if key == "url" and isinstance(value, str):
                urls.add(value)
                continue
            
            # 再帰または文字列内の探索
            if isinstance(value, (dict, list)):
                urls.update(extract_urls_from_json(value))
            elif isinstance(value, str):
                found = re.findall(r'https?://[^\s<>"]+|www\.[^\s<>"]+', value)
                urls.update(found)
                
    elif isinstance(data, list):
        for item in data:
            urls.update(extract_urls_from_json(item))
            
    return urls

def check_url(url: str) -> Dict[str, any]:
    """URLの有効性を確認する"""
    try:
        # User-Agentを設定してブロックを回避しやすくする
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.head(url, headers=headers, timeout=10, allow_redirects=True)
        # HEADプロトコルが許可されていない場合はGETを試す
        if response.status_code == 405 or response.status_code == 404:
            response = requests.get(url, headers=headers, timeout=10, allow_redirects=True, stream=True)
            
        return {
            "url": url,
            "status": response.status_code,
            "ok": response.ok,
            "redirected": len(response.history) > 0,
            "final_url": response.url
        }
    except Exception as e:
        return {
            "url": url,
            "status": None,
            "ok": False,
            "error": str(e)
        }

def main():
    if len(sys.argv) < 2:
        print("使用法: python scripts/check_links.py <path_to_json_file>")
        sys.exit(1)
        
    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"Error: ファイルが見つかりません: {json_path}")
        sys.exit(1)
        
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error: JSONの読み込みに失敗しました: {e}")
        sys.exit(1)
        
    urls = extract_urls_from_json(data)
    if not urls:
        print("URLは見つかりませんでした。")
        return

    print(f"{len(urls)} 個のURLをチェックしています...")
    
    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(check_url, sorted(urls)))
        
    errors = [r for r in results if not r["ok"]]
    
    if errors:
        print("\n❌ リンクエラーが見つかりました:")
        for r in errors:
            status = r.get("status")
            error = r.get("error")
            if status:
                print(f" [{status}] {r['url']}")
            else:
                print(f" [ERR] {r['url']} ({error})")
        sys.exit(1)
    else:
        print("\n✅ すべてのリンクが有効です。")
        for r in results:
            print(f" [OK] {r['url']}")
        sys.exit(0)

if __name__ == "__main__":
    main()
