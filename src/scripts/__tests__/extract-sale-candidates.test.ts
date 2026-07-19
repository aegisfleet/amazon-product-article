import fs from 'node:fs';
import path from 'node:path';
import { extractSaleCandidates } from '../extract-sale-candidates';

describe('extractSaleCandidates', () => {
  const tmpDir = path.join(process.cwd(), 'tmp/test_extract_sale');
  const dummyCachePath = path.join(tmpDir, 'dummy-cache.json');
  const outputPath = path.join(tmpDir, 'sale_candidates.json');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should handle missing cache file gracefully', async () => {
    const nonExistentCache = path.join(tmpDir, 'non_existent.json');
    const result = await extractSaleCandidates(nonExistentCache, outputPath);

    expect(result.totalCandidates).toBe(0);
    expect(result.candidates).toEqual([]);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('should extract valid deal candidates with official dealBadge and filter out items without dealBadge', async () => {
    const dummyCacheData = {
      ASIN001: {
        status: 'valid',
        timestamp: Date.now() - 1000,
        data: {
          asin: 'ASIN001',
          title: 'セール商品1',
          category: '家電',
          price: { amount: 1000, currency: 'JPY', formatted: '￥1,000' },
          dealBadge: 'タイムセール',
          savingsPercentage: 20,
        },
      },
      ASIN002: {
        status: 'valid',
        timestamp: Date.now() - 500,
        data: {
          asin: 'ASIN002',
          title: '割引商品2',
          category: 'PC周辺機器',
          price: { amount: 5000, currency: 'JPY', formatted: '￥5,000' },
          dealBadge: 'プライム会員限定セール',
          savingsPercentage: 30,
        },
      },
      ASIN003: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN003',
          title: '単なる割引表示（dealBadgeなし）',
          category: 'ファッション',
          price: { amount: 100, currency: 'JPY', formatted: '￥100' },
          savingsPercentage: 50, // dealBadgeがないため除外されるべき
        },
      },
      ASIN004: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN004',
          title: '通常価格商品',
          category: '食品',
          price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
        },
      },
      ASIN005: {
        status: 'invalid',
        timestamp: Date.now(),
        data: null,
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 3);

    expect(result.totalCandidates).toBe(2);
    expect(result.candidates.map((c) => c.asin)).toEqual(['ASIN002', 'ASIN001']);
    expect(result.candidates[0]?.dealBadge).toBe('プライム会員限定セール');
  });

  it('should respect category limits', async () => {
    const dummyCacheData = {
      ASIN1: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN1',
          title: '商品1',
          category: '家電',
          price: { amount: 1000, currency: 'JPY', formatted: '￥1,000' },
          dealBadge: 'タイムセール',
        },
      },
      ASIN2: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN2',
          title: '商品2',
          category: '家電',
          price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
          dealBadge: 'タイムセール',
        },
      },
      ASIN3: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN3',
          title: '商品3',
          category: '家電',
          price: { amount: 3000, currency: 'JPY', formatted: '￥3,000' },
          dealBadge: 'タイムセール',
        },
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 2);

    expect(result.totalCandidates).toBe(2);
  });

  it('should prioritize isLimitedTimeSale candidates over standard deals', async () => {
    const dummyCacheData = {
      ASIN_NORMAL_DEAL: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN_NORMAL_DEAL',
          title: '通常セール商品',
          category: '家電',
          price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
          savingsPercentage: 50,
          dealBadge: 'セール',
        },
      },
      ASIN_LIMITED_DEAL: {
        status: 'valid',
        timestamp: Date.now() - 1000,
        data: {
          asin: 'ASIN_LIMITED_DEAL',
          title: '特選タイムセール商品',
          category: 'PC',
          price: { amount: 5000, currency: 'JPY', formatted: '￥5,000' },
          savingsPercentage: 30,
          dealBadge: '特選タイムセール',
        },
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 3);

    expect(result.totalCandidates).toBe(2);
    expect(result.candidates[0]?.asin).toBe('ASIN_LIMITED_DEAL');
    expect(result.candidates[0]?.isLimitedTimeSale).toBe(true);
    expect(result.candidates[1]?.asin).toBe('ASIN_NORMAL_DEAL');
    expect(result.candidates[1]?.isLimitedTimeSale).toBe(false);
  });
});
