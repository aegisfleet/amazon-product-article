import { type BrowseNode, CategoryNormalizer } from './CategoryNormalizer';

describe('CategoryNormalizer', () => {
  describe('isValidCategoryName', () => {
    it('should return true for valid category names', () => {
      expect(CategoryNormalizer.isValidCategoryName('electronics')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('books')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('ボードゲーム')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('category_with_dash')).toBe(true);
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
        'ブラックフライデー',
        'ブラックフライデーDealKitchen',
        'ブラックフライデーdealelectronics',
        'お得なブラックフライデーセール',
        '文房具・オフィス用品ヤスいいね対象商品2',
        '文房具・オフィス用品ヤスいいね対象外商品1',
        'UMall',
        '文具・事務用品（その他）',
        '日本ヒルズ・コルゲート199T',
        '引っ越し祝い',
        'Home Gift（ホームギフト）',
        'BrandName変更確認',
        'ブラックフライデー_Deal_Kitchen',
        'BF_Deal',
        'BauhutteYAMAHABXGY',
        'Beauty - AmazonGlobal Free Shipping',
        'Drugstore - AmazonGlobal Free Shipping',
        'Home & Kitchen - AmazonGlobal Free Shipping',
        'SnS Acquisition Test HPC ASINs Low Price',
        'Toys - AmazonGlobal Free Shipping',
        '定期おトク便初回最大30%OFF',
        '定期おトク便',
        'HPCAFC2409under2000',
        'HPCAFC2410under3000',
        'HPCCreatorInfoHubベビーケア・おむつ',
        'hpc recommendation widget',
        'hpc_creatorinfohub',
        'Kindle書籍・本',
        'マッサージャーほか健康家電特集',
        'Home > Kitchen',
        'テスト用カテゴリ',
        'Kindle書籍タイトル 600円～',
        'Drugstore - Amazon Global',
        'L201Skincare01Cat',
        'L205HairBodyCare01Cat',
        'カテゴリ＞収納棚・ボックス',
        'J-POP・日本の音楽',
        'パントリー事務用品テープ・結束具',
        'ベビー・幼児用おもちゃ',
        'ベビー家具・収納',
        'コクヨ　「文房具図鑑 その文具のいい所から悪い所まで最強解説」 掲載文房具',
        'コクヨの文房具・事務用品',
        'PBBeauty9999',
        '3P beauty',
        'CMLBeauty9999',
        'Beautyover2000B',
        'パントリー事務用品テープ・結束具',
        'ベビー・幼児用おもちゃ',
      ];
      invalidNames.forEach((name) => {
        expect(CategoryNormalizer.isValidCategoryName(name)).toBe(false);
      });
    });

    it('should distinguish between "替えブラシ" and "替えブラシS"', () => {
      expect(CategoryNormalizer.isValidCategoryName('替えブラシ')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('替えブラシs')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('替えブラシ_s')).toBe(false);
    });

    it('should handle multi-dot logic correctly', () => {
      expect(CategoryNormalizer.isValidCategoryName('category・subcategory・item')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('a・b・c')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('category・subcategory')).toBe(true);
    });
  });

  describe('normalize', () => {
    it('should extract main and sub categories from ancestor chain', () => {
      const grandParent: BrowseNode = { displayName: 'toys', id: '1' };
      const parent: BrowseNode = { displayName: 'games', id: '2', ancestor: grandParent };
      const leaf: BrowseNode = { displayName: 'board games', id: '3', ancestor: parent };

      const result = CategoryNormalizer.normalize(leaf);
      expect(result).toEqual({
        main: 'board games',
        sub: 'games',
        nameCount: 3,
        score: 0,
      });
    });

    it('should skip invalid categories in the chain', () => {
      const grandParent: BrowseNode = { displayName: 'toys', id: '1' };
      const parent: BrowseNode = { displayName: 'test', id: '2', ancestor: grandParent };
      const leaf: BrowseNode = { displayName: 'board games', id: '3', ancestor: parent };

      const result = CategoryNormalizer.normalize(leaf);
      expect(result).toEqual({
        main: 'board games',
        sub: 'toys',
        nameCount: 2,
        score: 0,
      });
    });

    it('should handle both camelCase and PascalCase properties', () => {
      const node: BrowseNode = { DisplayName: 'valid category', Id: '456' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.main).toBe('valid category');
    });
  });
});
