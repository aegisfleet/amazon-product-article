import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type CatalogProductRecord,
  convertCacheEntryToCatalogRecord,
  generateCatalogData,
  getShardKey,
  toCatalogIndexRecord,
} from '../generate-catalog-data';

describe('generateCatalogData', () => {
  let tempDir: string;
  let cacheDir: string;
  let articlesDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'catalog-data-test-'));
    cacheDir = path.join(tempDir, 'data', 'cache', 'paapi');
    articlesDir = path.join(tempDir, 'content', 'articles');
    outputDir = path.join(tempDir, 'static', 'catalog-data');
    await fs.promises.mkdir(cacheDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('getShardKey', () => {
    it('ASIN末尾2文字を大文字で返すこと', () => {
      expect(getShardKey('b006mb9700')).toBe('00');
      expect(getShardKey('B07DY4XYND')).toBe('ND');
    });
  });

  describe('convertCacheEntryToCatalogRecord', () => {
    it('valid なキャッシュエントリをカタログレコードに変換できること', () => {
      const record = convertCacheEntryToCatalogRecord(
        'b006mb9700',
        {
          status: 'valid',
          timestamp: 1795657280855,
          previousPrice: 1080,
          priceChangedAt: 1793496412702,
          data: {
            asin: 'B006MB9700',
            title: 'テスト商品',
            brand: 'テストブランド',
            category: 'ウクレレ弦',
            detailPageUrl: 'https://www.amazon.co.jp/dp/B006MB9700?tag=aegis-22',
            availability: '在庫あり。',
            releaseDate: '2024-01-01T00:00:01Z',
            price: { amount: 982 },
            images: { primary: 'https://m.media-amazon.com/images/I/test.jpg' },
          },
        },
        false,
      );

      expect(record).toEqual({
        asin: 'B006MB9700',
        title: 'テスト商品',
        brand: 'テストブランド',
        price: 982,
        previous_price: 1080,
        price_changed_at: new Date(1793496412702).toISOString(),
        availability: '在庫あり。',
        image: 'https://m.media-amazon.com/images/I/test.jpg',
        amazon_category: 'ウクレレ弦',
        release_date: '2024-01-01T00:00:01Z',
        detail_page_url: 'https://www.amazon.co.jp/dp/B006MB9700?tag=aegis-22',
        price_as_of: new Date(1795657280855).toISOString(),
        investigated: false,
      });
    });

    it('status が valid でないエントリは null を返すこと', () => {
      expect(
        convertCacheEntryToCatalogRecord(
          'B006MB9700',
          { status: 'invalid', timestamp: 1795657280855, data: { title: 'x' } },
          false,
        ),
      ).toBeNull();
      expect(
        convertCacheEntryToCatalogRecord(
          'B006MB9700',
          { status: 'permanent_invalid', timestamp: 1795657280855, data: { title: 'x' } },
          false,
        ),
      ).toBeNull();
    });

    it('price.amount が 0 または欠落している場合は price: null になること', () => {
      const zeroPrice = convertCacheEntryToCatalogRecord(
        'B006MB9700',
        { status: 'valid', timestamp: 1795657280855, data: { title: 'x', price: { amount: 0 } } },
        false,
      );
      expect(zeroPrice?.price).toBeNull();

      const missingPrice = convertCacheEntryToCatalogRecord(
        'B006MB9700',
        { status: 'valid', timestamp: 1795657280855, data: { title: 'x' } },
        true,
      );
      expect(missingPrice?.price).toBeNull();
      expect(missingPrice?.previous_price).toBeUndefined();
      expect(missingPrice?.price_changed_at).toBeUndefined();
      expect(missingPrice?.investigated).toBe(true);
    });
    it('priceTimestamp がある場合は timestamp より優先して price_as_of に使われること', () => {
      const oldPriceTime = 1793496412702;
      const newCacheTime = 1795657280855;
      const record = convertCacheEntryToCatalogRecord(
        'B006MB9700',
        {
          status: 'valid',
          timestamp: newCacheTime,
          priceTimestamp: oldPriceTime,
          data: { title: 'x', price: { amount: 1064 } },
        },
        false,
      );
      expect(record?.price_as_of).toBe(new Date(oldPriceTime).toISOString());
    });
  });

  describe('toCatalogIndexRecord', () => {
    it('検索に必要なフィールドのみを残し、アフィリエイトリンクや価格変動履歴を含まないこと', () => {
      const indexRecord = toCatalogIndexRecord({
        asin: 'B006MB9700',
        title: 'テスト商品',
        brand: 'テストブランド',
        price: 982,
        previous_price: 1080,
        price_changed_at: '2026-01-01T00:00:00.000Z',
        availability: '在庫あり。',
        image: 'https://example.com/i.jpg',
        amazon_category: 'ウクレレ弦',
        release_date: '2024-01-01T00:00:01Z',
        detail_page_url: 'https://www.amazon.co.jp/dp/B006MB9700?tag=aegis-22',
        price_as_of: '2026-11-26T00:00:00.000Z',
        investigated: false,
      });
      expect(indexRecord).toEqual({
        asin: 'B006MB9700',
        title: 'テスト商品',
        brand: 'テストブランド',
        price: 982,
        availability: '在庫あり。',
        image: 'https://example.com/i.jpg',
        amazon_category: 'ウクレレ弦',
        price_as_of: '2026-11-26T00:00:00.000Z',
        investigated: false,
      });
      expect(JSON.stringify(indexRecord)).not.toContain('amazon.co.jp');
    });
  });

  describe('generateCatalogData', () => {
    it('valid なキャッシュのみ抽出し、articlesDir に基づく investigated 判定とシャード振り分けを行うこと', async () => {
      await fs.promises.mkdir(articlesDir, { recursive: true });
      await fs.promises.writeFile(path.join(articlesDir, 'B07DY4XYND.md'), '---\n---\n', 'utf-8');
      await fs.promises.mkdir(path.join(articlesDir, 'B0000001ND.md'));

      await fs.promises.writeFile(
        path.join(cacheDir, 'ND.json'),
        JSON.stringify({
          B07DY4XYND: {
            status: 'valid',
            timestamp: 1795657280855,
            data: { title: '調査済み商品', brand: 'BrandA', price: { amount: 2500 } },
          },
          B0000001ND: {
            status: 'valid',
            timestamp: 1795657280855,
            previousPrice: 3000,
            priceChangedAt: 1795000000000,
            data: { title: '未調査商品', brand: 'BrandB', price: { amount: 2800 } },
          },
          B0000002ND: {
            status: 'invalid',
            timestamp: 1795657280855,
            data: { title: '販売終了商品', price: { amount: 1000 } },
          },
        }),
        'utf-8',
      );

      await fs.promises.writeFile(
        path.join(cacheDir, '00.json'),
        JSON.stringify({
          B000000100: {
            status: 'valid',
            timestamp: 1795657280855,
            data: { title: '別シャード商品', price: { amount: 0 } },
          },
        }),
        'utf-8',
      );

      // 古いシャードファイルが残っていた場合は削除されること
      await fs.promises.mkdir(outputDir, { recursive: true });
      await fs.promises.writeFile(path.join(outputDir, 'ZZ.json'), '{}', 'utf-8');

      const result = await generateCatalogData({ cacheDir, articlesDir, outputDir });
      expect(result).toEqual({
        totalRecords: 3,
        investigatedCount: 1,
        uninvestigatedCount: 2,
        dealsIndexCount: 0,
        shardCount: 2,
      });

      expect(fs.existsSync(path.join(outputDir, 'ZZ.json'))).toBe(false);

      const ndShard = JSON.parse(await fs.promises.readFile(path.join(outputDir, 'ND.json'), 'utf-8')) as Record<
        string,
        CatalogProductRecord
      >;
      expect(Object.keys(ndShard)).toEqual(['B0000001ND', 'B07DY4XYND']);
      expect(ndShard.B07DY4XYND?.investigated).toBe(true);
      expect(ndShard.B0000001ND?.investigated).toBe(false);
      expect(ndShard.B0000001ND?.previous_price).toBe(3000);

      const shard00 = JSON.parse(await fs.promises.readFile(path.join(outputDir, '00.json'), 'utf-8')) as Record<
        string,
        CatalogProductRecord
      >;
      expect(shard00.B000000100?.price).toBeNull();
    });

    it.each(['missing', 'empty'])('記事ディレクトリが %s の場合は調査JSONがあっても未調査になること', async (state) => {
      const investigationsDir = path.join(tempDir, 'data', 'investigations');
      await fs.promises.mkdir(investigationsDir, { recursive: true });
      await fs.promises.writeFile(path.join(investigationsDir, 'B07DY4XYND.json'), '{}', 'utf-8');
      if (state === 'empty') await fs.promises.mkdir(articlesDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(cacheDir, 'ND.json'),
        JSON.stringify({ B07DY4XYND: { status: 'valid', timestamp: 1795657280855, data: { title: '記事なし' } } }),
        'utf-8',
      );

      const cwd = jest.spyOn(process, 'cwd').mockReturnValue(tempDir);
      const result = await generateCatalogData().finally(() => cwd.mockRestore());
      expect(result).toMatchObject({ investigatedCount: 0, uninvestigatedCount: 1 });
      const shard = JSON.parse(await fs.promises.readFile(path.join(outputDir, 'ND.json'), 'utf-8'));
      expect(shard.B07DY4XYND.investigated).toBe(false);
    });

    it('キャッシュシャードの読み取り・パース失敗時はエラーを投げ、既存出力を削除しないこと', async () => {
      await fs.promises.mkdir(outputDir, { recursive: true });
      await fs.promises.writeFile(path.join(outputDir, 'KEEP.json'), '{}', 'utf-8');
      await fs.promises.writeFile(path.join(cacheDir, 'BD.json'), '{broken json', 'utf-8');

      await expect(generateCatalogData({ cacheDir, articlesDir, outputDir })).rejects.toThrow();
      expect(fs.existsSync(path.join(outputDir, 'KEEP.json'))).toBe(true);
    });

    it('検索用スリムインデックスがシャードと同じ母集団で出力されること', async () => {
      await fs.promises.mkdir(articlesDir, { recursive: true });
      await fs.promises.writeFile(path.join(articlesDir, 'B07DY4XYND.md'), '---\n---\n', 'utf-8');
      await fs.promises.writeFile(
        path.join(cacheDir, 'ND.json'),
        JSON.stringify({
          B07DY4XYND: {
            status: 'valid',
            timestamp: 1795657280855,
            data: {
              title: '調査済み商品',
              brand: 'BrandA',
              category: 'カテゴリA',
              detailPageUrl: 'https://www.amazon.co.jp/dp/B07DY4XYND?tag=aegis-22',
              availability: '在庫あり。',
              price: { amount: 2500 },
              images: { primary: 'https://example.com/a.jpg' },
            },
          },
          B0000001ND: {
            status: 'valid',
            timestamp: 1795657280855,
            data: { title: '未調査商品', brand: 'BrandB', price: { amount: 0 } },
          },
          B0000002ND: {
            status: 'permanent_invalid',
            timestamp: 1795657280855,
            data: { title: '販売終了商品', price: { amount: 1000 } },
          },
        }),
        'utf-8',
      );

      await generateCatalogData({ cacheDir, articlesDir, outputDir });

      const indexPath = path.join(tempDir, 'static', 'catalog-index.json');
      const index = JSON.parse(await fs.promises.readFile(indexPath, 'utf-8')) as Record<string, unknown>[];
      // valid のみ・ASIN 昇順・スリムなフィールドのみ（アフィリエイトリンクや価格変動履歴を含まない）
      expect(index.map((r) => r.asin)).toEqual(['B0000001ND', 'B07DY4XYND']);
      expect(index[1]).toEqual({
        asin: 'B07DY4XYND',
        title: '調査済み商品',
        brand: 'BrandA',
        price: 2500,
        availability: '在庫あり。',
        image: 'https://example.com/a.jpg',
        amazon_category: 'カテゴリA',
        price_as_of: new Date(1795657280855).toISOString(),
        investigated: true,
      });
      expect(index[0]?.price).toBeNull();
      expect(index[0]?.investigated).toBe(false);
    });

    it('キャッシュディレクトリが存在しない場合は0件を返すこと', async () => {
      const result = await generateCatalogData({
        cacheDir: path.join(tempDir, 'nonexistent'),
        articlesDir,
        outputDir,
      });
      expect(result.totalRecords).toBe(0);
    });
  });
});

