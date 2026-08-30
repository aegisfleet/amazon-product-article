import fs from 'node:fs';
import path from 'node:path';
import { extractSaleCandidates } from '../extract-sale-candidates';

describe('extractSaleCandidates', () => {
  const tmpDir = path.join(process.cwd(), 'tmp/test_extract_sale');
  const dummyCachePath = path.join(tmpDir, 'dummy-cache.json');
  const outputPath = path.join(tmpDir, 'sale_candidates.json');
  const dummyArticlesDir = path.join(tmpDir, 'articles');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(dummyArticlesDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should handle missing cache file gracefully', async () => {
    const nonExistentCache = path.join(tmpDir, 'non_existent.json');
    const result = await extractSaleCandidates(nonExistentCache, outputPath, 10, 3, dummyArticlesDir);

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
          rating: { average: 4.2, count: 150 },
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
          rating: { average: 4.5, count: 200 },
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
          savingsPercentage: 50,
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

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 3, dummyArticlesDir);

    expect(result.totalCandidates).toBe(2);
    expect(result.candidates.map((c) => c.asin)).toEqual(['ASIN002', 'ASIN001']);
    expect(result.candidates[0]?.dealBadge).toBe('プライム会員限定セール');
  });

  it('should prioritize high article score (>= 75) items and exclude low article score (< 75) items', async () => {
    fs.writeFileSync(
      path.join(dummyArticlesDir, 'ASIN_HIGH_SCORE.md'),
      `---
title: "高スコア商品"
score: 92
brand: "Anker"
categories: ["充電器"]
---
レビュー本文`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(dummyArticlesDir, 'ASIN_LOW_SCORE.md'),
      `---
title: "低スコア商品"
score: 55
brand: "Unknown"
categories: ["家電"]
---
レビュー本文`,
      'utf-8',
    );

    const dummyCacheData = {
      ASIN_HIGH_SCORE: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN_HIGH_SCORE',
          title: 'Anker 高品質充電器',
          category: '充電器',
          price: { amount: 3000, currency: 'JPY', formatted: '￥3,000' },
          dealBadge: '特選タイムセール',
          savingsPercentage: 20,
          rating: { average: 4.6, count: 500 },
        },
      },
      ASIN_LOW_SCORE: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN_LOW_SCORE',
          title: '低評価なセール品',
          category: '家電',
          price: { amount: 1500, currency: 'JPY', formatted: '￥1,500' },
          dealBadge: 'タイムセール',
          savingsPercentage: 40,
          rating: { average: 3.9, count: 50 },
        },
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 3, dummyArticlesDir);

    expect(result.totalCandidates).toBe(1);
    expect(result.candidates[0]?.asin).toBe('ASIN_HIGH_SCORE');
    expect(result.candidates[0]?.articleScore).toBe(92);
    expect(result.candidates[0]?.brand).toBe('Anker');
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
          rating: { average: 4.5, count: 200 },
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
          rating: { average: 4.5, count: 200 },
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
          rating: { average: 4.5, count: 200 },
        },
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 2, dummyArticlesDir);

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
          savingsPercentage: 30,
          dealBadge: 'セール',
          rating: { average: 4.2, count: 100 },
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
          rating: { average: 4.2, count: 100 },
        },
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 3, dummyArticlesDir);

    expect(result.totalCandidates).toBe(2);
    expect(result.candidates[0]?.asin).toBe('ASIN_LIMITED_DEAL');
    expect(result.candidates[0]?.isLimitedTimeSale).toBe(true);
    expect(result.candidates[1]?.asin).toBe('ASIN_NORMAL_DEAL');
    expect(result.candidates[1]?.isLimitedTimeSale).toBe(false);
  });

  it('should exclude items with abnormal discount rate (>= 70%) or poor rating', async () => {
    const dummyCacheData = {
      ASIN_HIGH_DISCOUNT: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN_HIGH_DISCOUNT',
          title: '90%OFFの怪しいノーブランド品',
          category: '家電',
          price: { amount: 1999, currency: 'JPY', formatted: '￥1,999' },
          dealBadge: 'プライム会員限定セール',
          savingsPercentage: 90,
        },
      },
      ASIN_LOW_RATING: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN_LOW_RATING',
          title: '評価の低いセール品',
          category: '家電',
          price: { amount: 2000, currency: 'JPY', formatted: '￥2,000' },
          dealBadge: 'タイムセール',
          savingsPercentage: 30,
          rating: { average: 2.8, count: 50 },
        },
      },
      ASIN_VALID: {
        status: 'valid',
        timestamp: Date.now(),
        data: {
          asin: 'ASIN_VALID',
          title: '高品質な適正セール品',
          category: '家電',
          price: { amount: 3500, currency: 'JPY', formatted: '￥3,500' },
          dealBadge: 'タイムセール',
          savingsPercentage: 25,
          rating: { average: 4.5, count: 120 },
        },
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 3, dummyArticlesDir);

    expect(result.totalCandidates).toBe(1);
    expect(result.candidates[0]?.asin).toBe('ASIN_VALID');
  });

  it('should prioritize fresh and high-discount deal over older deal even if older deal has higher article score', async () => {
    fs.writeFileSync(
      path.join(dummyArticlesDir, 'ASIN_SUPER_HIGH_SCORE.md'),
      `---
title: "超高スコア商品"
score: 100
brand: "BrandA"
categories: ["家電"]
---
レビュー本文`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(dummyArticlesDir, 'ASIN_FRESH_DEAL.md'),
      `---
title: "タイムリーな高割引商品"
score: 80
brand: "BrandB"
categories: ["PC"]
---
レビュー本文`,
      'utf-8',
    );

    const now = Date.now();
    const dummyCacheData = {
      ASIN_SUPER_HIGH_SCORE: {
        status: 'valid',
        timestamp: now - 1000 * 60 * 60 * 96, // 4日前（古い）
        data: {
          asin: 'ASIN_SUPER_HIGH_SCORE',
          title: '古いタイムセール品',
          category: '家電',
          price: { amount: 10000, currency: 'JPY', formatted: '￥10,000' },
          dealBadge: 'セール',
          savingsPercentage: 5,
          rating: { average: 4.2, count: 50 },
        },
      },
      ASIN_FRESH_DEAL: {
        status: 'valid',
        timestamp: now - 1000 * 60 * 10, // 10分前（最新）
        data: {
          asin: 'ASIN_FRESH_DEAL',
          title: '最新の特選タイムセール品',
          category: 'PC',
          price: { amount: 5000, currency: 'JPY', formatted: '￥5,000' },
          dealBadge: '特選タイムセール',
          savingsPercentage: 35,
          rating: { average: 4.5, count: 300 },
        },
      },
    };

    fs.writeFileSync(dummyCachePath, JSON.stringify(dummyCacheData, null, 2), 'utf-8');

    const result = await extractSaleCandidates(dummyCachePath, outputPath, 10, 3, dummyArticlesDir);

    expect(result.totalCandidates).toBe(2);
    expect(result.candidates[0]?.asin).toBe('ASIN_FRESH_DEAL');
    expect(result.candidates[1]?.asin).toBe('ASIN_SUPER_HIGH_SCORE');
  });
});
