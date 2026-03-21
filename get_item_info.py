import requests
from bs4 import BeautifulSoup
import json

url = "https://www.amazon.co.jp/dp/B0GRDKZJ9L"
headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
}
r = requests.get(url, headers=headers)
print(r.status_code)

if r.status_code == 200:
    soup = BeautifulSoup(r.text, 'html.parser')

    # Try to find description
    desc = soup.find(id="productDescription")
    if desc:
        print("Description:")
        print(desc.text.strip())

    # Try to find specs
    details = soup.find(id="detailBullets_feature_div")
    if details:
        print("\nDetails:")
        print(details.text.strip())

    features = soup.find(id="feature-bullets")
    if features:
        print("\nFeatures:")
        print(features.text.strip())
