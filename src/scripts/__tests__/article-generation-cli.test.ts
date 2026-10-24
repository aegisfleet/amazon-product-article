import type { CreatorsAPICache } from '../../api/CreatorsAPICache';
import { categorizeAsins } from '../article-generation-cli';

describe('categorizeAsins', () => {
  const createMockCache = (options: {
    validAsins?: string[];
    expiredAsins?: string[];
    invalidAsins?: string[];
  }): CreatorsAPICache => {
    const validSet = new Set(options.validAsins || []);
    const expiredSet = new Set(options.expiredAsins || []);
    const invalidSet = new Set(options.invalidAsins || []);

    return {
      get: jest.fn((asin: string, opts?: { ignoreExpiration?: boolean; allowInvalid?: boolean }) => {
        if (validSet.has(asin)) {
          return { asin, title: 'Valid Item' } as any;
        }
        if (expiredSet.has(asin)) {
          if (opts?.ignoreExpiration) {
            return { asin, title: 'Expired Item' } as any;
          }
          return null;
        }
        return null;
      }),
      isInvalid: jest.fn((asin: string) => invalidSet.has(asin)),
      isExpiredPermanentInvalid: jest.fn(() => false),
    } as unknown as CreatorsAPICache;
  };

  it('should categorize valid, expired, and brand new ASINs correctly', () => {
    const cache = createMockCache({
      validAsins: ['VALID1'],
      expiredAsins: ['EXPIRED1'],
      invalidAsins: ['INVALID1'],
    });

    const asins = new Set(['VALID1', 'EXPIRED1', 'INVALID1', 'NEW1']);
    const { missingAsins, stats } = categorizeAsins(asins, cache);

    expect(stats.total).toBe(4);
    expect(stats.cacheHit).toBe(1);
    expect(stats.invalid).toBe(1);
    expect(stats.brandNewMissing).toBe(1);
    expect(stats.expiredMissing).toBe(1);
    expect(stats.validMissing).toBe(2);
    // NEW1 should be prioritized before EXPIRED1
    expect(missingAsins).toEqual(['NEW1', 'EXPIRED1']);
  });

  it('should prioritize brand new ASINs over expired ASINs when limiting', () => {
    const cache = createMockCache({
      expiredAsins: ['EXP1', 'EXP2', 'EXP3'],
    });

    const asins = new Set(['EXP1', 'NEW1', 'EXP2', 'NEW2', 'EXP3']);
    // Limit to 2 items
    const { missingAsins, stats } = categorizeAsins(asins, cache, 2);

    expect(stats.total).toBe(5);
    expect(stats.brandNewMissing).toBe(2);
    expect(stats.expiredMissing).toBe(3);
    expect(stats.deferred).toBe(3);
    // The 2 items fetched MUST be the brand new ones
    expect(missingAsins).toEqual(['NEW1', 'NEW2']);
  });

  it('should respect MAX_FETCH_ASINS environment variable', () => {
    const originalEnv = process.env.MAX_FETCH_ASINS;
    try {
      process.env.MAX_FETCH_ASINS = '1';

      const cache = createMockCache({});
      const asins = new Set(['ASIN1', 'ASIN2', 'ASIN3']);

      const { missingAsins, stats } = categorizeAsins(asins, cache);
      expect(missingAsins).toHaveLength(1);
      expect(stats.deferred).toBe(2);
    } finally {
      process.env.MAX_FETCH_ASINS = originalEnv;
    }
  });
});
