import type { CreatorsAPIItem } from '../../types/CreatorsAPITypes';
import { CategoryNormalizer } from '../../utils/CategoryNormalizer';
import { CreatorsAPIClient } from '../CreatorsAPIClient';

describe('CreatorsAPIClient Category Parsing', () => {
  let client: CreatorsAPIClient;
  let clientAny: any;

  beforeEach(() => {
    client = new CreatorsAPIClient();
    clientAny = client as any;
  });

  // Test isValidCategoryName static method (moved to CategoryNormalizer)
  describe('isValidCategoryName', () => {
    const invalidNames = [
      'Amazon.co.jp Ranking',
      'Kindle Store',
      'Category (Special)',
      'Home & Kitchen [Sale]',
      'Best Sellers',
      'Coupons',
      '【New】Item',
      'Trial | Pipe',
      '※Note',
      '子育て支援施設向けページ',
      'らくらくベビー Birth Day企画',
      'ベビー＆マタニティ',
      'ホーム＆キッチン',
      'アクセサリ',
      'アクセサリー',
      '介護用品・生理用品',
      '花王',
      'Diapers',
    ];

    const validNames = [
      'Books',
      'Electronics',
      'Kitchen',
      'Computers',
      'Video Games',
      'Toys & Games',
      'Category_with_dash',
    ];

    test.each(invalidNames)('should return false for invalid name: %s', (name) => {
      expect(CategoryNormalizer.isValidCategoryName(name)).toBe(false);
    });

    test.each(validNames)('should return true for valid name: %s', (name) => {
      expect(CategoryNormalizer.isValidCategoryName(name)).toBe(true);
    });
  });

  // Test extractCategoryInfo private method
  describe('extractCategoryInfo', () => {
    test('should extract simple valid category', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [{ id: '1', displayName: 'Electronics', contextFreeName: 'Electronics' }],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      expect(result.category).toBe('Electronics');
      expect(result.categoryInfo.main).toBe('Electronics');
      expect(result.categoryInfo.browseNodeId).toBe('1');
    });

    test('should prioritize SalesRank', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [
            { id: '1', displayName: 'General Electronics', contextFreeName: 'General', salesRank: 100 },
            { id: '2', displayName: 'Headphones', contextFreeName: 'Headphones', salesRank: 1 },
            { id: '3', displayName: 'Audio', contextFreeName: 'Audio', salesRank: 50 },
          ],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      expect(result.category).toBe('Headphones');
    });

    test('should prioritize Depth over SalesRank (Specific > Generic)', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [
            { id: '1', displayName: 'Home', contextFreeName: 'Home', salesRank: 1 }, // Rank 1, Depth 1
            {
              id: '2',
              displayName: 'Pillow',
              contextFreeName: 'Pillow',
              salesRank: 9999,
              ancestor: { id: '1', displayName: 'Home', contextFreeName: 'Home' },
            }, // Rank 9999, Depth 2
          ],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      // Even though Home has rank 1, Pillow has depth 2. Pillow should win.
      expect(result.category).toBe('Pillow');
    });

    test('should filter out invalid categories', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [
            { id: '1', displayName: 'Amazon Devices', contextFreeName: 'Amazon' }, // Invalid
            { id: '2', displayName: 'Smart Watch', contextFreeName: 'Smart Watch', salesRank: 10 },
          ],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      expect(result.category).toBe('Smart Watch');
    });

    test('should use ancestor as sub category', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [
            {
              id: '2',
              displayName: 'Wireless Headphones',
              contextFreeName: 'Wireless',
              ancestor: { id: '1', displayName: 'Headphones', contextFreeName: 'Headphones' },
            },
          ],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      // In the new logic, Wireless Headphones is main (index 0), Headphones is sub (index 1)
      expect(result.category).toBe('Wireless Headphones');
      expect(result.categoryInfo.sub).toBe('Headphones');
    });

    test('should fallback if all nodes are invalid', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [{ id: '1', displayName: 'Amazon Basic', contextFreeName: 'Amazon' }],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      // new logic: fallback to "その他"
      expect(result.category).toBe('その他／全般');
    });

    test('should prioritize preferred categories (e.g. Child Seat)', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [
            { id: '1', displayName: 'Kitchen', contextFreeName: 'Kitchen' },
            { id: '2', displayName: 'チャイルドシート', contextFreeName: 'ChildSeat' },
          ],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      expect(result.category).toBe('チャイルドシート');
    });

    test('should skip blocked top-level category and use more specific parent', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [
            {
              id: '2',
              displayName: 'ベビー＆マタニティ', // Blocked leaf
              contextFreeName: 'Baby',
              ancestor: { id: '1', displayName: 'チャイルドシート', contextFreeName: 'ChildSeat' },
            },
          ],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      // "ベビー＆マタニティ" is blocked, so "チャイルドシート" (ancestor) becomes the leaf of the path.
      expect(result.category).toBe('チャイルドシート');
      expect(result.categoryInfo.main).toBe('チャイルドシート');
    });

    test('should prioritize "おむつ" over generic categories', () => {
      const item: Partial<CreatorsAPIItem> = {
        browseNodeInfo: {
          browseNodes: [
            { id: '1', displayName: '介護用品・生理用品', contextFreeName: 'Health' },
            { id: '2', displayName: 'おむつ', contextFreeName: 'Diapers' },
          ],
        },
      };

      const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
      // "介護用品・生理用品" is blocked, so only "おむつ" remains.
      expect(result.category).toBe('おむつ');
    });
  });
});
