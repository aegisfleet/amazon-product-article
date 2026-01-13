#!/usr/bin/env python3
"""
PA-API Item Search Script

This script searches for products on Amazon using the Product Advertising API (PA-API)
and saves the results to a JSON file.

Usage:
    python paapi_search_items.py <Keywords>
    python paapi_search_items.py "アテックス ルルド ふくらはぎゅ"

Required Environment Variables:
    - AMAZON_ACCESS_KEY: Your PA-API access key
    - AMAZON_SECRET_KEY: Your PA-API secret key
    - AMAZON_PARTNER_TAG: Your Amazon Associates partner tag
"""

import argparse
import datetime
import hashlib
import hmac
import os
import json
import requests

def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, 'aws4_request')
    return k_signing

def get_signed_headers(access_key, secret_key, region, service, host, payload):
    method = 'POST'
    canonical_uri = '/paapi5/searchitems'

    t = datetime.datetime.utcnow()
    amz_date = t.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = t.strftime('%Y%m%d')

    canonical_querystring = ''
    canonical_headers = 'host:' + host + '\n' + 'x-amz-date:' + amz_date + '\n' + 'x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n'
    signed_headers = 'host;x-amz-date;x-amz-target'
    payload_hash = hashlib.sha256(payload.encode('utf-8')).hexdigest()

    canonical_request = method + '\n' + canonical_uri + '\n' + canonical_querystring + '\n' + canonical_headers + '\n' + signed_headers + '\n' + payload_hash

    algorithm = 'AWS4-HMAC-SHA256'
    credential_scope = date_stamp + '/' + region + '/' + service + '/' + 'aws4_request'
    string_to_sign = algorithm + '\n' +  amz_date + '\n' +  credential_scope + '\n' +  hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()

    signing_key = get_signature_key(secret_key, date_stamp, region, service)
    signature = hmac.new(signing_key, (string_to_sign).encode('utf-8'), hashlib.sha256).hexdigest()

    authorization_header = algorithm + ' ' + 'Credential=' + access_key + '/' + credential_scope + ', ' +  'SignedHeaders=' + signed_headers + ', ' + 'Signature=' + signature

    headers = {
        'host': host,
        'x-amz-date': amz_date,
        'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
        'content-type': 'application/json; charset=utf-8',
        'authorization': authorization_header,
        'content-encoding': 'amz-1.0'
    }
    return headers

if __name__ == '__main__':
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='Search for products on Amazon using PA-API'
    )
    parser.add_argument(
        'keywords',
        type=str,
        help='Keywords to search for'
    )
    args = parser.parse_args()

    access_key = os.environ.get("AMAZON_ACCESS_KEY")
    secret_key = os.environ.get("AMAZON_SECRET_KEY")
    partner_tag = os.environ.get("AMAZON_PARTNER_TAG")

    host = 'webservices.amazon.co.jp'
    region = 'us-west-2'
    service = 'ProductAdvertisingAPI'

    payload_dict = {
        "Keywords": args.keywords,
        "PartnerTag": partner_tag,
        "PartnerType": "Associates",
        "SearchIndex": "HomeAndKitchen",
        "Resources": [
            "ItemInfo.Title",
            "ItemInfo.ByLineInfo",
            "BrowseNodeInfo.BrowseNodes",
            "Offers.Listings.Price"
        ]
    }
    payload = json.dumps(payload_dict)

    headers = get_signed_headers(access_key, secret_key, region, service, host, payload)

    endpoint = 'https://' + host + '/paapi5/searchitems'

    try:
        r = requests.post(endpoint, data=payload, headers=headers)
        response_json = r.json()

        with open("search_results.json", "w", encoding="utf-8") as f:
            json.dump(response_json, f, indent=2, ensure_ascii=False)
        print(f"Search results for '{args.keywords}' saved to search_results.json")

    except Exception as e:
        print(f"Request failed: {e}")
        if 'r' in locals():
            print(r.text)
