/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for home-pickup.js pure helper functions
 */

const HomePickup = require('../../../static/js/home-pickup.js');

describe('home-pickup logic', () => {
  const samplePool = [
    {
      asin: 'B01',
      title: 'Anker PowerLine III Flow',
      url: '/b01/',
      score: 94,
      price: '￥1,890',
      category: 'USBケーブル',
      group: 'モバイルバッテリー／充電器',
      priceBucket: 'under-3000',
      image: 'https://example.com/1.jpg',
      specs: { weight: '約64g', material: 'シリコン', capacity: '100W' },
    },
    {
      asin: 'B02',
      title: '江崎グリコ ビスコ 保存缶',
      url: '/b02/',
      score: 97,
      price: '￥624',
      category: '非常食',
      group: '食品／飲料／お酒',
      priceBucket: 'under-3000',
      image: 'https://example.com/2.jpg',
      specs: { height: '123mm', width: '104mm', quantity: '30枚' },
    },
    {
      asin: 'B03',
      title: 'メディケン 月経カップ',
      url: '/b03/',
      score: 90,
      price: '￥2,221',
      category: '衛生用品',
      group: '日用品／生活雑貨',
      priceBucket: 'under-3000',
      image: 'https://example.com/3.jpg',
      specs: { capacity: '34ml', material: '医療用シリコン', weight: '0g' },
    },
  ];

  describe('extractStructuredSpecs', () => {
    it('specsオブジェクトから最大3件の有効なKey-Valueペアを抽出し、0値や不明を除外すること', () => {
      const specs1 = HomePickup.extractStructuredSpecs(samplePool[0]);
      expect(specs1).toEqual([
        { label: '重量', value: '約64g' },
        { label: '容量', value: '100W' },
        { label: '素材', value: 'シリコン' },
      ]);

      // weight: '0g' は除外されること
      const specs3 = HomePickup.extractStructuredSpecs(samplePool[2]);
      expect(specs3).toEqual([
        { label: '容量', value: '34ml' },
        { label: '素材', value: '医療用シリコン' },
      ]);

      // height & width からサイズが合成されること
      const specs2 = HomePickup.extractStructuredSpecs(samplePool[1]);
      expect(specs2).toEqual([
        { label: '内容量', value: '30枚' },
        { label: 'サイズ', value: '123mm × 104mm' },
      ]);
    });
  });

  describe('buildCategoryTabs', () => {
    it('プール内の親カテゴリをカウントし、「すべて」を先頭に優先グループ順でタブ配列を返すこと', () => {
      const preferences = {
        recentGroup: '食品／飲料／お酒',
        groupHistory: new Set(['食品／飲料／お酒']),
      };
      const tabs = HomePickup.buildCategoryTabs(samplePool, preferences, 5);
      expect(tabs[0]).toEqual({ id: 'all', label: 'すべて', count: 3 });
      // 直近閲覧グループが優先されること
      expect(tabs[1].id).toBe('食品／飲料／お酒');
      expect(tabs[1].count).toBe(1);
    });
  });

  describe('findTopScoreAsin', () => {
    it('表示対象アイテムの中で最高スコアのASINを返すこと', () => {
      const topAsin = HomePickup.findTopScoreAsin(samplePool);
      expect(topAsin).toBe('B02'); // 97点
    });
  });
});
