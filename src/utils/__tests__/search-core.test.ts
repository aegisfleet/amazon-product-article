import Fuse from 'fuse.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SearchCore = require('../../../static/js/search-core.js');

interface TestProduct {
  asin: string;
  title: string;
  brand?: string;
  categories: string[];
  amazon_category?: string;
  summary: string;
  specs: string;
  price_value: number | null | undefined;
  price?: string;
  score: number;
  last_investigated: string;
  permalink: string;
}

function createSearchFixture() {
  const products: TestProduct[] = [
    {
      asin: 'B0SONY0001',
      title: 'ソニー ワイヤレスイヤホン WF-1000XM5 ノイズキャンセリング',
      brand: 'ソニー',
      categories: ['イヤホン・ヘッドホン'],
      amazon_category: 'イヤホン',
      summary: '業界最高クラスのノイズキャンセリング性能を備えた完全ワイヤレスイヤホン。',
      specs: 'Bluetooth 5.3 ANC',
      price_value: 33000,
      price: '33,000円',
      score: 92,
      last_investigated: '2026-11-10T00:00:00Z',
      permalink: '/b0sony0001/',
    },
    {
      asin: 'B0SONY0002',
      title: 'Sony LinkBuds S ワイヤレスイヤホン',
      brand: 'Sony',
      categories: ['イヤホン・ヘッドホン'],
      amazon_category: 'イヤホン',
      summary: '軽量コンパクトなSony製ワイヤレスイヤホン。',
      specs: 'ANC USB-C',
      price_value: 21000,
      price: '21,000円',
      score: 86,
      last_investigated: '2026-11-05T00:00:00Z',
      permalink: '/b0sony0002/',
    },
    {
      asin: 'B0SONY0003',
      title: 'SONY ワイヤレスステレオヘッドセット WF-C700N',
      brand: 'SONY',
      categories: ['イヤホン・ヘッドホン'],
      amazon_category: 'イヤホン',
      summary: 'コスパに優れたノイキャン対応ワイヤレスイヤホン。',
      specs: 'ノイズキャンセリング',
      price_value: 14000,
      price: '14,000円',
      score: 82,
      last_investigated: '2026-10-20T00:00:00Z',
      permalink: '/b0sony0003/',
    },
    {
      asin: 'B0APPLE001',
      title: 'Apple AirPods 5 アクティブノイズキャンセリング搭載',
      brand: 'Apple',
      categories: ['イヤホン・ヘッドホン'],
      amazon_category: 'イヤホン',
      summary: '高いノイキャン性能と空間オーディオに対応したワイヤレスイヤホン。',
      specs: 'ANC USB-C',
      price_value: 29800,
      price: '29,800円',
      score: 93,
      last_investigated: '2026-11-18T00:00:00Z',
      permalink: '/b0apple001/',
    },
    {
      asin: 'B0ANKER001',
      title: 'Anker PowerCore 10000 モバイルバッテリー',
      brand: 'Anker',
      categories: ['モバイルバッテリー'],
      amazon_category: 'モバイルバッテリー',
      summary: '薄型軽量の定番モバイルバッテリー。USB-C入力対応。',
      specs: '10000mAh USB-C',
      price_value: 3490,
      price: '3,490円',
      score: 88,
      last_investigated: '2026-11-15T00:00:00Z',
      permalink: '/b0anker001/',
    },
    {
      asin: 'B0NOPRICE1',
      title: 'Forticu 電熱ベスト モバイルバッテリー対応',
      brand: 'Forticu',
      categories: ['電熱ベスト'],
      amazon_category: 'ウェア',
      summary: '市販のモバイルバッテリーで発熱する防寒ベスト。',
      specs: 'USB給電',
      price_value: null,
      price: '',
      score: 75,
      last_investigated: '2026-11-01T00:00:00Z',
      permalink: '/b0noprice1/',
    },
    {
      asin: 'B0CHG00001',
      title: 'Anker Nano II 65W USB-C 急速充電器',
      brand: 'Anker',
      categories: ['充電器'],
      amazon_category: '充電器',
      summary: 'ノートPCも充電できる65W出力のType-C充電器。',
      specs: '65W USB-C',
      price_value: 4490,
      price: '4,490円',
      score: 90,
      last_investigated: '2026-11-12T00:00:00Z',
      permalink: '/b0chg00001/',
    },
    {
      asin: 'B0CHG00002',
      title: 'CIO NovaPort SOLO 65W 充電器',
      brand: 'CIO',
      categories: ['充電器'],
      amazon_category: '充電器',
      summary: '超小型で65W対応のType-C急速充電器。',
      specs: '65W Type-C',
      price_value: 3980,
      price: '3,980円',
      score: 85,
      last_investigated: '2026-11-20T00:00:00Z',
      permalink: '/b0chg00002/',
    },
    {
      asin: 'B0OPITION1',
      title: 'Ｏｐｉｔｉｏｎ スマートウォッチ 防水',
      brand: 'Ｏｐｉｔｉｏｎ',
      categories: ['スマートウォッチ'],
      amazon_category: 'スマートウォッチ',
      summary: '全角ブランド名のスマートウォッチ。',
      specs: 'IP68',
      price_value: 5980,
      price: '5,980円',
      score: 78,
      last_investigated: '2026-10-01T00:00:00Z',
      permalink: '/b0opition1/',
    },
    {
      asin: 'B0BOUND001',
      title: 'Performance Monitor 27インチ',
      brand: 'Generic',
      categories: ['モニター'],
      amazon_category: 'モニター',
      summary: 'Algorithm optimization display without noise cancelling.',
      specs: '4K',
      price_value: 35000,
      price: '35,000円',
      score: 80,
      last_investigated: '2026-10-10T00:00:00Z',
      permalink: '/b0bound001/',
    },
    {
      asin: 'B0LG000001',
      title: 'LG UltraGear ゲーミングモニター',
      brand: 'LG',
      categories: ['モニター'],
      amazon_category: 'モニター',
      summary: 'エルジー製の高リフレッシュレートモニター。',
      specs: '144Hz',
      price_value: 42000,
      price: '42,000円',
      score: 89,
      last_investigated: '2026-11-08T00:00:00Z',
      permalink: '/b0lg000001/',
    },
  ];

  SearchCore.prepareSearchIndex(products);
  const fuse = new Fuse(products, {
    keys: [
      { name: 'asin', weight: 1 },
      { name: '_norm_title', weight: 0.8 },
      { name: '_norm_summary', weight: 0.5 },
      { name: '_norm_categories', weight: 0.8 },
      { name: '_norm_amazon_category', weight: 0.6 },
      { name: '_norm_specs', weight: 0.3 },
    ],
    threshold: 0.2,
    distance: 100,
    includeScore: true,
    ignoreLocation: true,
    useExtendedSearch: true,
  });

  return { products, fuse };
}

