import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type CatalogProductRecord,
  convertCacheEntryToCatalogRecord,
  generateCatalogData,
  getShardKey,
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
