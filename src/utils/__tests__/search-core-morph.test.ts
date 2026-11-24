// eslint-disable-next-line @typescript-eslint/no-require-imports
const SearchCore = require('../../../static/js/search-core.js');

interface MorphFixtureProduct {
  asin: string;
  title: string;
  brand: string;
  categories: string[];
  amazon_category: string;
  summary: string;
  specs: string;
  price_value: number;
  score: number;
  last_investigated: string;
  permalink: string;
}

const PRODUCTS: MorphFixtureProduct[] = [
  {
    asin: 'B0MORPH001',
    title: 'ハイアール 衣類ケア乾燥機 FUWATO 9.0kg JZ-K90A(W)',
    brand: 'ハイアール',
    // Mirrors the real catalog: FUWATO is filed under large appliances,
    // so the category text does not rescue the substring search.
    categories: ['冷蔵庫・洗濯機・大型'],
    amazon_category: 'その他／全般',
    summary: 'ヒートポンプ式の衣類ケア乾燥機。',
    specs: '乾燥容量: 9.0kg',
    price_value: 91134,
    score: 88,
    last_investigated: '2026-11-24T00:00:00Z',
    permalink: '/b0morph001/',
  },
  {
    asin: 'B0MORPH002',
    title: 'シャープ 洗濯乾燥機 11kg',
    brand: 'シャープ',
    categories: ['冷蔵庫・洗濯機・大型'],
    amazon_category: '洗濯乾燥機',
    summary: '洗濯から乾燥まで一台で。',
    specs: '洗濯容量: 11kg',
    price_value: 150000,
    score: 85,
    last_investigated: '2026-11-24T00:00:00Z',
    permalink: '/b0morph002/',
  },
  {
    asin: 'B0MORPH003',
    title: 'レイコップ ふとん乾燥機 RFK-300',
    brand: 'レイコップ',
    // Mirrors the real catalog filing for the futon dryer.
    categories: ['アイロン・衣類ケア・電池小物'],
    amazon_category: '衣類・ふとん乾燥機本体',
    summary: '布団を乾燥してダニ対策。',
    specs: '',
    price_value: 15000,
    score: 80,
    last_investigated: '2026-11-24T00:00:00Z',
    permalink: '/b0morph003/',
  },
  {
    asin: 'B0MORPH004',
    title: 'シャープ 衣類乾燥除湿機 CV-S71-W',
    brand: 'シャープ',
    categories: ['衣類乾燥除湿機'],
    amazon_category: '除湿機',
    summary: '衣類乾燥に使える除湿機。',
    specs: '',
    price_value: 25000,
    score: 78,
    last_investigated: '2026-11-24T00:00:00Z',
    permalink: '/b0morph004/',
  },
];

// The shape scripts/generate_search_morphs.py emits (Sudachi SplitMode B
// morphemes, normalized_form + NFKC). Note B0MORPH003 carries 布団 in its
// doc morphemes because the summary mentions 布団, while its title only
// has the ふとん surface.
const MORPH_DATA = {
  B0MORPH001: {
    m: '9.0kg fuwato jz-k90a ケア ハイアール ヒートポンプ 乾燥機 式 衣類',
    t: '9.0kg fuwato jz-k90a ケア ハイアール 乾燥機 衣類',
  },
  B0MORPH002: { m: '11kg シャープ 乾燥 乾燥機 洗濯', t: '11kg シャープ 乾燥機 洗濯' },
  B0MORPH003: {
    m: 'ふとん レイコップ 乾燥 乾燥機 布団 ダニ 対策',
    t: 'ふとん レイコップ 乾燥機',
  },
  B0MORPH004: { m: 'cv-s71-w シャープ 乾燥 除湿機 衣類', t: 'シャープ 乾燥 除湿機 衣類' },
};

// Site-normalized surface -> morpheme, as generated into search-vocab.json.
const VOCAB_DATA = {
  衣類: '衣類',
  乾燥機: '乾燥機',
  ケア: 'ケア',
  布団: '布団',
  ふとん: 'ふとん',
  洗濯: '洗濯',
  洗濯機: '洗濯機',
  除湿機: '除湿機',
  乾燥: '乾燥',
};

function freshItems() {
  return PRODUCTS.map((p) => ({ ...p }));
}

function resultAsins(query: string): string[] {
  const { results } = SearchCore.searchExpanded(freshItemsPrepared, query);
  return results.map((r: { item: MorphFixtureProduct }) => r.item.asin);
}

let freshItemsPrepared: ReturnType<typeof freshItems>;

describe('search-core morpheme matching', () => {
  // This case must run before prepareMorphIndex is ever called in this
  // file: without morpheme data the search degrades to substring-only.
  test('without morph data, 衣類乾燥機 does not reach 衣類ケア乾燥機', () => {
    freshItemsPrepared = SearchCore.prepareSearchIndex(freshItems());
    expect(resultAsins('衣類乾燥機')).not.toContain('B0MORPH001');
    expect(resultAsins('布団乾燥機')).toHaveLength(0);
  });

  describe('with morph data prepared', () => {
    beforeAll(() => {
      freshItemsPrepared = SearchCore.prepareSearchIndex(freshItems());
      SearchCore.prepareMorphIndex(freshItemsPrepared, MORPH_DATA, VOCAB_DATA);
    });

    test('segmentToMorphs splits compounds via the vocabulary', () => {
      expect(SearchCore.segmentToMorphs('衣類乾燥機')).toEqual(new Set(['衣類', '乾燥機']));
      expect(SearchCore.segmentToMorphs('衣類ケア乾燥機')).toEqual(new Set(['衣類', 'ケア', '乾燥機']));
    });

    test('衣類乾燥機 matches 衣類ケア乾燥機 but not washer-dryers or dehumidifiers', () => {
      const asins = resultAsins('衣類乾燥機');
      expect(asins).toContain('B0MORPH001');
      expect(asins).not.toContain('B0MORPH002');
      expect(asins).not.toContain('B0MORPH004');
    });

    test('布団乾燥機 matches the ふとん乾燥機 product', () => {
      expect(resultAsins('布団乾燥機')).toContain('B0MORPH003');
    });

    test('substring matches are preserved (model number)', () => {
      expect(resultAsins('JZ-K90A')).toContain('B0MORPH001');
    });
  });
});
