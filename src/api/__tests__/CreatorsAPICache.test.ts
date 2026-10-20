import fs from 'node:fs';
import path from 'node:path';
import type { ProductDetail } from '../../types/Product';
import { CreatorsAPICache } from '../CreatorsAPICache';

jest.mock('node:fs');
jest.mock('../../utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('CreatorsAPICache', () => {
  const mockCacheDir = 'data/cache/test';
  let cache: CreatorsAPICache;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    cache = new CreatorsAPICache(24, 1, mockCacheDir);
  });

  const mockProduct: ProductDetail = {
    asin: 'B000AR4WPW',
    title: 'Test Product',
    category: 'Test',
    price: { amount: 1000, currency: 'JPY', formatted: '￥1,000' },
    images: { primary: 'img.jpg', thumbnails: [] },
    specifications: {},
    rating: { average: 0, count: 0 },
    detailPageUrl: 'https://amazon.co.jp/dp/B000AR4WPW',
    features: [],
  };

  test('should return null for expired valid entries', () => {
    const now = Date.now();
    const past = now - 25 * 60 * 60 * 1000; // 25 hours ago

    (cache as any).cache.B001 = {
      data: mockProduct,
      timestamp: past,
      status: 'valid',
    };
    (cache as any).loadedShards.add('01');

    expect(cache.get('B001')).toBeNull();
  });

  test('should return data for non-expired valid entries', () => {
    cache.set('B002', mockProduct);
    expect(cache.get('B002')).toEqual(mockProduct);
  });

  test('should return expired valid entries when ignoreExpiration is true', () => {
    const now = Date.now();
    const past = now - 25 * 60 * 60 * 1000; // 25 hours ago

    (cache as any).cache.B001_FALLBACK = {
      data: mockProduct,
      timestamp: past,
      status: 'valid',
    };
    (cache as any).loadedShards.add('CK');

    expect(cache.get('B001_FALLBACK', { ignoreExpiration: true })).toEqual(mockProduct);
  });

  test('should return true for fresh invalid entries', () => {
    cache.markInvalid('B003');
    expect(cache.isInvalid('B003')).toBe(true);
    expect(cache.get('B003')).toBeNull();
  });

  test('markInvalid should update status but PRESERVE existing data if expired', () => {
    const now = Date.now();
    const expiredTime = now - 25 * 60 * 60 * 1000; // 25h ago (expired)

    (cache as any).cache.B006 = {
      data: mockProduct,
      timestamp: expiredTime,
      status: 'valid',
    };
    (cache as any).loadedShards.add('06');

    cache.markInvalid('B006');

    expect((cache as any).cache.B006.status).toBe('invalid');
    expect((cache as any).cache.B006.data).toEqual(mockProduct);
    expect(cache.get('B006')).toBeNull();
    expect(cache.get('B006', { allowInvalid: true })).toEqual(mockProduct);
  });

  test('markInvalid should NOT overwrite fresh valid entry', () => {
    const now = Date.now();
    const freshTime = now - 1 * 60 * 60 * 1000; // 1h ago (fresh)

    (cache as any).cache.B007 = {
      data: mockProduct,
      timestamp: freshTime,
      status: 'valid',
    };
    (cache as any).loadedShards.add('07');

    cache.markInvalid('B007');

    expect((cache as any).cache.B007.status).toBe('valid');
    expect((cache as any).cache.B007.data).toEqual(mockProduct);
    expect(cache.get('B007')).toEqual(mockProduct);
  });

  test('markPermanentInvalid should update status to permanent_invalid if expired', () => {
    const now = Date.now();
    const expiredTime = now - 25 * 60 * 60 * 1000; // 25h ago (expired)

    (cache as any).cache.B008 = {
      data: mockProduct,
      timestamp: expiredTime,
      status: 'valid',
    };
    (cache as any).loadedShards.add('08');

    cache.markPermanentInvalid('B008');

    expect((cache as any).cache.B008.status).toBe('permanent_invalid');
    expect((cache as any).cache.B008.data).toEqual(mockProduct);
    expect(cache.get('B008')).toBeNull();
    expect(cache.get('B008', { allowInvalid: true })).toEqual(mockProduct);
  });

  test('isExpiredPermanentInvalid should return true only after permanentInvalidTtl', () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

    (cache as any).cache.B009_FRESH = {
      data: null,
      timestamp: twoDaysAgo,
      status: 'permanent_invalid',
    };
    (cache as any).cache.B009_EXPIRED = {
      data: null,
      timestamp: eightDaysAgo,
      status: 'permanent_invalid',
    };
    (cache as any).loadedShards.add('SH');
    (cache as any).loadedShards.add('ED');

    expect(cache.isExpiredPermanentInvalid('B009_FRESH')).toBe(false);
    expect(cache.isExpiredPermanentInvalid('B009_EXPIRED')).toBe(true);
    expect(cache.isExpiredPermanentInvalid('B009_NONEXISTENT')).toBe(false);
  });

  test('getMultiple should return map of found valid items', () => {
    cache.set('B001', mockProduct);
    cache.set('B002', { ...mockProduct, asin: 'B002', title: 'Product 2' });

    const result = cache.getMultiple(['B001', 'B002', 'B003']);
    expect(result.size).toBe(2);
    expect(result.get('B001')?.title).toBe('Test Product');
    expect(result.get('B002')?.title).toBe('Product 2');
    expect(result.has('B003')).toBe(false);
  });

  test('getMissingAsins should correctly identify missing items', () => {
    cache.set('B001', mockProduct);
    cache.markInvalid('B002'); // Fresh invalid: should not be marked as missing to fetch

    const missing = cache.getMissingAsins(['B001', 'B002', 'B003']);
    expect(missing).toEqual(['B003']);
  });

  test('should strip invisible Unicode characters from string fields', () => {
    const productWithInvisibleChars: ProductDetail = {
      ...mockProduct,
      title: 'Test\u200E \u200FProduct\uFEFF Name',
      category: 'Electronics\u200B',
      features: ['Feature \u200C1', 'Feature 2\u200D'],
    };

    cache.set('B_UNICODE_TEST', productWithInvisibleChars);
    const cached = cache.get('B_UNICODE_TEST');

    expect(cached?.title).toBe('Test Product Name');
    expect(cached?.category).toBe('Electronics');
  });

  test('getShardKey should return 2-character uppercase string', () => {
    expect(CreatorsAPICache.getShardKey('B000AR4WPW')).toBe('PW');
    expect(CreatorsAPICache.getShardKey('b009odjpmi')).toBe('MI');
    expect(CreatorsAPICache.getShardKey('1234567890')).toBe('90');
    expect(CreatorsAPICache.getShardKey('A')).toBe('0A');
  });

  test('save should write dirty shards to disk asynchronously', async () => {
    if (!fs.promises) {
      (fs as any).promises = {
        writeFile: jest.fn(),
        mkdir: jest.fn(),
        rename: jest.fn(),
      };
    }

    const writeFileSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const renameSpy = jest.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);

    try {
      cache.set('B001', mockProduct); // shard '01'
      await cache.save();

      const expectedPathChunk = path.normalize(path.join(mockCacheDir, 'paapi'));

      expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining(expectedPathChunk), { recursive: true });
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining(path.normalize('paapi/01.json.tmp')),
        expect.any(String),
        'utf-8',
      );
      expect(renameSpy).toHaveBeenCalledWith(
        expect.stringContaining(path.normalize('paapi/01.json.tmp')),
        expect.stringContaining(path.normalize('paapi/01.json')),
      );
    } finally {
      writeFileSpy.mockRestore();
      mkdirSpy.mockRestore();
      renameSpy.mockRestore();
    }
  });

  test('should record previousPrice and priceChangedAt when price changes', () => {
    const product1: ProductDetail = {
      ...mockProduct,
      price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
    };
    const product2: ProductDetail = {
      ...mockProduct,
      price: { amount: 1500, currency: 'JPY', formatted: '￥1,500' },
    };

    cache.set('B_PRICE_TEST', product1);
    const entry1 = (cache as any).cache.B_PRICE_TEST;
    expect(entry1.previousPrice).toBeUndefined();
    expect(entry1.priceChangedAt).toBeUndefined();

    cache.set('B_PRICE_TEST', product2);
    const entry2 = (cache as any).cache.B_PRICE_TEST;
    expect(entry2.previousPrice).toBe(2000);
    expect(entry2.priceChangedAt).toBeDefined();
    expect(typeof entry2.priceChangedAt).toBe('number');
    expect(entry2.data.price.amount).toBe(1500);

    cache.set('B_PRICE_TEST', product2);
    const entry3 = (cache as any).cache.B_PRICE_TEST;
    expect(entry3.previousPrice).toBe(2000);
    expect(entry3.priceChangedAt).toBe(entry2.priceChangedAt);
  });

  test('should retain previousPrice and priceChangedAt when loading from disk', () => {
    const rawData = JSON.stringify({
      B_PERSIST: {
        data: mockProduct,
        timestamp: Date.now(),
        status: 'valid',
        previousPrice: 3000,
        priceChangedAt: 1234567890,
      },
    });

    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return String(filePath).includes('ST.json');
    });
    (fs.readFileSync as jest.Mock).mockReturnValue(rawData);

    const newCache = new CreatorsAPICache(24, 1, mockCacheDir);
    const product = newCache.get('B_PERSIST');
    expect(product).toBeDefined();

    const entry = (newCache as any).cache.B_PERSIST;
    expect(entry.previousPrice).toBe(3000);
    expect(entry.priceChangedAt).toBe(1234567890);
  });
});
