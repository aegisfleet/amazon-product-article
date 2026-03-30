import { CategoryNormalizer } from '../CategoryNormalizer';

describe('CategoryNormalizer', () => {
  describe('sanitizeCategoryName', () => {
    const sanitize = (name: string) => (CategoryNormalizer as any).sanitizeCategoryName(name);

    it('should normalize multiple spaces to a single half-width space', () => {
      expect(sanitize('L-シトルリン  サプリメント')).toBe('L-シトルリン サプリメント');
      expect(sanitize('L-シトルリン　サプリメント')).toBe('L-シトルリン サプリメント');
    });

    it('should remove text inside parentheses', () => {
      expect(sanitize('マルチビタミン (30日分)')).toBe('マルチビタミン');
      expect(sanitize('プロテイン【Amazon限定】')).toBe('プロテイン');
    });

    it('should trim leading and trailing spaces', () => {
      expect(sanitize('  サプリメント  ')).toBe('サプリメント');
    });
  });

  describe('isValidCategoryName', () => {
    it('should allow category names with parentheses', () => {
      expect(CategoryNormalizer.isValidCategoryName('マルチビタミン (30日分)')).toBe(true);
    });

    it('should reject obviously invalid names', () => {
      expect(CategoryNormalizer.isValidCategoryName('キャンペーンページ')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('クーポン対象')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should handle typical supplement browse nodes', () => {
      const browseNodes: any = [
        {
          displayName: 'ドラッグストア',
          contextFreeName: 'ドラッグストア'
        },
        {
          displayName: 'サプリメント・ビタミン',
          contextFreeName: 'サプリメント・ビタミン'
        },
        {
          displayName: 'アミノ酸',
          contextFreeName: 'アミノ酸'
        },
        {
          displayName: 'L-シトルリン  サプリメント', // 連続スペース
          contextFreeName: 'L-シトルリン サプリメント'
        }
      ];

      // Build hierarchy
      browseNodes[3].ancestor = browseNodes[2];
      browseNodes[2].ancestor = browseNodes[1];
      browseNodes[1].ancestor = browseNodes[0];

      const result = CategoryNormalizer.normalize(browseNodes[3]);
      expect(result.main).toBe('L-シトルリン サプリメント');
      expect(result.score).toBeGreaterThan(0); // Should have a score due to "サプリメント" keyword
    });

    it('should prefer supplement-related categories when multiple candidates exist', () => {
      const browseNodes: any = [
        { displayName: '食品・飲料・お酒', contextFreeName: '食品・飲料・お酒' },
        { displayName: 'サプリメント', contextFreeName: 'サプリメント' }
      ];
      const result = CategoryNormalizer.normalize(browseNodes[1]);
      expect(result.main).toBe('サプリメント');
    });
  });
});
