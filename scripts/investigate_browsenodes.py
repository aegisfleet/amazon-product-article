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
        client = PAAPIClient()
        
        # Include BrowseNodeInfo to investigate category hierarchy
        payload_dict = {
            "ItemIds": [args.asin],
            "Resources": [
                "ItemInfo.Title",
                "BrowseNodeInfo.BrowseNodes",
                "BrowseNodeInfo.BrowseNodes.Ancestor",
                "BrowseNodeInfo.BrowseNodes.SalesRank"
            ]
        }
        
        response_json = client.request("GetItems", payload_dict)
        
        # Print the full response for investigation
        print("=" * 60)
        print(f"Creators API Response for ASIN: {args.asin}")
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
