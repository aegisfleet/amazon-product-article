import requests
import json
url = "https://www.amazon.co.jp/dp/B0GRDKZJ9L"
# using headers to bypass some simple checks
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
r = requests.get(url, headers=headers)
print(r.status_code)
