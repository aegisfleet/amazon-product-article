import requests
from bs4 import BeautifulSoup

url = "https://search.yahoo.co.jp/search?p=%E5%92%8C%E8%B1%9A%E3%82%82%E3%81%A1%E3%81%B6%E3%81%9F+%E9%AA%A8%E4%BB%98%E3%81%8D%E3%83%95%E3%83%A9%E3%83%B3%E3%82%AF"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36',
}
r = requests.get(url, headers=headers)
print(r.status_code)
if r.status_code == 200:
    soup = BeautifulSoup(r.text, 'html.parser')
    for a in soup.find_all('a'):
        href = a.get('href')
        if href and 'http' in href:
            print(a.text.strip(), href)
