import { CompareHelper, type CompareItem } from '../CompareHelper';

describe('CompareHelper', () => {
  const sampleItems: CompareItem[] = [
    {
      asin: 'ASIN001',
      title: '商品A',
      url: '/articles/asin001/',
      affiliateUrl: 'https://amazon.co.jp/dp/ASIN001',
      image: 'https://example.com/a.jpg',
      price: '￥3,555',
      priceNum: 3555,
      score: 85,
      savingsPercentage: 20,
      category: 'PC',
      specs: { 重量: '120g', 素材: 'ABS' },
      addedAt: 1000,
    },
    {
      asin: 'ASIN002',
      title: '商品B',
      url: '/articles/asin002/',
      affiliateUrl: 'https://amazon.co.jp/dp/ASIN002',
      image: 'https://example.com/b.jpg',
      price: '￥2,980',
      priceNum: 2980,
      score: 90,
      savingsPercentage: 10,
      category: 'PC',
      specs: { 重量: '150g', サイズ: '10x5cm' },
      addedAt: 2000,
    },
    {
      asin: 'ASIN003',
      title: '商品C',
      url: '/articles/asin003/',
      affiliateUrl: 'https://amazon.co.jp/dp/ASIN003',
      image: 'https://example.com/c.jpg',
      price: '￥5,000',
      priceNum: 5000,
      score: 90,
      savingsPercentage: 0,
      category: 'PC',
      specs: { 素材: 'アルミ', サイズ: '12x6cm' },
      addedAt: 3000,
    },
  ];

  describe('parsePrice', () => {
    it('正しい価格数値を取り出すこと', () => {
      expect(CompareHelper.parsePrice('￥3,555')).toBe(3555);
      expect(CompareHelper.parsePrice('3,555円')).toBe(3555);
      expect(CompareHelper.parsePrice('オープン価格')).toBe(0);
      expect(CompareHelper.parsePrice('')).toBe(0);
    });
  });

  describe('findBestScoreAsins', () => {
    it('最高スコアのASINリストを返すこと', () => {
      const best = CompareHelper.findBestScoreAsins(sampleItems);
      expect(best).toEqual(['ASIN002', 'ASIN003']);
    });

    it('アイテムが空の場合は空配列を返すこと', () => {
      expect(CompareHelper.findBestScoreAsins([])).toEqual([]);
    });

    it('スコアが全件0の場合は空配列を返すこと', () => {
      const zeroItems = sampleItems.map((item) => ({ ...item, score: 0 }));
      expect(CompareHelper.findBestScoreAsins(zeroItems)).toEqual([]);
    });
  });

  describe('findLowestPriceAsins', () => {
    it('最安価格のASINリストを返すこと', () => {
      const lowest = CompareHelper.findLowestPriceAsins(sampleItems);
      expect(lowest).toEqual(['ASIN002']);
    });

    it('アイテムが空の場合は空配列を返すこと', () => {
      expect(CompareHelper.findLowestPriceAsins([])).toEqual([]);
    });

    it('価格がすべて0（不明）の場合は空配列を返すこと', () => {
      const zeroPriceItems = sampleItems.map((item) => ({ ...item, priceNum: 0 }));
      expect(CompareHelper.findLowestPriceAsins(zeroPriceItems)).toEqual([]);
    });
  });

  describe('getAllSpecKeys', () => {
    it('全アイテムのスペックキーを重複なく収集すること', () => {
      const keys = CompareHelper.getAllSpecKeys(sampleItems);
      expect(keys).toEqual(['重量', '素材', 'サイズ']);
    });
  });
});
