
import fs from 'fs';
import { ArticleGenerator } from '../ArticleGenerator';
import { Product } from '../../types/Product';
import { InvestigationResult } from '../../types/JulesTypes';
import { ReviewAnalysisResult } from '../../analysis/ReviewAnalyzer';

// Mock fs
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  promises: {
    ...jest.requireActual('fs').promises,
    readFile: jest.fn(),
  }
}));

// Mock ConfigManager
jest.mock('../../config/ConfigManager', () => {
  return {
    ConfigManager: {
      getInstance: jest.fn().mockReturnValue({
        getConfig: jest.fn().mockImplementation(() => ({
          amazon: {
            partnerTag: process.env.AMAZON_PARTNER_TAG || 'test-tag',
            accessKey: 'test-access-key',
            secretKey: 'test-secret-key'
          },
          jules: {
            apiKey: 'test-api-key'
          }
        }))
      }),
      resetInstance: jest.fn()
    }
  };
});

describe('ArticleGenerator Performance', () => {
  let generator: ArticleGenerator;
  let mockProduct: Product;
  let mockInvestigation: InvestigationResult;
  let mockReviewAnalysis: ReviewAnalysisResult;

  beforeEach(() => {
    generator = new ArticleGenerator();

    mockProduct = {
      asin: 'B08N5WRWNW',
      title: 'テスト商品 スマートフォン',
      category: 'Electronics',
      price: { amount: 50000, currency: 'JPY', formatted: '¥50,000' },
      images: { primary: 'https://example.com/image.jpg', thumbnails: [] },
      specifications: {},
      rating: { average: 4.2, count: 150 }
    };

    const competitors = [];
    for (let i = 0; i < 5; i++) {
      competitors.push({
        name: `競合商品${i}`,
        asin: `COMPETITOR${i}`,
        priceComparison: '安い',
        featureComparison: ['機能'],
        differentiators: ['差別化']
      });
    }

    mockInvestigation = {
      sessionId: 'test-session-123',
      product: mockProduct,
      analysis: {
        productName: 'テスト商品 スマートフォン',
        positivePoints: [],
        negativePoints: [],
        useCases: [],
        competitiveAnalysis: competitors,
        recommendation: {
          targetUsers: [],
          pros: [],
          cons: [],
          score: 85,
          scoreRationale: '良い'
        },
        userStories: [],
        userImpression: '',
        technicalSpecs: {},
        sources: []
      },
      generatedAt: new Date()
    };

    // Minimal mock for review analysis
    mockReviewAnalysis = {
        overallSentiment: { overall: 0.5, confidence: 0.8, aspects: { quality: 0.8, value: 0.5, usability: 0.7, support: 0.5, reliability: 0.6 } },
        positiveInsights: [],
        negativeInsights: [],
        useCaseAnalysis: [],
        competitivePositioning: { strengths: [], weaknesses: [], differentiators: [], marketPosition: 'challenger', competitiveAdvantages: [] },
        keyThemes: []
    };
  });

  it('should process competitor data concurrently', async () => {
    const delay = 100; // 100ms delay per file read
    const competitorCount = 5;

    // Mock readFile to simulate delay
    (fs.promises.readFile as jest.Mock).mockImplementation(async (pathStr: string) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return JSON.stringify({ analysis: { recommendation: { score: 85 } } });
    });

    const startTime = Date.now();
    // Pass an empty map for competitorDetails to enable the section generation
    await generator.generateArticle(mockProduct, mockInvestigation, mockReviewAnalysis, undefined, undefined, new Map());
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Duration: ${duration}ms (Expected parallel: ~${delay}ms + overhead, Sequential: ~${delay * competitorCount}ms)`);

    // Verify concurrency: duration should be significantly less than sequential execution time
    // Allow some overhead (e.g., 200ms extra)
    expect(duration).toBeLessThan(delay * competitorCount * 0.8); // 80% of sequential time is safe margin

    // Verify all competitors were processed
    expect(fs.promises.readFile).toHaveBeenCalledTimes(competitorCount);
  });
});
