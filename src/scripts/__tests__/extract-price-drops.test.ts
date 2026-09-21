import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractPriceDrops } from '../extract-price-drops';

describe('extractPriceDrops', () => {
  let tempDir: string;
  let cacheFile: string;
  let articlesDir: string;
  let outputFile: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'price-drops-test-'));
    cacheFile = path.join(tempDir, 'cache.json');
    articlesDir = path.join(tempDir, 'articles');
    outputFile = path.join(tempDir, 'price-drops.json');

    await fs.promises.mkdir(articlesDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('直近48時間以内に値下げされた商品（recent_drop）のみが抽出されること', async () => {
    const now = Date.now();

    // 記事メタデータの作成
    await fs.promises.writeFile(
      path.join(articlesDir, 'b00recent01.md'),
      '---\nasin: "B00RECENT1"\nscore: 85\n---\nArticle content',
    );
    await fs.promises.writeFile(
      path.join(articlesDir, 'b00old00001.md'),
      '---\nasin: "B00OLD0001"\nscore: 80\n---\nArticle content',
    );
    await fs.promises.writeFile(
      path.join(articlesDir, 'b00up000001.md'),
      '---\nasin: "B00UP00001"\nscore: 80\n---\nArticle content',
    );

    const cacheData = {
      // 1. 直近値下げ品: 3,000円 -> 2,000円 (33% OFF, 1時間前) -> 抽出されるべき
      B00RECENT1: {
        status: 'valid',
        timestamp: now,
        previousPrice: 3000,
        priceChangedAt: now - 3600 * 1000,
        data: {
          asin: 'B00RECENT1',
          title: 'Recent Dropped Item',
          category: 'イヤホン',
          price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
          images: { primary: 'https://example.com/recent.jpg', thumbnails: [] },
          rating: { average: 4.5, count: 150 },
        },
      },
      // 2. 過去の値下げ品: 3日前に値下げ（48時間超過） -> 除外されるべき
      B00OLD0001: {
        status: 'valid',
        timestamp: now,
        previousPrice: 4000,
        priceChangedAt: now - 72 * 3600 * 1000,
        data: {
          asin: 'B00OLD0001',
          title: 'Old Dropped Item',
          category: 'キーボード',
          price: { amount: 3000, currency: 'JPY', formatted: '￥3,000' },
          images: { primary: 'https://example.com/old.jpg', thumbnails: [] },
        },
      },
      // 3. 値上げ品: 2,000円 -> 3,000円 -> 除外されるべき
      B00UP00001: {
        status: 'valid',
        timestamp: now,
        previousPrice: 2000,
        priceChangedAt: now - 3600 * 1000,
        data: {
          asin: 'B00UP00001',
          title: 'Price Up Item',
          category: 'マウス',
          price: { amount: 3000, currency: 'JPY', formatted: '￥3,000' },
          images: { primary: 'https://example.com/up.jpg', thumbnails: [] },
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await extractPriceDrops({
      cachePath: cacheFile,
      articlesDir,
      outputPath: outputFile,
      maxResults: 10,
    });

    expect(result.totalDrops).toBe(1);
    expect(result.drops[0]?.asin).toBe('B00RECENT1');
    expect(result.drops[0]?.dropType).toBe('recent_drop');
    expect(result.drops[0]?.previousPrice).toBe(3000);
    expect(result.drops[0]?.currentPrice).toBe(2000);
    expect(result.drops[0]?.priceDiff).toBe(1000);
    expect(result.drops[0]?.priceDiffRate).toBe(33);

    // 出力ファイルが書き出されていること
    const saved = JSON.parse(await fs.promises.readFile(outputFile, 'utf-8'));
    expect(saved.totalDrops).toBe(1);
  });

  it('異常な割引率（75%以上）や低スコア（70未満）の商品は除外されること', async () => {
    const now = Date.now();

    await fs.promises.writeFile(path.join(articlesDir, 'b00fake0001.md'), '---\nasin: "B00FAKE001"\nscore: 75\n---\n');
    await fs.promises.writeFile(path.join(articlesDir, 'b00low00001.md'), '---\nasin: "B00LOW0001"\nscore: 65\n---\n');

    const cacheData = {
      // 80% OFF (二重価格の疑い -> 除外)
      B00FAKE001: {
        status: 'valid',
        timestamp: now,
        previousPrice: 10000,
        priceChangedAt: now - 3600 * 1000,
        data: {
          asin: 'B00FAKE001',
          title: 'Fake Discount Item',
          price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
        },
      },
      // スコア65 (70点未満 -> 除外)
      B00LOW0001: {
        status: 'valid',
        timestamp: now,
        previousPrice: 3000,
        priceChangedAt: now - 3600 * 1000,
        data: {
          asin: 'B00LOW0001',
          title: 'Low Score Item',
          price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await extractPriceDrops({
      cachePath: cacheFile,
      articlesDir,
      outputPath: outputFile,
    });

    expect(result.totalDrops).toBe(0);
  });

  it('無効エントリや価格が0以下のアイテムは除外されること', async () => {
    const now = Date.now();

    const cacheData = {
      B0INVALID1: {
        status: 'invalid',
        timestamp: now,
        data: null,
      },
      B0ZERO0001: {
        status: 'valid',
        timestamp: now,
        previousPrice: 1000,
        priceChangedAt: now,
        data: {
          asin: 'B0ZERO0001',
          title: 'Zero Price Item',
          price: { amount: 0, currency: 'JPY', formatted: '価格情報なし' },
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await extractPriceDrops({
      cachePath: cacheFile,
      articlesDir,
      outputPath: outputFile,
    });

    expect(result.totalDrops).toBe(0);
  });
});
