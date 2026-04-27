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
        description='Retrieve product information from Amazon Creators API'
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
        
        resources = [
            "images.primary.large",
            "images.primary.small",
            "images.variants.medium",
            "itemInfo.title",
            "itemInfo.features",
            "itemInfo.byLineInfo",
            "itemInfo.productInfo",
            "itemInfo.technicalInfo",
            "itemInfo.manufactureInfo",
            "itemInfo.classifications",
            "offersV2.listings.price",
            "offersV2.listings.availability",
            "offersV2.listings.merchantInfo",
            "offersV2.listings.condition",
            "offersV2.listings.type",
            "offersV2.listings.isBuyBoxWinner",
            "offersV2.listings.dealDetails",
            "offersV2.listings.loyaltyPoints",
            "browseNodeInfo.browseNodes"
        ]
        
        response_json = client.get_items([args.asin], resources=resources)
        with open("tmp/raw_response.json", "w", encoding="utf-8") as f:
            json.dump(response_json, f, indent=2, ensure_ascii=False)
        
        if 'itemsResult' in response_json and 'items' in response_json['itemsResult']:
            item = response_json['itemsResult']['items'][0]
            item_info = item.get('itemInfo', {})
            
            data = {
                "productName": item_info.get('title', {}).get('displayValue'),
                "brand": item_info.get('byLineInfo', {}).get('brand', {}).get('displayValue'),
                "manufacturer": item_info.get('byLineInfo', {}).get('manufacturer', {}).get('displayValue'),
                "price": None,
                "imageUrl": item.get('images', {}).get('primary', {}).get('large', {}).get('url'),
                "features": item_info.get('features', {}).get('displayValues', []),
                "specifications": {},
                "dimensions": {}
            }

            # Extract price from offersV2
            if 'offersV2' in item and item['offersV2'].get('listings'):
                listings = item['offersV2']['listings']
                if listings and listings[0].get('price', {}).get('money'):
                    money = listings[0]['price']['money']
                    data["price"] = money.get('amount')

            # ManufactureInfo (Model number etc.)
            if 'manufactureInfo' in item_info:
                m_info = item_info['manufactureInfo']
                if 'itemModelNumber' in m_info:
                    data["modelNumber"] = m_info['itemModelNumber'].get('displayValue')

            # ProductInfo (Dimensions, Weight, Color, Size)
            if 'productInfo' in item_info:
                p_info = item_info['productInfo']
                if 'itemDimensions' in p_info:
                    dims = p_info['itemDimensions']
                    for dim_type in ['height', 'length', 'width', 'weight']:
                        if dim_type in dims:
                            data["dimensions"][dim_type.lower()] = {
                                "value": dims[dim_type].get('displayValue'),
                                "unit": dims[dim_type].get('unit')
                            }
                if 'color' in p_info:
                    data["specifications"]["color"] = p_info['color'].get('displayValue')
                if 'size' in p_info:
                    data["specifications"]["size"] = p_info['size'].get('displayValue')

            # TechnicalInfo
            if 'technicalInfo' in item_info:
                t_info = item_info['technicalInfo']
                for key, value in t_info.items():
                    if isinstance(value, dict) and 'displayValue' in value:
                        data["specifications"][key] = value['displayValue']

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