describe('SearchCore', () => {
  describe('S-1: 日英ブランドエイリアスの双方向展開 & NFKC正規化', () => {
    it('Sony ワイヤレスイヤホン と ソニー ワイヤレスイヤホン で同一の商品集合がヒットすること', () => {
      const { products, fuse } = createSearchFixture();
      const filters = { scoreMin: '70' };

      const enRes = SearchCore.searchWithCore(products, fuse, 'Sony ワイヤレスイヤホン', filters);
      const jaRes = SearchCore.searchWithCore(products, fuse, 'ソニー ワイヤレスイヤホン', filters);

      const enAsins = enRes.results.map((r: any) => r.item.asin).sort();
      const jaAsins = jaRes.results.map((r: any) => r.item.asin).sort();

      expect(enAsins).toEqual(['B0SONY0001', 'B0SONY0002', 'B0SONY0003']);
      expect(jaAsins).toEqual(enAsins);
    });

    it('既存のNFKC正規化（半角 opition で全角ブランド Ｏｐｉｔｉｏｎ がヒット）が維持されること', () => {
      const { products, fuse } = createSearchFixture();
      const res = SearchCore.searchWithCore(products, fuse, 'opition', { scoreMin: '70' });
      expect(res.results.map((r: any) => r.item.asin)).toEqual(['B0OPITION1']);
    });

    it('短いASCIIブランド・略称が他語の部分一致で誤爆しないこと（例: LG が algorithm にヒットしない、ANC が performance にヒットしない）', () => {
      const { products, fuse } = createSearchFixture();
      const lgRes = SearchCore.searchWithCore(products, fuse, 'LG モニター', { scoreMin: '70' });
      expect(lgRes.results.map((r: any) => r.item.asin)).toEqual(['B0LG000001']);

      const ancRes = SearchCore.searchWithCore(products, fuse, 'ANC', { scoreMin: '70' });
      const ancAsins = ancRes.results.map((r: any) => r.item.asin);
      expect(ancAsins).not.toContain('B0BOUND001');
      expect(ancAsins).toContain('B0APPLE001');
    });
  });

  describe('S-2: 略語・技術規格の同義語クエリ展開', () => {
    it('モババ で モバイルバッテリー と同等の結果が返ること', () => {
      const { products, fuse } = createSearchFixture();
      const filters = { scoreMin: '70' };

      const mobabaRes = SearchCore.searchWithCore(products, fuse, 'モババ', filters);
      const fullRes = SearchCore.searchWithCore(products, fuse, 'モバイルバッテリー', filters);

      expect(mobabaRes.results.map((r: any) => r.item.asin)).toEqual(fullRes.results.map((r: any) => r.item.asin));
      expect(mobabaRes.results[0].item.asin).toBe('B0ANKER001');
    });

    it('Type-C 充電器 65W と USB-C 充電器 65W の結果集合が一致すること', () => {
      const { products, fuse } = createSearchFixture();
      const filters = { scoreMin: '70' };

      const typeCRes = SearchCore.searchWithCore(products, fuse, 'Type-C 充電器 65W', filters);
      const usbCRes = SearchCore.searchWithCore(products, fuse, 'USB-C 充電器 65W', filters);

      const typeCAsins = typeCRes.results.map((r: any) => r.item.asin).sort();
      const usbCAsins = usbCRes.results.map((r: any) => r.item.asin).sort();

      expect(typeCAsins).toEqual(['B0CHG00001', 'B0CHG00002']);
      expect(usbCAsins).toEqual(typeCAsins);
    });

    it('ノイキャン イヤホン で AirPods 5 を含む ノイズキャンセリング イヤホン と同等の結果が返ること', () => {
      const { products, fuse } = createSearchFixture();
      const filters = { scoreMin: '70' };

      const shortRes = SearchCore.searchWithCore(products, fuse, 'ノイキャン イヤホン', filters);
      const fullRes = SearchCore.searchWithCore(products, fuse, 'ノイズキャンセリング イヤホン', filters);

      const shortAsins = shortRes.results.map((r: any) => r.item.asin).sort();
      const fullAsins = fullRes.results.map((r: any) => r.item.asin).sort();

      expect(shortAsins).toEqual(fullAsins);
      expect(shortAsins).toContain('B0APPLE001');
      expect(shortAsins).toContain('B0SONY0001');
    });
  });

  describe('S-3: maxPrice / minPrice 指定時の価格情報なし商品除外', () => {
    it('価格上限 1円 指定時は「価格情報なし」商品が除外されて 0件 になること', () => {
      const { products, fuse } = createSearchFixture();
      const res = SearchCore.searchWithCore(products, fuse, 'モバイルバッテリー', {
        scoreMin: '70',
        priceMax: '1',
      });

      expect(res.results).toHaveLength(0);
      expect(res.unfilteredPriceCount).toBe(2);
    });

    it('価格下限 100円 指定時も「価格情報なし」商品が除外されること', () => {
      const { products, fuse } = createSearchFixture();
      const res = SearchCore.searchWithCore(products, fuse, 'モバイルバッテリー', {
        scoreMin: '70',
        priceMin: '100',
      });

      expect(res.results.map((r: any) => r.item.asin)).toEqual(['B0ANKER001']);
    });

    it('価格フィルタ未指定時は「価格情報なし」商品も従来通り結果に含まれること', () => {
      const { products, fuse } = createSearchFixture();
      const res = SearchCore.searchWithCore(products, fuse, 'モバイルバッテリー', {
        scoreMin: '70',
      });

      const asins = res.results.map((r: any) => r.item.asin);
      expect(asins).toContain('B0ANKER001');
      expect(asins).toContain('B0NOPRICE1');
    });
  });

  describe('S-4: 並び替え（関連度順・スコア順・価格が安い順・新着順）と価格0件緩和カウント', () => {
    it('価格が安い順では、タイトル・カテゴリ一致バケットが説明文のみ一致より前になり、価格未取得は末尾になること', () => {
      const { products, fuse } = createSearchFixture();
      const res = SearchCore.searchWithCore(products, fuse, 'モバイルバッテリー', {
        scoreMin: '70',
        sort: 'price-asc',
      });

      const asins = res.results.map((r: any) => r.item.asin);
      expect(asins[0]).toBe('B0ANKER001');
      expect(asins[asins.length - 1]).toBe('B0NOPRICE1');
    });

    it('スコア順では高スコア商品が先頭に並び、一次一致バケットが優先されること', () => {
      const { products, fuse } = createSearchFixture();
      const res = SearchCore.searchWithCore(products, fuse, '充電器 65W', {
        scoreMin: '70',
        sort: 'score',
      });

      expect(res.results.map((r: any) => r.item.asin)).toEqual(['B0CHG00001', 'B0CHG00002']);
    });

    it('新着順では last_investigated が新しい順に並ぶこと', () => {
      const { products, fuse } = createSearchFixture();
      const res = SearchCore.searchWithCore(products, fuse, '充電器 65W', {
        scoreMin: '70',
        sort: 'newest',
      });

      expect(res.results.map((r: any) => r.item.asin)).toEqual(['B0CHG00002', 'B0CHG00001']);
    });
  });

  describe('dealBadge フィルタリング', () => {
    it('matchesDealBadge が完全一致・__ANY_DEAL__・event: 接頭辞を正しく判定すること', () => {
      expect(SearchCore.matchesDealBadge({ deal_badge: '厳選目玉商品' }, '')).toBe(true);
      expect(SearchCore.matchesDealBadge({ deal_badge: '厳選目玉商品' }, '__ANY_DEAL__')).toBe(true);
      expect(SearchCore.matchesDealBadge({ deal_badge: '' }, '__ANY_DEAL__')).toBe(false);
      expect(SearchCore.matchesDealBadge({ deal_badge: '厳選目玉商品' }, '厳選目玉商品')).toBe(true);
      expect(SearchCore.matchesDealBadge({ deal_badge: 'タイムセール' }, '厳選目玉商品')).toBe(false);
      expect(
        SearchCore.matchesDealBadge({ deal_badge: 'ブラックフライデー先行セール' }, 'event:ブラックフライデー'),
      ).toBe(true);
      expect(
        SearchCore.matchesDealBadge({ deal_badge: 'ブラックフライデープライムセール' }, 'event:ブラックフライデー'),
      ).toBe(true);
      expect(SearchCore.matchesDealBadge({ deal_badge: 'タイムセール' }, 'event:ブラックフライデー')).toBe(false);
    });

    it('空クエリでも dealBadge 指定時は一致商品を返すこと', () => {
      const items = [
        { asin: 'B0001', title: '商品A', score: 85, price: '￥1,000', price_value: 1000, deal_badge: '厳選目玉商品' },
        { asin: 'B0002', title: '商品B', score: 90, price: '￥2,000', price_value: 2000, deal_badge: 'タイムセール' },
        { asin: 'B0003', title: '商品C', score: 80, price: '￥3,000', price_value: 3000, deal_badge: '' },
      ];
      SearchCore.prepareSearchIndex(items);

      const featured = SearchCore.searchWithCore(items, null, '', {
        scoreMin: '70',
        dealBadge: '厳選目玉商品',
      });
      expect(featured.results.map((r: any) => r.item.asin)).toEqual(['B0001']);

      const anyDeal = SearchCore.searchWithCore(items, null, '', {
        scoreMin: '70',
        dealBadge: '__ANY_DEAL__',
      });
      expect(anyDeal.results.map((r: any) => r.item.asin).sort()).toEqual(['B0001', 'B0002']);
    });
  });

  describe('カテゴリー絞り込み', () => {
    it('matchesCategory が親カテゴリ・子カテゴリを正しく判定すること', () => {
      const item = {
        asin: 'B0010',
        category_parent: 'オーディオ／イヤホン',
        categories: ['ワイヤレスイヤホン'],
      };
      expect(SearchCore.matchesCategory(item, '', '')).toBe(true);
      expect(SearchCore.matchesCategory(item, 'オーディオ／イヤホン', '')).toBe(true);
      expect(SearchCore.matchesCategory(item, 'オーディオ／イヤホン', 'ワイヤレスイヤホン')).toBe(true);
      expect(SearchCore.matchesCategory(item, '', 'ワイヤレスイヤホン')).toBe(true);
      expect(SearchCore.matchesCategory(item, '家電', '')).toBe(false);
      expect(SearchCore.matchesCategory(item, 'オーディオ／イヤホン', '有線イヤホン')).toBe(false);
    });

    it('空クエリでも categoryParent / categoryChild 指定時は一致商品を返すこと', () => {
      const items = [
        {
          asin: 'B0001',
          title: 'イヤホンA',
          score: 85,
          category_parent: 'オーディオ／イヤホン',
          categories: ['ワイヤレスイヤホン'],
        },
        {
          asin: 'B0002',
          title: 'イヤホンB',
          score: 80,
          category_parent: 'オーディオ／イヤホン',
          categories: ['有線イヤホン'],
        },
        {
          asin: 'B0003',
          title: '本C',
          score: 90,
          category_parent: '本／音楽／エンタメ',
          categories: ['コミック・ラノベ'],
        },
      ];
      SearchCore.prepareSearchIndex(items);

      const parentMatched = SearchCore.searchWithCore(items, null, '', {
        scoreMin: '70',
        categoryParent: 'オーディオ／イヤホン',
      });
      expect(parentMatched.results.map((r: any) => r.item.asin).sort()).toEqual(['B0001', 'B0002']);

      const childMatched = SearchCore.searchWithCore(items, null, '', {
        scoreMin: '70',
        categoryParent: 'オーディオ／イヤホン',
        categoryChild: 'ワイヤレスイヤホン',
      });
      expect(childMatched.results.map((r: any) => r.item.asin)).toEqual(['B0001']);
    });
  });
});