describe('セールバッジ・割引率の伝搬', () => {
  it('キャッシュの dealBadge / savingsPercentage がレコードと検索インデックスに載ること', () => {
    const record = convertCacheEntryToCatalogRecord(
      'B006MB9700',
      {
        status: 'valid',
        timestamp: 1795657280855,
        data: {
          asin: 'B006MB9700',
          title: 'バッジ付き商品',
          brand: 'テストブランド',
          category: 'テスト',
          availability: '在庫あり。',
          price: { amount: 800 },
          images: { primary: 'https://m.media-amazon.com/images/I/test.jpg' },
          dealBadge: ' 厳選目玉商品 ',
          savingsPercentage: 20,
        },
      },
      false,
    );
    expect(record?.deal_badge).toBe('厳選目玉商品');
    expect(record?.savings_percentage).toBe(20);
    if (!record) throw new Error('record is null');
    const indexRecord = toCatalogIndexRecord(record);
    expect(indexRecord.deal_badge).toBe('厳選目玉商品');
    expect(indexRecord.savings_percentage).toBe(20);
  });

  it('バッジが空・割引率が0以下の場合はフィールド自体を付けないこと', () => {
    const record = convertCacheEntryToCatalogRecord(
      'B006MB9700',
      {
        status: 'valid',
        timestamp: 1795657280855,
        data: {
          asin: 'B006MB9700',
          title: '通常商品',
          price: { amount: 800 },
          dealBadge: ' ',
          savingsPercentage: 0,
        },
      },
      false,
    );
    expect(record?.deal_badge).toBeUndefined();
    expect(record?.savings_percentage).toBeUndefined();
  });

  it('generateCatalogData が未調査かつ deal_badge 付きのみを catalog-deals-index.json に出力すること', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'catalog-deals-test-'));
    const cacheDir = path.join(tmpRoot, 'cache');
    const articlesDir = path.join(tmpRoot, 'articles');
    const outputDir = path.join(tmpRoot, 'out/catalog-data');
    const indexOutputPath = path.join(tmpRoot, 'out/catalog-index.json');
    const dealsIndexOutputPath = path.join(tmpRoot, 'out/catalog-deals-index.json');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(articlesDir, { recursive: true });
    fs.writeFileSync(path.join(articlesDir, 'B000000001.md'), '---\ntitle: test\n---\n', 'utf-8');

    const baseTs = 1795657280855;
    const expiredTs = baseTs - 25 * 60 * 60 * 1000;

    fs.writeFileSync(
      path.join(cacheDir, '01.json'),
      JSON.stringify({
        B000000001: {
          status: 'valid',
          timestamp: baseTs,
          data: { asin: 'B000000001', title: '調査済みセール', price: { amount: 1000 }, dealBadge: '厳選目玉商品' },
        },
        B000000002: {
          status: 'valid',
          timestamp: baseTs,
          data: {
            asin: 'B000000002',
            title: '未調査セール',
            price: { amount: 2000 },
            dealBadge: 'ブラックフライデー先行セール',
            dealAccessType: 'PRIME_EXCLUSIVE',
            savingsPercentage: 25,
          },
        },
        B000000003: {
          status: 'valid',
          timestamp: baseTs,
          data: { asin: 'B000000003', title: '未調査通常', price: { amount: 3000 } },
        },
        B000000004: {
          status: 'valid',
          timestamp: expiredTs,
          data: {
            asin: 'B000000004',
            title: '期限切れセール',
            price: { amount: 4000 },
            dealBadge: 'ブラックフライデー先行セール',
          },
        },
        B000000005: {
          status: 'valid',
          timestamp: baseTs,
          priceTimestamp: expiredTs,
          data: {
            asin: 'B000000005',
            title: '価格時刻は古いがバッジ更新あり',
            price: { amount: 5000 },
            dealBadge: '厳選目玉商品',
          },
        },
      }),
      'utf-8',
    );

    try {
      const result = await generateCatalogData({
        cacheDir,
        articlesDir,
        outputDir,
        indexOutputPath,
        dealsIndexOutputPath,
        nowMs: baseTs,
      });
      expect(result.totalRecords).toBe(5);
      expect(result.dealsIndexCount).toBe(2);
      const dealsIndex = JSON.parse(fs.readFileSync(dealsIndexOutputPath, 'utf-8'));
      expect(dealsIndex).toHaveLength(2);
      expect(dealsIndex[0].asin).toBe('B000000002');
      expect(dealsIndex[0].deal_badge).toBe('ブラックフライデー先行セール');
      expect(dealsIndex[0].deal_access_type).toBe('PRIME_EXCLUSIVE');
      expect(dealsIndex[1].asin).toBe('B000000005');
      expect(dealsIndex[1].deal_badge).toBe('厳選目玉商品');

      const fullIndex = JSON.parse(fs.readFileSync(indexOutputPath, 'utf-8'));
      expect(fullIndex).toHaveLength(5);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
