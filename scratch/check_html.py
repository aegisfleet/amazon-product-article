import urllib.request
import re

url = "http://localhost:1313/recommendations/"
try:
    response = urllib.request.urlopen(url)
    html = response.read().decode('utf-8')
    print("Successfully fetched HTML")
    # rec-summary-score td の出現箇所を確認
    matches = re.findall(r'<td class="rec-summary-score">', html)
    print(f"Found {len(matches)} instances of '<td class=\"rec-summary-score\">'")
    
    # CSSに .rec-summary-score が含まれているか確認
    css_matches = re.findall(r'\.rec-summary-score\s*\{[^}]*\}', html)
    print(f"Found CSS matches: {css_matches}")
except Exception as e:
    print(f"Error: {e}")
