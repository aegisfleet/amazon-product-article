#!/usr/bin/env python3
"""
PA-API Product Information Retrieval Script

This script retrieves product information from Amazon Product Advertising API (PA-API)
and saves it to a JSON file for use by Jules or other automated processes.

Usage:
    python paapi_get_item.py <ASIN>
    python paapi_get_item.py B06WRS9737

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
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='Retrieve product information from Amazon PA-API'
    )
    parser.add_argument(
        'asin',
        type=str,
        help='Amazon Standard Identification Number (ASIN) of the product'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='product_info.json',
        help='Output file name for the product information'
    )
    args = parser.parse_args()

    access_key = os.environ.get("AMAZON_ACCESS_KEY")
    secret_key = os.environ.get("AMAZON_SECRET_KEY")
    partner_tag = os.environ.get("AMAZON_PARTNER_TAG")
    
    host = 'webservices.amazon.co.jp'
    region = 'us-west-2'
    service = 'ProductAdvertisingAPI'

    payload_dict = {
        "ItemIds": [args.asin],
        "PartnerTag": partner_tag,
        "PartnerType": "Associates",
        "Resources": [
            "Images.Primary.Large",
            "ItemInfo.Title",
            "ItemInfo.Features",
            "ItemInfo.ByLineInfo",
            "ItemInfo.ProductInfo",
            "ItemInfo.TechnicalInfo",
            "ItemInfo.ManufactureInfo",
            "Offers.Listings.Price"
        ]
    }
    payload = json.dumps(payload_dict)

    headers = get_signed_headers(access_key, secret_key, region, service, host, payload)
    
    endpoint = 'https://' + host + '/paapi5/getitems'
    
    try:
        r = requests.post(endpoint, data=payload, headers=headers)
        response_json = r.json()
        
        if 'ItemsResult' in response_json and 'Items' in response_json['ItemsResult']:
            item = response_json['ItemsResult']['Items'][0]
            item_info = item.get('ItemInfo', {})
            
            data = {
                "productName": item_info.get('Title', {}).get('DisplayValue'),
                "brand": item_info.get('ByLineInfo', {}).get('Brand', {}).get('DisplayValue'),
                "manufacturer": item_info.get('ByLineInfo', {}).get('Manufacturer', {}).get('DisplayValue'),
                "price": item['Offers']['Listings'][0]['Price']['Amount'] if 'Offers' in item else None,
                "imageUrl": item.get('Images', {}).get('Primary', {}).get('Large', {}).get('URL'),
                "features": item_info.get('Features', {}).get('DisplayValues', []),
                "specifications": {},
                "dimensions": {}
            }

            # ManufactureInfo (Model number etc.)
            if 'ManufactureInfo' in item_info:
                m_info = item_info['ManufactureInfo']
                if 'ItemModelNumber' in m_info:
                    data["modelNumber"] = m_info['ItemModelNumber']['DisplayValue']

            # ProductInfo (Dimensions, Weight, Color, Size)
            if 'ProductInfo' in item_info:
                p_info = item_info['ProductInfo']
                if 'ItemDimensions' in p_info:
                    dims = p_info['ItemDimensions']
                    for dim_type in ['Height', 'Length', 'Width', 'Weight']:
                        if dim_type in dims:
                            data["dimensions"][dim_type.lower()] = {
                                "value": dims[dim_type]['DisplayValue'],
                                "unit": dims[dim_type]['Unit']
                            }
                if 'Color' in p_info:
                    data["specifications"]["color"] = p_info['Color']['DisplayValue']
                if 'Size' in p_info:
                    data["specifications"]["size"] = p_info['Size']['DisplayValue']

            # TechnicalInfo
            if 'TechnicalInfo' in item_info:
                t_info = item_info['TechnicalInfo']
                for key, value in t_info.items():
                    if isinstance(value, dict) and 'DisplayValue' in value:
                        data["specifications"][key] = value['DisplayValue']

            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Product information for {args.asin} saved to {args.output}")
        else:
            print("Could not find item in response:")
            print(json.dumps(response_json, indent=2))

    except Exception as e:
        print(f"Request failed: {e}")
        if 'r' in locals():
            print(r.text)
