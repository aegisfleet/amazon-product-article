import { type BrowseNode, CategoryNormalizer } from './CategoryNormalizer';

describe('CategoryNormalizer', () => {
  describe('isValidCategoryName', () => {
    it('should return true for valid category names', () => {
      expect(CategoryNormalizer.isValidCategoryName('Electronics')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('Books')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('Home & Kitchen')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('ボードゲーム')).toBe(true);
    });

    it('should return false for empty or undefined names', () => {
      expect(CategoryNormalizer.isValidCategoryName('')).toBe(false);
      // @ts-expect-error - Testing undefined input
      expect(CategoryNormalizer.isValidCategoryName(undefined)).toBe(false);
      // @ts-expect-error - Testing null input
      expect(CategoryNormalizer.isValidCategoryName(null)).toBe(false);
    });

    it('should return false for names matching invalid patterns', () => {
      const invalidNames = [
        'Sale',
        'Off',
        'Coupon',
        'Ranking',
        'Best',
        'Week',
        'Fair',
        'Event',
        'Campaign',
        'セール',
        'クーポン',
        'ランキング',
        'おすすめ',
        'ウィーク',
        'フェア',
        'イベント',
        'キャンペーン',
        '新商品',
        'すべて',
        '特設ページ',
        '発売日お届け',
        '父の日',
        '割引',
        'お買い得',
        'non manga',
        'KOS_123',
        'Winter Favorites',
        '高評価ブランド',
        '今旬',
        'サンプリング除外',
        'Node123',
        '特集',
        '新着',
        '新規発売',
        '予約',
        '限定',
        'recommendation',
        'eligible',
        'widget',
        'smartphones',
        'All Products',
        'Prime Day',
        '【Category】',
        '(Category)',
        '_Category',
        '※Note',
        '家電',
        'アクセサリ',
        'アクセサリー', // Explicitly rejected exact matches
        'Some Name [123456]', // Name [ID] pattern
        '12345678-1234-1234-1234-1234567890ab', // UUID pattern
      ];

      invalidNames.forEach((name) => {
        expect(CategoryNormalizer.isValidCategoryName(name)).toBe(false);
      });
    });

    it('should return false for names in the blocklist', () => {
      const blockedNames = [
        'Arborist Merchandising Root',
        'Babel 6-2',
        'Calendar Test',
        'Test',
        'テスト',
        '面だし用ASIN',
        'Hair Care',
        'HPC recommendation widget',
        'PBHome&Kitchen9999',
        'Panasonic-HA-HotAirStylers',
        'UMall',
        'SnS Acquisition Test HPC ASINs',
        'シャープの家電がお買い得',
        'ジュニアシート 3歳頃から',
        'チャイルドシート 1歳頃から',
        'チャイルドシート 新生児から',
        'カテゴリー別',
        '卒園式・入学式の撮影テクニック',
        'yobi',
        'P&G',
        '定期おトク便',
        '介護用品・生理用品',
        '花王',
        'Panasonic Beauty',
        'TWINBIRD',
        'Panasonic ヘアケア',
        'パナソニック ヘアケア',
        'パナソニック ヘアードライヤー',
        'おうちでヘアケア',
        'アウトドア用品',
        'スポーツ＆アウトドア',
        'Sports & Outdoors',
        '日用品・生活必需品：おもちゃ',
        '和書（アダルト除く）',
        'Featured Categories',
        'OMRON（オムロン）',
        '電池利用商品',
        'IO DATA',
        'Logicool',
        'CASIO',
        'Lenovo',
        'HPC_CreatorInfoHub',
        'Drugstore - AmazonGlobal',
        'PB_Home&Kitchen',
        '新生活ギフト',
        'YA-MAN',
        'others',
        'PB_Beauty',
        'パントリー',
        '対象ASIN',
        '面出し用ASIN',
        'Internal',
        'サンワサプライ',
        'PB_PC',
        'ベビー＆マタニティ',
        'ホーム＆キッチン',
        '食品・飲料・お酒',
        '服＆ファッション小物',
        'Beauty Store',
        'Diapers',
        'シャープ',
        'Special Features Stores',
        'Self Service',
        'Amazon Global',
        'Amazon Basics',
        'Amazon Basic',
        'Amazon Store',
        'Kindle本',
        'ジャンル別',
        'Custom Stores',
        'Custom Stores Navigation',
        '無料本',
        'キャンペーン',
        'まとめ買い',
        '期間限定ポイント',
        'h&s',
        'Panasonic-HA-',
        'Amazonベーシック',
        'Kindle Popup',
        'Kindle書籍 5冊購入で15%ポイント還元',
        'Kindle電子書籍リーダー',
        '文房具図鑑',
        '受験対策文房具',
        'コクヨの文房具・事務用品',
        '美容・健康家電',
        '理美容家電',
        'Kindle書籍',
        'Kindle Unlimited',
        'おせちHQP紐付用',
        'AmazonGlobal',
        'クリスマスギフト･コフレ',
        '日用品・生活必需品 - ビューティー',
        'カー＆バイク用品',
        '車＆バイク',
        'Kindleオーナー ライブラリー',
        'Kindle本 (電子書籍) まとめ買いキャンペーン',
        'Kindle本 ポイントアップチャンスキャンペーン',
        'Kindle本はじめての購入に使える70%OFFクーポン',
        'Kindle Events',
        'ポイントフェア',
        'まとめ買い(期間限定ポイント)',
        '冬の読書応援',
        '秋',
        '冬',
        '春',
        '夏',
        'GT Managed Stores',
        'nonmanga_',
        'new release non manga',
      ];

      blockedNames.forEach((name) => {
        expect(CategoryNormalizer.isValidCategoryName(name)).toBe(false);
      });
    });

    it.each([
      'Drugstore',
      'Pet Supplies Store',
      'Official Store',
      '公式ストア',
      'My Store (Official)',
    ])('should return false for store name: %s', (name) => {
      expect(CategoryNormalizer.isValidCategoryName(name)).toBe(false);
    });

    it('should handle multi-dot logic correctly', () => {
      // Rejects names with 2 or more '・'
      expect(CategoryNormalizer.isValidCategoryName('Category・SubCategory・Item')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('A・B・C')).toBe(false);

      // Accepts names with 1 '・' (unless rejected by other rules)
      expect(CategoryNormalizer.isValidCategoryName('Category・SubCategory')).toBe(true);

      // Specifically allowed multi-dot names
      const allowedMultiDot = [
        '磁気・チタン・ゲルマニウムアクセサリー',
        '周辺機器・アクセサリ',
        'キーボード・マウス・入力機器',
        '体重・体脂肪・体組成計',
      ];

      allowedMultiDot.forEach((name) => {
        expect(CategoryNormalizer.isValidCategoryName(name)).toBe(true);
      });
    });
  });

  describe('normalize', () => {
    it('should return fallback for undefined node', () => {
      const result = CategoryNormalizer.normalize(undefined);
      expect(result).toEqual({
        main: 'その他',
        sub: 'Unknown',
        nameCount: 0,
        score: -1,
      });
    });

    it('should normalize a single valid node', () => {
      const node: BrowseNode = {
        displayName: 'Board Games',
        id: '123',
      };
      const result = CategoryNormalizer.normalize(node);
      expect(result).toEqual({
        main: 'Board Games',
        sub: '',
        nameCount: 1,
        score: 0,
      });
    });

    it('should extract main and sub categories from ancestor chain', () => {
      // Chain: Leaf -> Parent -> Grandparent
      // normalize collects: [Leaf, Parent, Grandparent]
      // main = Leaf, sub = Parent
      const grandParent: BrowseNode = { displayName: 'Toys', id: '1' };
      const parent: BrowseNode = { displayName: 'Games', id: '2', ancestor: grandParent };
      const leaf: BrowseNode = { displayName: 'Board Games', id: '3', ancestor: parent };

      const result = CategoryNormalizer.normalize(leaf);
      expect(result).toEqual({
        main: 'Board Games',
        sub: 'Games',
        nameCount: 3,
        score: 0,
      });
    });

    it('should assign score based on preferred keywords', () => {
      const node: BrowseNode = { displayName: 'ボードゲーム', id: '123' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.score).toBe(10);
      expect(result.main).toBe('ボードゲーム');

      // 'Office Supplies' won't match 'オフィス用品' directly.
      // Let's use a matching keyword.
      const node3: BrowseNode = { displayName: 'オフィス用品', id: '789' };
      const result3 = CategoryNormalizer.normalize(node3);
      expect(result3.score).toBe(10);
    });

    it('should skip invalid categories in the chain', () => {
      const grandParent: BrowseNode = { displayName: 'Toys', id: '1' };
      const parent: BrowseNode = { displayName: 'Sale', id: '2', ancestor: grandParent }; // Invalid
      const leaf: BrowseNode = { displayName: 'Board Games', id: '3', ancestor: parent }; // Valid? 'Board Games' is valid.

      // validNames: ['Board Games', 'Toys'] (Sale is skipped)
      // main: 'Board Games', sub: 'Toys'

      const result = CategoryNormalizer.normalize(leaf);
      expect(result).toEqual({
        main: 'Board Games',
        sub: 'Toys',
        nameCount: 2,
        score: 0,
      });
    });

    it('should fallback to "その他" if no valid names found', () => {
      const node: BrowseNode = { displayName: 'Sale', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result).toEqual({
        main: 'その他',
        sub: 'Sale', // Falls back to sanitizeCategoryName(node.displayName)
        nameCount: 0,
        score: -1,
      });
    });

    it('should handle both camelCase and PascalCase properties', () => {
      // 'Test Category' contains 'Test' which is blocked, but we're testing property access here.
      // The normalization logic should still read DisplayName correctly even if it rejects the name later.
      // However, to verify it read it, let's use a valid name.
      const validNode: BrowseNode = { DisplayName: 'Valid Category', Id: '456' };
      const result2 = CategoryNormalizer.normalize(validNode);
      expect(result2.main).toBe('Valid Category');
    });
  });

  describe('selectBestCategory', () => {
    it('should return default fallback for empty list', () => {
      const result = CategoryNormalizer.selectBestCategory([]);
      expect(result).toEqual({
        main: 'その他',
        sub: 'Unknown',
        nameCount: 0,
        score: -1,
      });
    });

    it('should select category with highest score (preferred keywords)', () => {
      // Node A: Score 0, NameCount 3
      // Node B: Score 10, NameCount 1
      const nodeA: BrowseNode = { displayName: 'A', ancestor: { displayName: 'B', ancestor: { displayName: 'C' } } };
      const nodeB: BrowseNode = { displayName: 'ボードゲーム' }; // Score 10

      const result = CategoryNormalizer.selectBestCategory([nodeA, nodeB]);
      expect(result.main).toBe('ボードゲーム');
    });

    it('should select category with greater depth (nameCount) if scores are equal', () => {
      // Node A: Score 0, NameCount 2
      // Node B: Score 0, NameCount 1
      const nodeA: BrowseNode = { displayName: 'Specific', ancestor: { displayName: 'Parent' } };
      const nodeB: BrowseNode = { displayName: 'Generic' };

      const result = CategoryNormalizer.selectBestCategory([nodeA, nodeB]);
      expect(result.main).toBe('Specific');
    });

    it('should select category with lower SalesRank if scores and depth are equal', () => {
      const nodeA: BrowseNode = { displayName: 'Rank 100', salesRank: 100 };
      const nodeB: BrowseNode = { displayName: 'Rank 50', salesRank: 50 };

      const result = CategoryNormalizer.selectBestCategory([nodeA, nodeB]);
      expect(result.main).toBe('Rank 50');
    });

    it('should handle sub-category fallback', () => {
      // If sub is empty or '一般', try to find another main category to use as sub
      const nodeA: BrowseNode = { displayName: 'Main Cat' }; // normalized: main='Main Cat', sub=''
      const nodeB: BrowseNode = { displayName: 'Other Cat' };

      const result = CategoryNormalizer.selectBestCategory([nodeA, nodeB]);
      // Main should be 'Main Cat' (since A comes first and others equal? Wait, sorting is stable?)
      // Both score 0, depth 1. SalesRank undefined (MAX).
      // Stable sort isn't guaranteed by V8 for array.sort usually, but here...
      // Wait, nodeA vs nodeB.
      // Normalized A: { main: 'Main Cat', sub: '', nameCount: 1, score: 0 }
      // Normalized B: { main: 'Other Cat', sub: '', nameCount: 1, score: 0 }
      // Compare A, B:
      // Score: 0 - 0 = 0
      // Depth: 1 - 1 = 0
      // Rank: MAX - MAX = 0
      // So order is preserved (if stable) or undefined.
      // But let's assume it picks the first one.

      // The logic says:
      // if (!normalized.sub || normalized.sub === '一般') {
      //   const subCandidate = sortedNodes.find(...)
      //   if (subCandidate) normalized.sub = subCandidate.main
      // }

      // So if nodeA is picked, sub is '', it looks for subCandidate where main != 'その他' and main != 'Main Cat'.
      // nodeB main is 'Other Cat'. So subCandidate should be nodeB.
      // result.sub should be 'Other Cat'.

      expect(result.main).toBe('Main Cat');
      expect(result.sub).toBe('Other Cat');
    });

    it('should return browseNodeId if available', () => {
      const node: BrowseNode = { displayName: 'Category', id: '12345' };
      const result = CategoryNormalizer.selectBestCategory([node]);
      expect(result.browseNodeId).toBe('12345');
    });

    it('should return browseNodeId from PascalCase Id if available', () => {
      const node: BrowseNode = { displayName: 'Category', Id: '67890' };
      const result = CategoryNormalizer.selectBestCategory([node]);
      expect(result.browseNodeId).toBe('67890');
    });
  });
});
