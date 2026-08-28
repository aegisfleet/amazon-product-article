#!/usr/bin/env python3
"""
JSON Artifact Quality Validator for Amazon Product Investigation
JSONファイルの内容（単位、構造、推奨度の根拠）とURLの有効性を包括的に確認します。
"""

import os
import json
import sys
import re
import argparse
import requests
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Set, Any, Optional

# Windows環境でのUnicodeEncodeError防止
if sys.stdout:
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def extract_urls_from_json(data) -> Set[str]:
    """JSONデータから再帰的にURLおよびASIN(Amazon URL化)を抽出する"""
    urls = set()
    
    if isinstance(data, dict):
        for key, value in data.items():
            # 'url' や 'imageUrl'、'source' 内の 'url' などを対象にする
            if (key == "url" or key == "imageUrl") and isinstance(value, str):
                urls.add(value)
                continue

            # 'asin' や 'parentAsin' フィールドを Amazon URL としてチェック対象に追加
            if (key == "asin" or key == "parentAsin") and isinstance(value, str):
                asin_val = value.strip().upper()
                if re.match(r'^[A-Z0-9]{10}$', asin_val):
                    urls.add(f"https://www.amazon.co.jp/dp/{asin_val}")
                continue
            
            if isinstance(value, (dict, list)):
                urls.update(extract_urls_from_json(value))
            elif isinstance(value, str):
                # Simple URL extraction
                found = re.findall(r'https?://[^\s<>"]+|www\.[^\s<>"]+', value)
                urls.update(found)
                
    elif isinstance(data, list):
        for item in data:
            urls.update(extract_urls_from_json(item))
            
    return urls

def _check_metric_value(val: str, path: str, errors: List[str]):
    """文字列内の単位をチェックする"""
    # 画面サイズ関連のフィールドはインチを許可する
    if re.search(r'display|screen|画面|モニタ', path, re.I):
        deprecated_units = [r'lbs?', r'oz', r'ft', r'feet', r'yards?']
    else:
        deprecated_units = [r'インチ', r'inch', r'(?<!\w)"(?!\w)', r'in\.', r'lbs?', r'oz', r'ft', r'feet', r'yards?']
    
    pattern = r'\d+\s*(' + '|'.join(deprecated_units) + r')'
    if re.search(pattern, val, re.I):
        errors.append(f"【注】非メートル法または不適切な単位が検出されました: {path} -> {val}")

def _recursive_check_metric(val: Any, path: str, errors: List[str]):
    """再帰的にメートル法のチェックを行う"""
    if isinstance(val, str):
        _check_metric_value(val, path, errors)
    elif isinstance(val, dict):
        for k, v in val.items():
            _recursive_check_metric(v, f"{path}.{k}" if path else k, errors)
    elif isinstance(val, list):
        for i, item in enumerate(val):
            _recursive_check_metric(item, f"{path}[{i}]", errors)

def _validate_metrics(data: Any, errors: List[str]):
    """メートル法のチェックを行う"""
    analysis = data.get("analysis", {})
    if "technicalSpecs" in analysis:
        _recursive_check_metric(analysis["technicalSpecs"], "technicalSpecs", errors)

def _validate_recommendation(analysis: Dict[str, Any], errors: List[str]):
    """購買推奨度の根拠をチェックする"""
    rec = analysis.get("recommendation", {})
    if rec:
        rationale = rec.get("scoreRationale", "")
        if not re.search(r'\[基本点:\s*\d+\]', rationale):
            errors.append("'scoreRationale' に計算根拠が記載されていない可能性があります。")

