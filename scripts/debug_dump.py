#!/usr/bin/env python3
"""
Amazon Creators API Debug Dump Script

This script retrieves all valid and useful information for a specific ASIN
from the Amazon Creators API and saves the raw response to a JSON file.
It is intended for debugging and technical investigation.

Usage:
    uv run python scripts/debug_dump.py B0XXXXXXXX
"""

import os
import json
import sys
import argparse
from datetime import datetime

# Ensure script can import from current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from creators_api_client import CreatorsAPIClient

# Comprehensive list of valid resources (excluding problematic ones for JP marketplace)
# Note: 'offersV2.listings.deliveryInfo.isPrimeEligible' and 'deliveryMessage' 
# are intentionally excluded as they cause 400 ValidationException in JP.
RESOURCES = [
    "itemInfo.title",
    "itemInfo.features",
    "itemInfo.productInfo",
    "itemInfo.byLineInfo",
    "itemInfo.technicalInfo",
    "itemInfo.manufactureInfo",
    "itemInfo.classifications",
    "itemInfo.contentRating",
    "itemInfo.externalIds",
    "images.primary.large",
    "images.primary.small",
    "images.variants.medium",
    "images.variants.large",
    "offersV2.listings.price",
    "offersV2.listings.availability",
    "offersV2.listings.merchantInfo",
    "offersV2.listings.condition",
    "offersV2.listings.type",
    "offersV2.listings.isBuyBoxWinner",
    "offersV2.listings.dealDetails",
    "offersV2.listings.loyaltyPoints",
    "browseNodeInfo.browseNodes",
    "parentASIN",
]

def main():
    parser = argparse.ArgumentParser(description='Dump full product info from Creators API')
    parser.add_argument('asin', help='Amazon ASIN to investigate')
    parser.add_argument('--output', '-o', default='tmp/debug_dump.json', help='Output JSON file')
    args = parser.parse_args()

    # Create output directory if needed
    output_abs_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_abs_path), exist_ok=True)

    print(f"Investigating ASIN: {args.asin}")
    print(f"Requesting {len(RESOURCES)} resources...")

    try:
        client = CreatorsAPIClient()
        response = client.get_items([args.asin], resources=RESOURCES)

        # Add some metadata to the output
        output_data = {
            "metadata": {
                "asin": args.asin,
                "timestamp": datetime.now().isoformat(),
                "resources_requested": RESOURCES
            },
            "response": response
        }

        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"Successfully dumped data to {args.output}")

        # Check for errors in the response
        if 'errors' in response:
            print("\nWARNING: API returned errors:")
            print(json.dumps(response['errors'], indent=2))
        
        if 'itemsResult' in response and 'items' in response['itemsResult']:
            item = response['itemsResult']['items'][0]
            if 'errors' in item:
                print("\nWARNING: Item-level errors found:")
                print(json.dumps(item['errors'], indent=2))

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
