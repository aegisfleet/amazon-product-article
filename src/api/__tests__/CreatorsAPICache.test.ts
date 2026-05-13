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

    // Manually set cache state for testing expiration
    (cache as any).cache.B001 = {
      data: mockProduct,
      timestamp: past,
      status: 'valid',
    };

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

    expect(cache.get('B001_FALLBACK', { ignoreExpiration: true })).toEqual(mockProduct);
  });

  test('should return true for fresh invalid entries', () => {
    // Mock file exists to use shortened invalidTtl
    (fs.existsSync as jest.Mock).mockReturnValue(true);
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

    cache.markInvalid('B006');

    // Should now be invalid
    expect((cache as any).cache.B006.status).toBe('invalid');
    // But data should be preserved
    expect((cache as any).cache.B006.data).toEqual(mockProduct);
    // Standard get should return null
    expect(cache.get('B006')).toBeNull();
    // get with allowInvalid should return data
    expect(cache.get('B006', { allowInvalid: true })).toEqual(mockProduct);
  });

  test('markInvalid should NOT overwrite status if NOT expired', () => {
    cache.set('B006_FRESH', mockProduct);
    cache.markInvalid('B006_FRESH');

    // Should still be valid because it's fresh
    expect((cache as any).cache.B006_FRESH.status).toBe('valid');
  });

  test('should return true for fresh permanent_invalid entries', () => {
    cache.markPermanentInvalid('B007');
    expect(cache.isInvalid('B007')).toBe(true);
    expect(cache.get('B007')).toBeNull();
    expect((cache as any).cache.B007.status).toBe('permanent_invalid');
  });

  test('markPermanentInvalid should update status but PRESERVE existing data if expired', () => {
    const now = Date.now();
    const expiredTime = now - 25 * 60 * 60 * 1000; // 25h ago

    (cache as any).cache.B007_EXPIRED = {
      data: mockProduct,
      timestamp: expiredTime,
      status: 'valid',
    };

    cache.markPermanentInvalid('B007_EXPIRED');

    expect((cache as any).cache.B007_EXPIRED.status).toBe('permanent_invalid');
    expect((cache as any).cache.B007_EXPIRED.data).toEqual(mockProduct);
    expect(cache.get('B007_EXPIRED', { allowInvalid: true })).toEqual(mockProduct);
  });

  test('should respect permanentInvalidTtl (7 days by default)', () => {
    const now = Date.now();
    const past = now - 6 * 24 * 60 * 60 * 1000; // 6 days ago
    const wayPast = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago

    (cache as any).cache.FRESH_PERM = {
      data: null,
      timestamp: past,
      status: 'permanent_invalid',
    };

    (cache as any).cache.EXPIRED_PERM = {
      data: null,
      timestamp: wayPast,
      status: 'permanent_invalid',
    };

    expect(cache.isInvalid('EXPIRED_PERM')).toBe(false);
  });

  test('isExpiredPermanentInvalid should correctly identify expired permanent items', () => {
    const now = Date.now();
    const past = now - 6 * 24 * 60 * 60 * 1000; // 6 days ago (not expired)
    const wayPast = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago (expired)

    (cache as any).cache.FRESH_PERM = {
      data: null,
      timestamp: past,
      status: 'permanent_invalid',
    };

    (cache as any).cache.EXPIRED_PERM = {
      data: null,
      timestamp: wayPast,
      status: 'permanent_invalid',
    };

    (cache as any).cache.NORMAL_INVALID = {
      data: null,
      timestamp: wayPast,
      status: 'invalid',
    };

    expect(cache.isExpiredPermanentInvalid('FRESH_PERM')).toBe(false);
    expect(cache.isExpiredPermanentInvalid('EXPIRED_PERM')).toBe(true);
    expect(cache.isExpiredPermanentInvalid('NORMAL_INVALID')).toBe(false);
    expect(cache.isExpiredPermanentInvalid('NON_EXISTENT')).toBe(false);
  });

  test('should use invalidTtl (short) when investigation file exists', () => {
    const now = Date.now();
    const past = now - 2 * 60 * 60 * 1000; // 2 hours ago (invalid TTL is 1 hour)

    (cache as any).cache.B004 = {
      data: null,
      timestamp: past,
      status: 'invalid',
    };

    // File exists => should use invalidTtl (1h) => should be expired (false)
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => p.includes('B004.json'));
    expect(cache.isInvalid('B004')).toBe(false);
  });

  test('should use standard ttl (long) when investigation file DOES NOT exist', () => {
    const now = Date.now();
    const past = now - 2 * 60 * 60 * 1000; // 2 hours ago (invalid TTL is 1 hour, standard is 24h)

    (cache as any).cache.B005 = {
      data: null,
      timestamp: past,
      status: 'invalid',
    };

    // File DOES NOT exist => should use standard ttl (24h) => should NOT be expired (true)
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    expect(cache.isInvalid('B005')).toBe(true);
  });

  test('getMissingAsins should respect selective TTL logic', () => {
    const now = Date.now();
    const pastInvalid = now - 2 * 60 * 60 * 1000; // 2h ago

    // ASIN with file: should be expired (missing: true)
    (cache as any).cache.WITH_FILE = { data: null, timestamp: pastInvalid, status: 'invalid' };
    // ASIN without file: should NOT be expired (missing: false)
    (cache as any).cache.WITHOUT_FILE = { data: null, timestamp: pastInvalid, status: 'invalid' };

    (fs.existsSync as jest.Mock).mockImplementation((p: string) => p.includes('WITH_FILE.json'));

    const missing = cache.getMissingAsins(['WITH_FILE', 'WITHOUT_FILE']);

    expect(missing).toContain('WITH_FILE');
    expect(missing).not.toContain('WITHOUT_FILE');
  });

  test('save should write to disk asynchronously', async () => {
    // Ensure fs.promises exists for mocking
    if (!fs.promises) {
      (fs as any).promises = {
        writeFile: jest.fn(),
        mkdir: jest.fn(),
      };
    }

    // Use spies to restore original implementation after test
    const writeFileSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);

    try {
      await cache.save();

      // Normalize path for cross-platform compatibility (Windows uses backslash)
      const expectedPathChunk = path.normalize(mockCacheDir);

      expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining(expectedPathChunk), { recursive: true });
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('paapi-product-cache.json'),
        expect.any(String),
        'utf-8',
      );
    } finally {
      writeFileSpy.mockRestore();
      mkdirSpy.mockRestore();
    }
  });
});