def _validate_recommendations_list(data: Any, errors: List[str]):
    """推薦商品リスト (today.json) の形式チェック"""
    required_fields = ["date", "headline", "searchContext", "recommendations"]
    for field in required_fields:
        if field not in data:
            errors.append(f"必須フィールド '{field}' が見つかりません。")
    
    recs = data.get("recommendations", [])
    if not isinstance(recs, list):
        errors.append("'recommendations' が配列ではありません。")
        return
        
    required_rec_fields = [
        "asin", "title", "price", "category", "reason", 
        "whyBuyNow", "source", "highlights", "url", 
        "rankReason", "scoreDisclaimer"
    ]
    for i, rec in enumerate(recs):
        for rf in required_rec_fields:
            if rf not in rec:
                errors.append(f"recommendations[{i}] (ASIN: {rec.get('asin', 'unknown')}) に必須フィールド '{rf}' が見つかりません。")

def _validate_investigation_artifact(analysis: Dict[str, Any], data: Any, errors: List[str]):
    """通常のアーティファクト (調査結果) の形式チェック"""
    required_fields = [
        "productName", "productDescription", "userStories", 
        "sources", "competitiveAnalysis", "recommendation", "technicalSpecs"
    ]
    for field in required_fields:
        if field not in analysis:
            errors.append(f"必須フィールド '{field}' が見つかりません。")

    if analysis.get("userStories") and len(analysis.get("userStories")) == 0:
        errors.append("'userStories' が空です。")

    comp_analysis = analysis.get("competitiveAnalysis", [])
    if isinstance(comp_analysis, list):
        for i, comp in enumerate(comp_analysis):
            if not isinstance(comp, dict):
                errors.append(f"competitiveAnalysis[{i}] が辞書形式ではありません。")
                continue
            if "asin" not in comp:
                errors.append(f"competitiveAnalysis[{i}] (商品名: {comp.get('name', 'unknown')}) に 'asin' がありません。")
            elif not re.match(r'^[A-Z0-9]{10}$', str(comp.get("asin", "")).strip().upper()):
                errors.append(f"competitiveAnalysis[{i}] の ASIN '{comp.get('asin')}' は有効な10桁ASINではありません。")
    
    _validate_metrics(data, errors)
    _validate_recommendation(analysis, errors)

def validate_content(data: Any) -> List[str]:
    """成果物の品質ガイドラインへの準拠を確認する"""
    errors = []
    
    # 推薦商品リスト (today.json) の形式チェック
    if "recommendations" in data and "headline" in data:
        _validate_recommendations_list(data, errors)
        return errors

    # 通常のアーティファクト (調査結果) の形式チェック
    analysis = data.get("analysis", {})
    if not analysis:
        # どちらの形式でもない場合はバリデーションエラーとはせず、全般的なチェックのみ行う
        return []

    _validate_investigation_artifact(analysis, data, errors)
    return errors

def check_url(url: str) -> Dict[str, Any]:
    """URLの有効性を確認する"""
    if "webservices.amazon.co.jp/paapi5" in url:
        return {"url": url, "status": 200, "ok": True, "note": "Amazon PAAPI endpoint is skipped"}
        
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        # 初期チェックは HEAD
        response = requests.head(url, headers=headers, timeout=10, allow_redirects=True)
        
        # HEAD が 404/405 の場合は GET で再試行
        if response.status_code in (404, 405):
            response = requests.get(url, headers=headers, timeout=10, allow_redirects=True, stream=True)
            
        # Amazon 503エラーはレート制限/WAFなどによる一時的なものが多いため許容する
        if response.status_code == 503 and "amazon.co.jp" in url:
            return {"url": url, "status": 503, "ok": True, "final_url": response.url, "note": "Amazon 503 (rate limit/WAF) allowed"}

        # Amazon の「ソフト404」（200 OK だがページが存在しない）をチェック
        if "amazon.co.jp" in url and response.status_code == 200:
            # 内容を確認するために GET を実行（HEAD の場合は content が空）
            full_response = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
            error_indicators = [
                "申し訳ございません。入力されたウェブアドレスは当社サイトの有効なページではないか",
                "something went wrong on our end",
                "犬の画像が表示される（Amazonの404ページ）" # 実際にはテキストをチェック
            ]
            for indicator in error_indicators:
                if indicator in full_response.text:
                    return {"url": url, "status": 200, "ok": False, "final_url": full_response.url, "note": "Amazon Soft-404 detected"}

        return {"url": url, "status": response.status_code, "ok": response.ok, "final_url": response.url}
    except Exception as e:
        return {"url": url, "status": None, "ok": False, "error": str(e)}

