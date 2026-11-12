import type { ProductCategoryMap } from '../../../category/store/ProductCategoryStore';
import { mergeCategoryContent, mergeProductCategories, parseCategoryJSONSafe } from '../merge-product-categories';

function entry(child: string, classifiedAt?: string): ProductCategoryMap[string] {
  return {
    taxonomy_version: 2,
    category_parent: 'home-kitchen',
    category_child: child,
    classification: {
      source: 'gemini-decision-1',
      parent_confidence: 1,
      child_confidence: 1,
      classified_at: classifiedAt ?? '2026-01-01T00:00:00.000Z',
      input_hash: 'hash',
      needs_review: false,
    },
  };
}

describe('merge-product-categories', () => {
  describe('mergeProductCategories', () => {
    it('双方にのみ存在するASINをすべて保持する（キーの和集合）', () => {
      const ours: ProductCategoryMap = { ASIN_OURS: entry('cups') };
      const theirs: ProductCategoryMap = { ASIN_THEIRS: entry('pans') };

      const { merged, addedFromOurs, updatedFromOurs, keptTheirs } = mergeProductCategories(ours, theirs);

      expect(Object.keys(merged).sort()).toEqual(['ASIN_OURS', 'ASIN_THEIRS']);
      expect(merged.ASIN_OURS).toEqual(ours.ASIN_OURS);
      expect(merged.ASIN_THEIRS).toEqual(theirs.ASIN_THEIRS);
      expect(addedFromOurs).toBe(1);
      expect(updatedFromOurs).toBe(0);
      expect(keptTheirs).toBe(0);
    });

    it('同一ASINでは分類日時が新しい方を採用する（ours が新しい）', () => {
      const ours: ProductCategoryMap = {
        ASIN1: entry('new-child', '2026-11-12T10:00:00.000Z'),
      };
      const theirs: ProductCategoryMap = {
        ASIN1: entry('old-child', '2026-11-11T10:00:00.000Z'),
      };

      const { merged, updatedFromOurs, keptTheirs } = mergeProductCategories(ours, theirs);

      expect(merged.ASIN1?.category_child).toBe('new-child');
      expect(updatedFromOurs).toBe(1);
      expect(keptTheirs).toBe(0);
    });

    it('同一ASINでは分類日時が新しい方を採用する（theirs が新しい）', () => {
      const ours: ProductCategoryMap = {
        ASIN1: entry('old-child', '2026-11-11T10:00:00.000Z'),
      };
      const theirs: ProductCategoryMap = {
        ASIN1: entry('new-child', '2026-11-12T10:00:00.000Z'),
      };

      const { merged, updatedFromOurs, keptTheirs } = mergeProductCategories(ours, theirs);

      expect(merged.ASIN1?.category_child).toBe('new-child');
      expect(updatedFromOurs).toBe(0);
      expect(keptTheirs).toBe(1);
    });

    it('分類日時が同一・未設定の場合は ours を優先する', () => {
      const ours: ProductCategoryMap = { ASIN1: entry('ours-child') };
      const theirs: ProductCategoryMap = { ASIN1: entry('theirs-child') };

      const { merged } = mergeProductCategories(ours, theirs);

      expect(merged.ASIN1?.category_child).toBe('ours-child');
    });
  });

  describe('parseCategoryJSONSafe', () => {
    it('空文字は空オブジェクトとして扱う', () => {
      expect(parseCategoryJSONSafe('')).toEqual({});
      expect(parseCategoryJSONSafe('   ')).toEqual({});
    });

    it('不正なJSONでも例外を投げず空オブジェクトを返す', () => {
      expect(parseCategoryJSONSafe('{ broken json')).toEqual({});
    });

    it('配列などオブジェクト以外のJSONは空オブジェクトとして扱う', () => {
      expect(parseCategoryJSONSafe('[]')).toEqual({});
    });
  });

  describe('mergeCategoryContent', () => {
    it('コンフリクトした2つのJSON文字列をASIN単位で統合する', () => {
      const oursStr = JSON.stringify({
        ASIN_B: entry('b-child', '2026-11-12T00:00:00.000Z'),
        ASIN_SHARED: entry('shared-new', '2026-11-12T00:00:00.000Z'),
      });
      const theirsStr = JSON.stringify({
        ASIN_A: entry('a-child', '2026-11-11T00:00:00.000Z'),
        ASIN_SHARED: entry('shared-old', '2026-11-11T00:00:00.000Z'),
      });

      const { merged, result } = mergeCategoryContent(oursStr, theirsStr);

      expect(Object.keys(merged).sort()).toEqual(['ASIN_A', 'ASIN_B', 'ASIN_SHARED']);
      expect(merged.ASIN_SHARED?.category_child).toBe('shared-new');
      expect(result.addedFromOurs).toBe(1);
      expect(result.updatedFromOurs).toBe(1);
      expect(result.keptTheirs).toBe(0);
    });

    it('片方が空でも他方の内容を保持する', () => {
      const { merged } = mergeCategoryContent('', JSON.stringify({ ASIN_A: entry('a-child') }));
      expect(Object.keys(merged)).toEqual(['ASIN_A']);
    });
  });
});
