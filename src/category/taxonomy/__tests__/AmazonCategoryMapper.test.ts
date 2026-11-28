import type { ProductCategoryMap } from '../../store/ProductCategoryStore';
import { buildAmazonCategoryMapping } from '../AmazonCategoryMapper';
import type { TaxonomyV2 } from '../types';

const sampleTaxonomy: TaxonomyV2 = {
  version: 2,
  updated_at: '2026-11-27',
  parents: [
    {
      slug: 'audio-equipment',
      name: 'オーディオ／イヤホン',
      icon: '🎧',
      priority: 5,
      legacy_slugs: ['audio-visual'],
      criteria: '',
      children: [
        { slug: 'wireless-earphones', name: 'ワイヤレスイヤホン', criteria: '' },
        { slug: 'wired-earphones', name: '有線イヤホン', criteria: '' },
        { slug: 'zz-audio-other', name: 'その他オーディオ', criteria: '' },
      ],
    },
    {
      slug: 'books-media',
      name: '本／音楽／エンタメ',
      icon: '📚',
      priority: 20,
      criteria: '',
      children: [
        { slug: 'comics-manga', name: 'コミック・ラノベ', criteria: '' },
        { slug: 'novels-literature', name: '小説・文芸', criteria: '' },
        { slug: 'zz-books-other', name: 'その他本', criteria: '' },
      ],
    },
  ],
};

function makeEntry(parent: string, child: string, amazonCat: string) {
  return {
    taxonomy_version: 2,
    category_parent: parent,
    category_child: child,
    amazon_category: amazonCat,
  };
}

describe('buildAmazonCategoryMapping', () => {
  it('最頻値の親・子カテゴリにマッピングすること', () => {
    const store: ProductCategoryMap = {
      A1: makeEntry('books-media', 'comics-manga', 'ライトノベル'),
      A2: makeEntry('books-media', 'comics-manga', 'ライトノベル'),
      A3: makeEntry('books-media', 'novels-literature', 'ライトノベル'),
    };

    const { map, stats } = buildAmazonCategoryMapping(sampleTaxonomy, store);
    expect(map.get('ライトノベル')).toEqual({
      parentSlug: 'books-media',
      childSlug: 'comics-manga',
      parentName: '本／音楽／エンタメ',
      childName: 'コミック・ラノベ',
    });
    expect(stats.mappedExactChildCount).toBe(1);
    expect(stats.ambiguousCount).toBe(0);
  });

  it('同数の場合は taxonomy-v2.json の定義順で決定的にタイブレークすること', () => {
    const store: ProductCategoryMap = {
      A1: makeEntry('audio-equipment', 'wired-earphones', 'イヤホン'),
      A2: makeEntry('audio-equipment', 'wireless-earphones', 'イヤホン'),
    };

    const { map } = buildAmazonCategoryMapping(sampleTaxonomy, store, { minConfidence: 0.5 });
    expect(map.get('イヤホン')?.childSlug).toBe('wireless-earphones');
  });

  it('子がしきい値未満でも親カテゴリでしきい値以上なら親の zz-* にフォールバックすること', () => {
    const store: ProductCategoryMap = {
      A1: makeEntry('audio-equipment', 'wireless-earphones', 'オーディオ関連'),
      A2: makeEntry('audio-equipment', 'wired-earphones', 'オーディオ関連'),
      A3: makeEntry('books-media', 'comics-manga', 'オーディオ関連'),
    };

    const { map, stats } = buildAmazonCategoryMapping(sampleTaxonomy, store, { minConfidence: 0.6 });
    expect(map.get('オーディオ関連')).toEqual({
      parentSlug: 'audio-equipment',
      childSlug: 'zz-audio-other',
      parentName: 'オーディオ／イヤホン',
      childName: 'その他オーディオ',
    });
    expect(stats.mappedParentFallbackCount).toBe(1);
  });

  it('親カテゴリもしきい値未満の曖昧なカテゴリはマッピングしないこと', () => {
    const store: ProductCategoryMap = {
      A1: makeEntry('audio-equipment', 'wireless-earphones', '雑貨'),
      A2: makeEntry('books-media', 'comics-manga', '雑貨'),
    };

    const { map, stats } = buildAmazonCategoryMapping(sampleTaxonomy, store, { minConfidence: 0.6 });
    expect(map.has('雑貨')).toBe(false);
    expect(stats.ambiguousCount).toBe(1);
  });

  it('削除された子スラッグでも親の legacy_slugs から現行親の zz-* へ解決すること', () => {
    const store: ProductCategoryMap = {
      A1: makeEntry('audio-visual', 'removed-child', '旧オーディオ機器'),
    };

    const { map } = buildAmazonCategoryMapping(sampleTaxonomy, store);
    expect(map.get('旧オーディオ機器')).toEqual({
      parentSlug: 'audio-equipment',
      childSlug: 'zz-audio-other',
      parentName: 'オーディオ／イヤホン',
      childName: 'その他オーディオ',
    });
  });

  it('存在しないスラッグは集計対象外とし unresolvedEntries に計上すること', () => {
    const store: ProductCategoryMap = {
      A1: makeEntry('deleted-parent', 'deleted-child', '不明カテゴリ'),
    };

    const { map, stats } = buildAmazonCategoryMapping(sampleTaxonomy, store);
    expect(map.has('不明カテゴリ')).toBe(false);
    expect(stats.unresolvedEntries).toBe(1);
  });
});