def _handle_link_checks(data: Any) -> bool:
    """リンクのチェックを実行する"""
    urls = extract_urls_from_json(data)
    if not urls:
        print("URLは見つかりませんでした。")
        return True

    print(f"{len(urls)} 個のURLをチェックしています...")
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(check_url, sorted(urls)))
    
    errors = [r for r in results if not r["ok"]]
    if errors:
        print("❌ リンクエラーが見つかりました:")
        for r in errors:
            msg = f"status {r['status']}" if r['status'] else f"error {r.get('error')}"
            print(f"  - [{msg}] {r['url']}")
        return False
    
    print("✅ リンクはすべて有効です。")
    return True

def process_file(file_path: str, check_links: bool, check_content: bool) -> bool:
    """単一のファイルを処理し、エラーがあればFalseを返す"""
    print(f"\n--- {os.path.basename(file_path)} をチェック中 ---")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ JSONの読み込みに失敗しました: {e}")
        return False

    success = True
    if check_content:
        content_errors = validate_content(data)
        if content_errors:
            print("⚠️ 成果物の品質に関する指摘事項:")
            for err in content_errors:
                print(f"  - {err}")
            success = False

    if check_links:
        links_ok = _handle_link_checks(data)
        return success and links_ok
            
    return success

JSON_EXT = ".json"

def _find_json_files(directory: str, recursive: bool) -> List[str]:
    """ディレクトリ内からJSONファイルを検索する"""
    if recursive:
        return [
            os.path.join(root, f)
            for root, _, files in os.walk(directory)
            for f in files
            if f.endswith(JSON_EXT)
        ]
    return [
        os.path.join(directory, f)
        for f in os.listdir(directory)
        if f.endswith(JSON_EXT)
    ]

def _get_target_files(paths: List[str], recursive: bool) -> List[str]:
    """指定されたパスから対象となるJSONファイル一覧を取得する"""
    files_to_check = []
    for path in paths:
        if not os.path.exists(path):
            print(f"Error: パスが見つかりません: {path}")
            continue
            
        if os.path.isfile(path) and path.endswith(JSON_EXT):
            files_to_check.append(path)
        elif os.path.isdir(path):
            files_to_check.extend(_find_json_files(path, recursive))
    return files_to_check

def main():
    parser = argparse.ArgumentParser(description="JSON Artifact Quality Validator")
    parser.add_argument("paths", nargs="+", help="チェックするJSONファイルまたはディレクトリのパス（複数指定可）")
    parser.add_argument("--no-links", action="store_true", help="リンクチェックをスキップする")
    parser.add_argument("--no-content", action="store_true", help="内容のバリデーションをスキップする")
    parser.add_argument("--recursive", "-r", action="store_true", help="ディレクトリを再帰的に検索する")
    
    args = parser.parse_args()
    files_to_check = _get_target_files(args.paths, args.recursive)
    
    if not files_to_check:
        print("チェック対象のJSONファイルが見つかりませんでした。")
        sys.exit(0)

    print(f"{len(files_to_check)} 個のファイルをチェックします。")
    
    all_success = True
    for f in files_to_check:
        if not process_file(f, not args.no_links, not args.no_content):
            all_success = False
            
    if all_success:
        print("\n✨ すべてのチェックを通過しました。")
        sys.exit(0)
    else:
        print("\n❌ いくつかのファイルでエラーが見つかりました。")
        sys.exit(1)

if __name__ == "__main__":
    main()
