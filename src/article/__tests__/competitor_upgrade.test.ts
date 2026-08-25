describe('Competitor card upgrade parsing logic', () => {
  function extractCardAsin(amazonHref: string, title: string) {
    const urlMatch = amazonHref ? amazonHref.match(/\/dp\/([A-Z0-9]{10})/i) : null;
    if (urlMatch) return urlMatch[1];
    const titleMatch = title ? title.match(/\(([A-Z0-9]{10})\)/i) : null;
    return titleMatch ? titleMatch[1] : '';
  }

  function parsePrice(text: string): string {
    const match = text.match(/[￥¥]?\s*[\d,]+/);
    return match ? match[0].trim() : text.trim();
  }

  function parseScore(text: string): number {
    const match = text.match(/(\d+)\s*点?/);
    return match?.[1] ? Number.parseInt(match[1], 10) : 0;
  }

  function parseSpecsFromTags(tagTexts: string[]): Record<string, string> {
    const specs: Record<string, string> = {};
    tagTexts.forEach((text) => {
      const colonIdx = text.indexOf(':');
      if (colonIdx > -1) {
        const key = text.substring(0, colonIdx).trim();
        const val = text.substring(colonIdx + 1).trim();
        if (key && val) {
          specs[key] = val;
        }
      } else if (text) {
        specs[text] = '○';
      }
    });
    return specs;
  }

  test('extracts ASIN correctly', () => {
    expect(extractCardAsin('https://www.amazon.co.jp/dp/B0DSBLFMSV?tag=aegis-22', '')).toBe('B0DSBLFMSV');
    expect(extractCardAsin('', '天馬 フィッツチェスト (B000BRU5SO)')).toBe('B000BRU5SO');
  });

  test('extracts price correctly from competitor-actual-price text', () => {
    expect(parsePrice('￥18,818(+￥15,236)188pt還元')).toBe('￥18,818');
    expect(parsePrice('￥3,404(-￥178)392pt還元')).toBe('￥3,404');
  });

  test('extracts score correctly from competitor-score-container text', () => {
    expect(parseScore('trophy 80点')).toBe(80);
    expect(parseScore('85点')).toBe(85);
    expect(parseScore('')).toBe(0);
  });

  test('extracts specs correctly from hero tags', () => {
    const tags = ['重量: 13kg', '素材: ポリプロピレン / スチロール樹脂', 'サイズ: 850mm × 650mm × 410mm'];
    const specs = parseSpecsFromTags(tags);
    expect(specs['重量']).toBe('13kg');
    expect(specs['素材']).toBe('ポリプロピレン / スチロール樹脂');
    expect(specs['サイズ']).toBe('850mm × 650mm × 410mm');
  });
});
