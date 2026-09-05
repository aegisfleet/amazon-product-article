import fs from 'node:fs/promises';
import { loadInvestigationResults } from '../article-generation-cli';

// Mock Logger
jest.mock('../../utils/Logger', () => ({
  Logger: {
    getInstance: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      group: jest.fn(),
      endGroup: jest.fn(),
    }),
  },
}));

// Mock fs and path
jest.mock('node:fs/promises');
jest.mock('node:path', () => {
  const originalPath = jest.requireActual('node:path');
  return {
    ...originalPath,
    join: jest.fn((...args) => originalPath.join(...args)),
  };
});

describe('loadInvestigationResults Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });
  });

  it('should filter out files with missing required analysis fields', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['missing_fields.json']);
    (fs.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        analysis: {
          // Missing positivePoints, negativePoints, etc.
          userImpression: 'Good',
        },
      }),
    );

    const results = await loadInvestigationResults();

    // Without validation, this might return a result with missing fields.
    // With Zod validation, this should be 0.
    // For reproduction, we assert the current behavior if we want to prove it fails,
    // or just write the test for the desired behavior.
    // I will write the test for the DESIRED behavior.
    expect(results).toHaveLength(0);
  });

  it('should filter out files with wrong types', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['wrong_types.json']);
    (fs.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        analysis: {
          positivePoints: 'should be an array', // Wrong type
          negativePoints: [],
          useCases: [],
          userStories: [],
          userImpression: 'Good',
          sources: [],
          competitiveAnalysis: [],
          recommendation: {
            targetUsers: [],
            pros: [],
            cons: [],
            score: 10,
          },
        },
      }),
    );

    const results = await loadInvestigationResults();
    expect(results).toHaveLength(0);
  });

  it('should load valid investigation files', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['valid.json']);
    const validData = {
      analysis: {
        positivePoints: ['p1'],
        negativePoints: ['n1'],
        useCases: ['u1'],
        userStories: [
          {
            userType: 'type1',
            scenario: 'scenario1',
            experience: 'exp1',
            sentiment: 'positive',
          },
        ],
        userImpression: 'Good',
        sources: [
          {
            name: 's1',
            url: 'https://example.com/source',
            tier: 'high',
            evidenceType: 'primary',
          },
        ],
        competitiveAnalysis: [
          {
            name: 'comp1',
            priceComparison: 'cheaper',
            featureComparison: ['f1'],
            differentiators: ['d1'],
          },
        ],
        recommendation: {
          targetUsers: ['t1'],
          pros: ['p1'],
          cons: ['c1'],
          score: 10,
        },
      },
    };
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validData));

    const results = await loadInvestigationResults();
    expect(results).toHaveLength(1);
    expect(results[0]?.investigation.analysis.positivePoints).toEqual(['p1']);
  });

  it('should preserve extra fields like productName and scoreRationale', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['extra_fields.json']);
    const dataWithExtraFields = {
      analysis: {
        productName: 'テスト商品名',
        parentAsin: 'B00PARENT',
        productDescription: '素晴らしい商品です',
        productUsage: ['日常利用', 'ビジネス'],
        positivePoints: ['良い点'],
        negativePoints: ['悪い点'],
        useCases: ['用途'],
        userStories: [
          {
            userType: 'ユーザー',
            scenario: 'シナリオ',
            experience: '体験',
            sentiment: 'positive' as const,
          },
        ],
        userImpression: '印象',
        sources: [
          {
            name: 'ソース',
            url: 'https://example.com/source-ja',
            tier: 'medium',
            evidenceType: 'secondary',
          },
        ],
        competitiveAnalysis: [
          {
            name: '競合',
            priceComparison: '安い',
            featureComparison: ['機能'],
            differentiators: ['差別化'],
          },
        ],
        recommendation: {
          targetUsers: ['ターゲット'],
          pros: ['長所'],
          cons: ['短所'],
          score: 85,
          scoreRationale: '[基本点: 70]\n[加点: +15] 高品質',
        },
      },
    };
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(dataWithExtraFields));

    const results = await loadInvestigationResults();
    expect(results).toHaveLength(1);

    const analysis = results[0]?.investigation.analysis as Record<string, unknown>;
    expect(analysis.productName).toBe('テスト商品名');
    expect(analysis.parentAsin).toBe('B00PARENT');
    expect(analysis.productDescription).toBe('素晴らしい商品です');
    expect(analysis.productUsage).toEqual(['日常利用', 'ビジネス']);

    const recommendation = analysis.recommendation as Record<string, unknown>;
    expect(recommendation.scoreRationale).toBe('[基本点: 70]\n[加点: +15] 高品質');
  });

  it('should preserve investigatedPrice in analysis when present', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['investigated_price.json']);
    const dataWithPrice = {
      analysis: {
        positivePoints: ['p1'],
        negativePoints: ['n1'],
        useCases: ['u1'],
        userStories: [],
        userImpression: 'Good',
        sources: [],
        competitiveAnalysis: [],
        recommendation: {
          targetUsers: ['t1'],
          pros: ['p1'],
          cons: ['c1'],
          score: 10,
        },
        investigatedPrice: '￥11,500',
      },
    };
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(dataWithPrice));

    const results = await loadInvestigationResults();
    expect(results).toHaveLength(1);
    expect(results[0]?.investigation.analysis.investigatedPrice).toBe('￥11,500');
  });
});
