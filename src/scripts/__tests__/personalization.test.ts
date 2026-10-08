/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for personalization scoring logic
 */

// mock localStorage if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string): string | null => store[key] || null,
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      for (const k of Object.keys(store)) delete store[k];
    },
    length: 0,
    key: (): string | null => null,
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    writable: true,
  });
}

const Personalization = require('../../../static/js/personalization.js');

describe('ProductPersonalization logic', () => {
  beforeEach(() => {
    Personalization.clearHistory();
  });

  describe('scoreItem', () => {
    it('直近閲覧カテゴリと一致する場合、2000点以上になること', () => {
      const preferences = {
        recentCategory: 'イヤホン',
        recentGroup: 'イヤホン／ヘッドホン／音響',
        categoryHistory: new Set(['イヤホン']),
        groupHistory: new Set(['イヤホン／ヘッドホン／音響']),
        priceBucketHistory: new Set(['7000-14999']),
        recentPriceBucket: '7000-14999',
        recentAsins: new Set(['B0VIEWED01']),
      };

      const item = {
        asin: 'B0OTHER001',
        category: 'イヤホン',
        group: 'イヤホン／ヘッドホン／音響',
        priceBucket: '7000-14999',
      };

      const score = Personalization.scoreItem(item, preferences);
      // 2000 (recentCat) + 150 (recentPriceBucket) = 2150
      expect(score).toBeGreaterThanOrEqual(2000);
    });

    it('直近親グループと一致する場合、1500点以上になること', () => {
      // saveEvent経由でpreferencesを構築して実際のフローを再現
      Personalization.saveEvent({
        asin: 'B0PHONE001',
        category: 'スマートフォン本体',
        group: 'スマホ／タブレット本体',
        priceBucket: '30000-plus',
      });
      const preferences = Personalization.getPreferences(10);

      const item = {
        asin: 'B0OTHER002',
        category: 'タブレット', // 別カテゴリ
        group: 'スマホ／タブレット本体', // 同一親グループ
        priceBucket: '30000-plus',
      };

      const score = Personalization.scoreItem(item, preferences);
      // 1500 (recentGroup) + 150 (priceBucket) = 1650
      expect(score).toBeGreaterThanOrEqual(1500);
      expect(score).toBeLessThan(2000);
    });

    it('【最重要】カテゴリ・グループが無関係な場合、価格帯が一致していてもスコアが0点であること', () => {
      const preferences = {
        recentCategory: 'プロテイン',
        recentGroup: 'サプリ／健康食品／医薬品',
        categoryHistory: new Set(['プロテイン']),
        groupHistory: new Set(['サプリ／健康食品／医薬品']),
        priceBucketHistory: new Set(['3000-6999']),
        recentPriceBucket: '3000-6999',
        recentAsins: new Set(['B0PROTEIN1']),
      };

      // 価格帯だけ一致している全く無関係な商品（Switchソフトや工具など）
      const unrelatedItem = {
        asin: 'B0GAME0001',
        category: 'Nintendo Switchゲームソフト',
        group: 'ゲーム／おもちゃ',
        priceBucket: '3000-6999',
      };

      const score = Personalization.scoreItem(unrelatedItem, preferences);
      expect(score).toBe(0);
    });

    it('閲覧済み商品（ASIN一致）の場合、ペナルティでマイナススコアになること', () => {
      const preferences = {
        recentCategory: 'イヤホン',
        recentGroup: 'イヤホン／ヘッドホン／音響',
        categoryHistory: new Set(['イヤホン']),
        groupHistory: new Set(['イヤホン／ヘッドホン／音響']),
        priceBucketHistory: new Set(['7000-14999']),
        recentPriceBucket: '7000-14999',
        recentAsins: new Set(['B0ALREADY01']),
      };

      const item = {
        asin: 'B0ALREADY01',
        category: 'イヤホン',
        group: 'イヤホン／ヘッドホン／音響',
        priceBucket: '7000-14999',
      };

      const score = Personalization.scoreItem(item, preferences);
      expect(score).toBeLessThan(-2000);
    });
  });

  describe('rankItems', () => {
    it('閲覧履歴がある時、関連商品が上位に並び、閲覧済み商品は除外（最下位化）されること', () => {
      // 閲覧イベントを記録
      Personalization.saveEvent({
        asin: 'B0MYPHONE01',
        category: 'スマートフォン本体',
        group: 'スマホ／タブレット本体',
        priceBucket: '30000-plus',
      });

      const candidates = [
        {
          asin: 'B0UNRELATED1',
          category: 'ゲームソフト',
          group: 'ゲーム／おもちゃ',
          priceBucket: '30000-plus',
          score: 95,
        },
        {
          asin: 'B0MYPHONE01', // 閲覧済み
          category: 'スマートフォン本体',
          group: 'スマホ／タブレット本体',
          priceBucket: '30000-plus',
          score: 92,
        },
        {
          asin: 'B0SAMEPHONE2', // 同一カテゴリ・未閲覧
          category: 'スマートフォン本体',
          group: 'スマホ／タブレット本体',
          priceBucket: '30000-plus',
          score: 85,
        },
        {
          asin: 'B0SAMETABLET', // 同一グループ・別カテゴリ
          category: 'タブレット',
          group: 'スマホ／タブレット本体',
          priceBucket: '30000-plus',
          score: 88,
        },
      ];

      const ranked = Personalization.rankItems(candidates);
      // 1位: 同一カテゴリ未閲覧 (B0SAMEPHONE2)
      // 2位: 同一グループ別カテゴリ (B0SAMETABLET)
      // 3位: 無関係 (B0UNRELATED1 - score:95)
      // 4位: 閲覧済み (B0MYPHONE01 - ペナルティ)
      expect(ranked[0].asin).toBe('B0SAMEPHONE2');
      expect(ranked[1].asin).toBe('B0SAMETABLET');
      expect(ranked[2].asin).toBe('B0UNRELATED1');
      expect(ranked[3].asin).toBe('B0MYPHONE01');
    });
  });
});
