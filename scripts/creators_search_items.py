#!/usr/bin/env python3
"""
Creators API Item Search Script

This script searches for products on Amazon using the Creators API
and saves the results to a JSON file.

Usage:
    uv run python scripts/creators_search_items.py "アテックス ルルド ふくらはぎゅ"

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
        description='Search for products on Amazon using Creators API'
    )
    parser.add_argument(
        'keywords',
        type=str,
        help='Keywords to search for'
    )
    parser.add_argument(
        '--search-index', '-s',
        type=str,
        default='All',
        help='Amazon search index (default: All). Examples: Electronics, HomeAndKitchen, HealthPersonalCare, Sports, Books'
    )
    parser.add_argument(
        '--output', '-o',
        type=str,
        default='tmp/search_results.json',
        help='Output file path (default: tmp/search_results.json)'
    )
    args = parser.parse_args()

    try:
        client = CreatorsAPIClient()
        
        resources = [
            "itemInfo.title",
            "itemInfo.byLineInfo",
            "browseNodeInfo.browseNodes",
            "offersV2.listings.price"
        ]
        
        response_json = client.search_items(
            keywords=args.keywords,
            search_index=args.search_index,
            resources=resources
        )

        # Create output directory if needed
        output_dir = os.path.dirname(args.output)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)

        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(response_json, f, indent=2, ensure_ascii=False)
        print(f"Search results for '{args.keywords}' saved to {args.output}")

    except Exception as e:
        print(f"Request failed: {e}")
