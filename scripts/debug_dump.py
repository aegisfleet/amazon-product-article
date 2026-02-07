
import os
import json
import sys

# Ensure script can import from current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from creators_api_client import CreatorsAPIClient

if __name__ == '__main__':
    asin = sys.argv[1] if len(sys.argv) > 1 else 'B009ODJPMI'
    
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except:
        pass

    client = CreatorsAPIClient()
    resources = [
        "itemInfo.title",
        "browseNodeInfo.browseNodes",
        "browseNodeInfo.browseNodes.ancestor",
        "browseNodeInfo.browseNodes.salesRank"
    ]
    
    response = client.get_items([asin], resources=resources)
    
    with open('debug_output.json', 'w', encoding='utf-8') as f:
        json.dump(response, f, indent=2, ensure_ascii=False)
    
    print("Done writing to debug_output.json")
