#!/usr/bin/env python3
"""
Creators API BrowseNodes Investigation Script

Retrieves product information including BrowseNodeInfo to understand
the category hierarchy returned by Creators API.
"""

import argparse
import os
import json
import sys
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Ensure script can import from current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from creators_api_client import CreatorsAPIClient

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Investigate BrowseNodes structure from Amazon Creators API'
    )
    parser.add_argument(
        'asin',
        type=str,
        help='Amazon Standard Identification Number (ASIN) of the product'
    )
    args = parser.parse_args()

    try:
        client = CreatorsAPIClient()
        
        # Include BrowseNodeInfo to investigate category hierarchy
        resources = [
            "itemInfo.title",
            "browseNodeInfo.browseNodes",
            "browseNodeInfo.browseNodes.ancestor",
            "browseNodeInfo.browseNodes.salesRank"
        ]
        
        response_json = client.get_items([args.asin], resources=resources)
        
        # Print the full response for investigation
        print("=" * 60)
        print(f"Creators API Response for ASIN: {args.asin}")
        print("=" * 60)
        print(json.dumps(response_json, indent=2, ensure_ascii=False))
        
        if 'itemsResult' in response_json and 'items' in response_json['itemsResult']:
            item = response_json['itemsResult']['items'][0]
            
            print("\n" + "=" * 60)
            print("BrowseNodes Analysis")
            print("=" * 60)
            
            if 'browseNodeInfo' in item and 'browseNodes' in item['browseNodeInfo']:
                browse_nodes = item['browseNodeInfo']['browseNodes']
                print(f"\nTotal BrowseNodes: {len(browse_nodes)}")
                
                for idx, node in enumerate(browse_nodes):
                    print(f"\n--- Node {idx} ---")
                    print(f"  Id: {node.get('id', 'N/A')}")
                    print(f"  DisplayName: {node.get('displayName', 'N/A')}")
                    print(f"  ContextFreeName: {node.get('contextFreeName', 'N/A')}")
                    print(f"  IsRoot: {node.get('isRoot', 'N/A')}")
                    
                    if 'ancestor' in node:
                        print("  Ancestor Chain:")
                        ancestor = node['ancestor']
                        depth = 1
                        while ancestor:
                            print(f"    {'  ' * depth}└─ {ancestor.get('displayName', 'N/A')} (Id: {ancestor.get('id', 'N/A')})")
                            ancestor = ancestor.get('ancestor')
                            depth += 1
                    
                    if 'salesRank' in node:
                        print(f"  SalesRank: {node['salesRank']}")
            else:
                print("No BrowseNodeInfo found in the response")

    except Exception as e:
        print(f"Request failed: {e}")
