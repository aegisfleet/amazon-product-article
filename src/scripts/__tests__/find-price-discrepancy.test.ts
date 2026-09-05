import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPriceDiscrepancy } from '../find-price-discrepancy';

describe('findPriceDiscrepancy', () => {
  let tempDir: string;
  let cacheFile: string;
  let investigationsDir: string;
  let outputFile: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'price-disc-test-'));
    cacheFile = path.join(tempDir, 'cache.json');
    investigationsDir = path.join(tempDir, 'investigations');
    outputFile = path.join(tempDir, 'output.json');

    await fs.promises.mkdir(investigationsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('直近調査済み（クールダウン期間内）の商品は除外される', async () => {
    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // B000RECENT: 3日前に調査（30日クールダウン内 -> 除外されるべき）
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000RECENT.json'),
      JSON.stringify({
        analysis: {
          lastInvestigated: threeDaysAgo,
          recommendation: { score: 80 },
        },
      }),
    );

    // B000OLD001: 40日前に調査（30日クールダウン経過 -> 候補になるべき）
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000OLD001.json'),
      JSON.stringify({
        analysis: {
          lastInvestigated: fortyDaysAgo,
          recommendation: { score: 85 },
        },
      }),
    );

    const cacheData = {
      B000RECENT: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000RECENT',
          title: 'Recent Item',
          price: { amount: 2000, currency: 'JPY', formatted: '¥2,000' },
          savingsPercentage: 25,
          category: '家電',
        },
      },
      B000OLD001: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000OLD001',
          title: 'Old Item',
          price: { amount: 3000, currency: 'JPY', formatted: '¥3,000' },
          savingsPercentage: 20,
          category: '本',
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await findPriceDiscrepancy(cacheFile, investigationsDir, outputFile, 15, 10, 30);

    expect(result.totalCandidates).toBe(1);
    expect(result.candidates[0]?.asin).toBe('B000OLD001');
    expect(result.candidates.some((c) => c.asin === 'B000RECENT')).toBe(false);
  });

  it('クールダウン日数を0に指定した場合は直近調査商品も含まれる', async () => {
    const now = Date.now();
    const yesterday = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000RECENT.json'),
      JSON.stringify({
        analysis: {
          lastInvestigated: yesterday,
          recommendation: { score: 80 },
        },
      }),
    );

    const cacheData = {
      B000RECENT: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000RECENT',
          title: 'Recent Item',
          price: { amount: 2000, currency: 'JPY', formatted: '¥2,000' },
          savingsPercentage: 25,
          category: '家電',
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await findPriceDiscrepancy(cacheFile, investigationsDir, outputFile, 15, 10, 0);

    expect(result.totalCandidates).toBe(1);
    expect(result.candidates[0]?.asin).toBe('B000RECENT');
  });

  it('割引率が閾値未満かつセールバッジがない場合は除外される', async () => {
    const now = Date.now();
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000LOWSAV.json'),
      JSON.stringify({
        analysis: {
          lastInvestigated: fortyDaysAgo,
          recommendation: { score: 80 },
        },
      }),
    );

    const cacheData = {
      B000LOWSAV: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000LOWSAV',
          title: 'Low Saving Item',
          price: { amount: 2000, currency: 'JPY', formatted: '¥2,000' },
          savingsPercentage: 10, // 閾値 15% 未満
          category: '家電',
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await findPriceDiscrepancy(cacheFile, investigationsDir, outputFile, 15, 10, 30);

    expect(result.totalCandidates).toBe(0);
  });

  it('ソート順が調査日が古い順、セールバッジ優先、割引率高い順であること', async () => {
    const now = Date.now();
    const fiftyDaysAgo = new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ASIN1: 50日前、20% OFF
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000000001.json'),
      JSON.stringify({ analysis: { lastInvestigated: fiftyDaysAgo } }),
    );
    // ASIN2: 40日前、セールバッジあり、15% OFF
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000000002.json'),
      JSON.stringify({ analysis: { lastInvestigated: fortyDaysAgo } }),
    );
    // ASIN3: 40日前、セールバッジなし、30% OFF
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000000003.json'),
      JSON.stringify({ analysis: { lastInvestigated: fortyDaysAgo } }),
    );

    const cacheData = {
      B000000001: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000000001',
          title: 'Item 1',
          price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
          savingsPercentage: 20,
        },
      },
      B000000002: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000000002',
          title: 'Item 2',
          price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
          savingsPercentage: 15,
          dealBadge: 'タイムセール',
        },
      },
      B000000003: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000000003',
          title: 'Item 3',
          price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
          savingsPercentage: 30,
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await findPriceDiscrepancy(cacheFile, investigationsDir, outputFile, 15, 10, 30);

    expect(result.totalCandidates).toBe(3);
    // 1番目は最も古い（50日前）の B000000001
    expect(result.candidates[0]?.asin).toBe('B000000001');
    // 2番目は同じ40日前の中でセールバッジありの B000000002
    expect(result.candidates[1]?.asin).toBe('B000000002');
    // 3番目は同じ40日前の中でセールバッジなし・割引率高の B000000003
    expect(result.candidates[2]?.asin).toBe('B000000003');
  });

  it('調査時価格（investigatedPrice）と現在価格に大幅な乖離がある場合は、Amazon割引率が低くても抽出される', async () => {
    const now = Date.now();
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // B06WRS9737 パターン: 調査時は ￥11,500、現在は ￥3,593 (約69%の乖離)
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B06WRS9737.json'),
      JSON.stringify({
        analysis: {
          lastInvestigated: fortyDaysAgo,
          investigatedPrice: '￥11,500',
          recommendation: { score: 78 },
        },
      }),
    );

    const cacheData = {
      B06WRS9737: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B06WRS9737',
          title: 'ドトールコーヒー アロマブレンド 100杯分',
          price: { amount: 3593, currency: 'JPY', formatted: '￥3,593' },
          savingsPercentage: 10, // Amazon上の割引率は10%（閾値15%未満）
          category: 'ドリップバッグ',
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    // threshold=15, investigatedPriceThreshold=30
    const result = await findPriceDiscrepancy(cacheFile, investigationsDir, outputFile, 15, 10, 30, 30);

    expect(result.totalCandidates).toBe(1);
    expect(result.candidates[0]?.asin).toBe('B06WRS9737');
    expect(result.candidates[0]?.investigatedPrice).toBe(11500);
    expect(result.candidates[0]?.investigatedPriceDiffRate).toBe(69);
  });

  it('調査時価格からの極端な乖離がある商品は最優先でソートされる', async () => {
    const now = Date.now();
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ASIN_NORMAL: 60日前の古い調査、通常のセール（20% OFF）
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000NORMAL.json'),
      JSON.stringify({
        analysis: {
          lastInvestigated: sixtyDaysAgo,
          investigatedPrice: '￥10,000',
        },
      }),
    );

    // ASIN_EXTREME: 40日前の調査だが、調査時 ￥10,000 -> 現在 ￥3,000 (70%乖離)
    await fs.promises.writeFile(
      path.join(investigationsDir, 'B000EXTREM.json'),
      JSON.stringify({
        analysis: {
          lastInvestigated: fortyDaysAgo,
          investigatedPrice: '￥10,000',
        },
      }),
    );

    const cacheData = {
      B000NORMAL: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000NORMAL',
          title: 'Normal Sale Item',
          price: { amount: 8000, currency: 'JPY', formatted: '￥8,000' },
          savingsPercentage: 20,
        },
      },
      B000EXTREM: {
        status: 'valid',
        timestamp: now,
        data: {
          asin: 'B000EXTREM',
          title: 'Extreme Discrepancy Item',
          price: { amount: 3000, currency: 'JPY', formatted: '￥3,000' },
          savingsPercentage: 10,
        },
      },
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));

    const result = await findPriceDiscrepancy(cacheFile, investigationsDir, outputFile, 15, 10, 30, 30);

    expect(result.totalCandidates).toBe(2);
    // 乖離率70%の ASIN_EXTREM が、より調査日が古い ASIN_NORMAL よりも優先される
    expect(result.candidates[0]?.asin).toBe('B000EXTREM');
    expect(result.candidates[1]?.asin).toBe('B000NORMAL');
  });
});
