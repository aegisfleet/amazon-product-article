#!/usr/bin/env python3
"""
PA-API BrowseNodes Investigation Script

Retrieves product information including BrowseNodeInfo to understand
the category hierarchy returned by PA-API.
"""

import argparse
import datetime
import hashlib
import hmac
import os
import json
import requests
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

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
    canonical_uri = '/paapi5/getitems'
    
    t = datetime.datetime.utcnow()
    amz_date = t.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = t.strftime('%Y%m%d')

    canonical_querystring = ''
    canonical_headers = 'host:' + host + '\n' + 'x-amz-date:' + amz_date + '\n' + 'x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems\n'
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
        'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
        'content-type': 'application/json; charset=utf-8',
        'authorization': authorization_header,
        'content-encoding': 'amz-1.0'
    }
    return headers

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Investigate BrowseNodes structure from Amazon PA-API'
    )
    parser.add_argument(
        'asin',
        type=str,
        help='Amazon Standard Identification Number (ASIN) of the product'
    )
    args = parser.parse_args()

    access_key = os.environ.get("AMAZON_ACCESS_KEY")
    secret_key = os.environ.get("AMAZON_SECRET_KEY")
    partner_tag = os.environ.get("AMAZON_PARTNER_TAG")
    
    host = 'webservices.amazon.co.jp'
    region = 'us-west-2'
    service = 'ProductAdvertisingAPI'

    # Include BrowseNodeInfo to investigate category hierarchy
    payload_dict = {
        "ItemIds": [args.asin],
        "PartnerTag": partner_tag,
        "PartnerType": "Associates",
        "Resources": [
            "ItemInfo.Title",
            "BrowseNodeInfo.BrowseNodes",
            "BrowseNodeInfo.BrowseNodes.Ancestor",
            "BrowseNodeInfo.BrowseNodes.SalesRank"
        ]
    }
    payload = json.dumps(payload_dict)

    headers = get_signed_headers(access_key, secret_key, region, service, host, payload)
    
    endpoint = 'https://' + host + '/paapi5/getitems'
    
    try:
        r = requests.post(endpoint, data=payload, headers=headers)
        response_json = r.json()
        
        # Print the full response for investigation
        print("=" * 60)
        print(f"PA-API Response for ASIN: {args.asin}")
        print("=" * 60)
        print(json.dumps(response_json, indent=2, ensure_ascii=False))
        
        if 'ItemsResult' in response_json and 'Items' in response_json['ItemsResult']:
            item = response_json['ItemsResult']['Items'][0]
            
            print("\n" + "=" * 60)
            print("BrowseNodes Analysis")
            print("=" * 60)
            
            if 'BrowseNodeInfo' in item and 'BrowseNodes' in item['BrowseNodeInfo']:
                browse_nodes = item['BrowseNodeInfo']['BrowseNodes']
                print(f"\nTotal BrowseNodes: {len(browse_nodes)}")
                
                for idx, node in enumerate(browse_nodes):
                    print(f"\n--- Node {idx} ---")
                    print(f"  Id: {node.get('Id', 'N/A')}")
                    print(f"  DisplayName: {node.get('DisplayName', 'N/A')}")
                    print(f"  ContextFreeName: {node.get('ContextFreeName', 'N/A')}")
                    print(f"  IsRoot: {node.get('IsRoot', 'N/A')}")
                    
                    if 'Ancestor' in node:
                        print("  Ancestor Chain:")
                        ancestor = node['Ancestor']
                        depth = 1
                        while ancestor:
                            print(f"    {'  ' * depth}└─ {ancestor.get('DisplayName', 'N/A')} (Id: {ancestor.get('Id', 'N/A')})")
                            ancestor = ancestor.get('Ancestor')
                            depth += 1
                    
                    if 'SalesRank' in node:
                        print(f"  SalesRank: {node['SalesRank']}")
            else:
                print("No BrowseNodeInfo found in the response")

    except Exception as e:
        print(f"Request failed: {e}")
        if 'r' in locals():
            print(r.text)
