#!/usr/bin/env python3
"""
Creators API Product Information Retrieval Script

This script retrieves product information from Amazon Creators API
and saves it to a JSON file for use by Jules or other automated processes.

Usage:
    python creators_get_item.py B06WRS9737

Required Environment Variables:
    - AMAZON_CREATORS_APPLICATION_ID: Your Creators API application ID
    - AMAZON_CREATORS_CREDENTIAL_ID: Your Creators API credential ID
    - AMAZON_CREATORS_CREDENTIAL_SECRET: Your Creators API credential secret
    - AMAZON_PARTNER_TAG: Your Amazon Associates partner tag
"""

import argparse
import os
import json
import sys

# Ensure script can import from current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from creators_api_client import CreatorsAPIClient

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
        '--output', '-o',
        type=str,
        default='tmp/product_info.json',
        help='Output file path (default: tmp/product_info.json)'
    )
    args = parser.parse_args()

    try:
        client = CreatorsAPIClient()
        
        payload_dict = {
            "ItemIds": [args.asin],
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
        
        response_json = client.request("GetItems", payload_dict)
        
        if 'ItemsResult' in response_json and 'Items' in response_json['ItemsResult']:
            item = response_json['ItemsResult']['Items'][0]
            item_info = item.get('ItemInfo', {})
            
            data = {
                "productName": item_info.get('Title', {}).get('DisplayValue'),
                "brand": item_info.get('ByLineInfo', {}).get('Brand', {}).get('DisplayValue'),
                "manufacturer": item_info.get('ByLineInfo', {}).get('Manufacturer', {}).get('DisplayValue'),
                "price": item['Offers']['Listings'][0]['Price']['Amount'] if 'Offers' in item and item['Offers'].get('Listings') and item['Offers']['Listings'][0].get('Price') else None,
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

            # Create output directory if needed
            output_dir = os.path.dirname(args.output)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir)

            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Product information for {args.asin} saved to {args.output}")
        else:
            print("Could not find item in response:")
            print(json.dumps(response_json, indent=2))

    except Exception as e:
        print(f"Request failed: {e}")
