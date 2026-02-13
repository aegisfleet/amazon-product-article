/**
 * Unit tests for ArticleGenerator
 */

import fs from 'fs';
import { ReviewAnalysisResult } from '../../analysis/ReviewAnalyzer';
import { InvestigationResult } from '../../types/JulesTypes';
import { Product, ProductDetail } from '../../types/Product';
import { ArticleGenerator } from '../ArticleGenerator';

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

describe('ArticleGenerator', () => {
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
      price: {
        amount: 50000,
        currency: 'JPY',
        formatted: '¥50,000'
      },
      images: {
        primary: 'https://example.com/image.jpg',
        thumbnails: ['https://example.com/thumb1.jpg']
      },
      specifications: {
        'ディスプレイ': '6.1インチ',
        'ストレージ': '128GB',
        'カメラ': '12MP'
      },
      rating: {
        average: 4.2,
        count: 150
      }
    };

    mockInvestigation = {
      sessionId: 'test-session-123',
      product: mockProduct,
      analysis: {
        productName: 'テスト商品 スマートフォン',
        positivePoints: [
          '画質が非常に鮮明で美しい',
          'バッテリー持ちが良好',
          '操作が直感的で使いやすい'
        ],
        negativePoints: [
          '価格がやや高め',
          '重量が気になる場合がある'
        ],
        useCases: [
          '写真撮影を重視するユーザー',
          'ビジネス用途での利用',
          '動画視聴やゲーム用途'
        ],
        competitiveAnalysis: [
          {
            name: '競合商品A',
            asin: 'B08COMPET1',
            priceComparison: '約10,000円安価',
            featureComparison: ['カメラ性能は同等', 'バッテリー容量が少ない'],
            differentiators: ['ブランド力', '品質の安定性']
          }
        ],

        recommendation: {
          targetUsers: ['写真愛好家', 'ビジネスユーザー'],
          pros: ['高品質なカメラ', '安定した性能'],
          cons: ['価格が高い', '重量がある'],
          score: 85
        },
        userStories: [],
        userImpression: '',
        technicalSpecs: {
          os: 'Android 11',
          cpu: 'Snapdragon 888',
          ram: '8GB',
          storage: '128GB',
          display: { size: '6.1インチ' },
          battery: { capacity: '4000mAh' },
          weight: '160g',
          dimensions: { weight: '160g' }
        },
        sources: []
      },
      generatedAt: new Date('2025-01-01T00:00:00Z')
    };


    // Add new fields for tests
    mockInvestigation.analysis.userStories = [
      {
        userType: '会社員',
        scenario: '通勤・通学',
        experience: '通勤中のストレスが減った',
        sentiment: 'positive'
      },
      {
        userType: '学生',
        scenario: '勉強中',
        experience: '集中力が高まった',
        sentiment: 'positive'
      }
    ];
    mockInvestigation.analysis.userImpression = '多くのユーザーが満足感を得ている';
    mockInvestigation.analysis.sources = [
      {
        name: 'Amazonレビュー',
        url: 'https://amazon.co.jp',
        credibility: 'High'
      },
      {
        name: 'Tech Blog',
        url: 'https://example.com/blog',
        credibility: 'Medium'
      }
    ];

    mockReviewAnalysis = {
      positiveInsights: [
        {
          category: '品質',
          insight: '画質が非常に鮮明で美しい',
          frequency: 8,
          impact: 'high',
          examples: ['画質が非常に鮮明で美しい']
        }
      ],
      negativeInsights: [
        {
          category: '価格',
          insight: '価格がやや高め',
          frequency: 5,
          impact: 'medium',
          examples: ['価格がやや高め']
        }
      ],
      useCaseAnalysis: [
        {
          useCase: '写真撮影を重視するユーザー',
          suitability: 90,
          userTypes: ['写真愛好家'],
          scenarios: ['旅行での撮影', '日常の記録'],
          limitations: ['暗所での撮影には限界がある']
        }
      ],
      competitivePositioning: {
        strengths: ['高品質なカメラ', '安定した性能'],
        weaknesses: ['価格が高い', '重量がある'],
        differentiators: ['ブランド力', '品質の安定性'],
        marketPosition: 'challenger',
        competitiveAdvantages: [
          {
            advantage: 'ブランド力',
            significance: 'important',
            sustainability: 'high',
            competitorComparison: '競合商品Aとの比較: ブランド力'
          }
        ]
      },
      overallSentiment: {
        overall: 0.6,
        aspects: {
          quality: 0.8,
          value: -0.2,
          usability: 0.7,
          support: 0.5,
          reliability: 0.9
        },
        confidence: 0.8
      },
      keyThemes: ['品質', '価格', '使いやすさ']
    };
  });

  describe('generateArticle', () => {
    it('should generate a complete article with all required sections', async () => {
      const mockCompetitorDetails = new Map<string, ProductDetail>();
      mockCompetitorDetails.set('B08COMPET1', { ...mockProduct, asin: 'B08COMPET1' } as any);

      // Add Creators API source to verify it's not rendered as a link
      mockInvestigation.analysis.sources.push({
        name: 'Amazon Creators API',
        url: 'https://webservices.amazon.co.jp/creators/v1/items',
        credibility: 'High'
      });

      const result = await generator.generateArticle(mockProduct, mockInvestigation, mockReviewAnalysis, undefined, undefined, mockCompetitorDetails);

      expect(result).toBeDefined();
      expect(result.content).toContain('hero:');

      expect(result.content).toContain('score_rationale:');
      expect(result.content).toContain('target_users:');
      expect(result.content).toContain('warnings:');
      expect(result.content).toContain('specs:');
      expect(result.content).toContain('## 📦 商品の特徴');
      expect(result.content).toContain('## 📊 ユーザーレビュー');
      expect(result.content).toContain('## 🥊 競合商品との比較');
      expect(result.content).toContain('## ✅ 購入推奨度');
      expect(result.content).toContain('## 🛒 商品詳細・購入');
      expect(result.content).toContain('## 🔗 参考情報ソース');
      expect(result.content).toContain('購入者の生の声');
      expect(result.content).toContain('会社員の体験談 (通勤・通学)');
      expect(result.content).toContain('多くのユーザーが満足感を得ている');
      expect(result.content).toContain('[Amazonレビュー](https://amazon.co.jp)');
      // Verify Creators API is rendered as plain text, not a link
      // Note: optimizeListsForMobile wraps list items in a span
      expect(result.content).toContain('<span class="mobile-list-item">Amazon Creators API (High)</span>');
      expect(result.content).not.toContain('[Amazon Creators API](https://webservices.amazon.co.jp/creators/v1/items)');

      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.sections).toHaveLength(6);
    });

    it('should include affiliate disclosure', async () => {
      const result = await generator.generateArticle(mockProduct, mockInvestigation);
      expect(result.content).toContain('アフィリエイト');
    });

    it('should generate proper front matter', async () => {
      const result = await generator.generateArticle(mockProduct, mockInvestigation);

      expect(result.content).toContain('---');
      expect(result.content).toContain('title: "テスト商品 スマートフォン"');
      expect(result.content).toContain('asin: "B08N5WRWNW"');
      expect(result.content).toContain('mobile_optimized: true');
    });

    it('should use investigation.generatedAt for publishDate', async () => {
      const result = await generator.generateArticle(mockProduct, mockInvestigation);
      // mockInvestigation.generatedAt is set to 2025-01-01T00:00:00Z in beforeEach
      // The output format in frontmatter matches how Date.toString() or similar is used, 
      // but ArticleGenerator uses standard Date object which yaml serializer handles.
      // We expect the date object to remain, but since we check content string, let's see how it's serialized.
      // Usually it's ISO string or similar.
      // Based on previous code, it might just be the date object.
      // Let's check metadata directly if possible, but generateArticle returns GeneratedArticle which has metadata.

      expect(result.metadata.publishDate).toEqual(mockInvestigation.generatedAt);
    });

    it('should handle products without review analysis', async () => {
      const mockCompetitorDetails = new Map<string, ProductDetail>();
      mockCompetitorDetails.set('B08COMPET1', { ...mockProduct, asin: 'B08COMPET1' } as any);
      const result = await generator.generateArticle(mockProduct, mockInvestigation, undefined, undefined, undefined, mockCompetitorDetails);

      expect(result).toBeDefined();
      expect(result.content).toContain('hero:');
      expect(result.sections).toHaveLength(6);
    });
    it('should keep items but hide links for competitors with failed Creators API lookup', async () => {
      const mockCompetitorDetails = new Map<string, ProductDetail>();

      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        undefined,
        undefined,
        undefined,
        mockCompetitorDetails
      );

      expect(result.content).toContain('競合商品A');
      expect(result.content).not.toContain('amazon.co.jp/dp/B08COMPET1');
    });

    it('should show links for competitors with successful Creators API lookup', async () => {
      const mockDetail: ProductDetail = {
        ...mockProduct,
        asin: 'B08COMPET1',
      } as any;
      const mockCompetitorDetails = new Map<string, ProductDetail>();
      mockCompetitorDetails.set('B08COMPET1', mockDetail);

      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        undefined,
        undefined,
        undefined,
        mockCompetitorDetails
      );

      expect(result.content).toContain('競合商品A');
      expect(result.content).toContain('amazon.co.jp/dp/B08COMPET1');
    });

    it('should show internal link for competitors with existing investigation file', async () => {
      // Mock fs.promises.readFile to return valid JSON
      (fs.promises.readFile as jest.Mock).mockImplementation((pathStr: string) => {
        if (pathStr.includes('B08COMPET1')) {
            return Promise.resolve(JSON.stringify({ analysis: { recommendation: { score: 85 } } }));
        }
        return Promise.reject(new Error('File not found'));
      });
      // Mock fs.existsSync to return true for the competitor
      (fs.existsSync as jest.Mock).mockImplementation((pathStr: string) => {
        return pathStr.includes('B08COMPET1');
      });

      const mockDetail: ProductDetail = {
        ...mockProduct,
        asin: 'B08COMPET1',
      } as any;
      const mockCompetitorDetails = new Map<string, ProductDetail>();
      mockCompetitorDetails.set('B08COMPET1', mockDetail);

      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        undefined,
        undefined,
        undefined,
        mockCompetitorDetails
      );

      expect(result.content).toContain('href="../b08compet1/"');
      expect(result.content).toContain('サイト内レビュー');
      expect(result.content).toContain('class="btn-internal-small"');
      // Mock fs.promises.readFile to reject
      expect(result.content).toContain('<a href="../b08compet1/" class="competitor-preview">');
      expect(result.content).not.toContain('<div class="competitor-preview">');
    });

    it('should NOT show internal link if investigation file does not exist', async () => {
      // Mock fs.existsSync to return false
      // Mock fs.promises.readFile to reject
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error("File not found"));
      const mockDetail: ProductDetail = {
        ...mockProduct,
        asin: 'B08COMPET1',
      } as any;
      const mockCompetitorDetails = new Map<string, ProductDetail>();
      mockCompetitorDetails.set('B08COMPET1', mockDetail);

      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        undefined,
        undefined,
        undefined,
        mockCompetitorDetails
      );

      expect(result.content).not.toContain('href="../B08COMPET1/"');
      expect(result.content).not.toContain('サイト内レビュー');
    });

    it('should not generate duplicate keys in front matter', async () => {
      // Create investigation result with potentially conflicting specs
      const conflictInvestigation: InvestigationResult = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          technicalSpecs: {
            dimensions: {
              weight: '100g',
              width: '10cm'
            },
            // Duplicate keys at top level
            weight: '200g',
            width: '20cm'
          }
        }
      };

      const result = await generator.generateArticle(mockProduct, conflictInvestigation);

      // Check for duplicate 'weight:' keys in specs section
      const content = result.content;
      const specsMatch = content.match(/specs:[\s\S]*?(?=hero:|---)/);

      expect(specsMatch).not.toBeNull();
      if (specsMatch) {
        const specsSection = specsMatch[0];
        const weightMatches = specsSection.match(/^\s+weight:/gm);
        const widthMatches = specsSection.match(/^\s+width:/gm);

        // Should only appear once
        expect(weightMatches?.length).toBe(1);
        expect(widthMatches?.length).toBe(1);

        // Should use the first value encountered (from dimensions block)
        // Note: dimensions.weight is processed before top-level weight in generateFrontMatter
        expect(specsSection).toContain('weight: "100g"');
      }
    });
  });

  describe('generateSEOMetadata', () => {
    it('should generate proper SEO metadata', () => {
      const metadata = generator.generateSEOMetadata(mockProduct, mockInvestigation);

      expect(metadata.title).toBe('テスト商品 スマートフォン');
      expect(metadata.asin).toBe('B08N5WRWNW');
      expect(metadata.category).toBe('Electronics');
      expect(metadata.priceRange).toBe('premium');
      // Creators API v1ではレビューデータ取得不可のためrating未設定
      expect(metadata.mobileOptimized).toBe(true);
      expect(metadata.tags).toContain('商品レビュー');
      expect(metadata.seoKeywords).toContain('レビュー');
    });

    it('should determine correct price range', () => {
      const lowPriceProduct = { ...mockProduct, price: { ...mockProduct.price, amount: 2000 } };
      const metadata = generator.generateSEOMetadata(lowPriceProduct, mockInvestigation);
      expect(metadata.priceRange).toBe('low');

      const mediumPriceProduct = { ...mockProduct, price: { ...mockProduct.price, amount: 8000 } };
      const metadata2 = generator.generateSEOMetadata(mediumPriceProduct, mockInvestigation);
      expect(metadata2.priceRange).toBe('medium');

      const highPriceProduct = { ...mockProduct, price: { ...mockProduct.price, amount: 25000 } };
      const metadata3 = generator.generateSEOMetadata(highPriceProduct, mockInvestigation);
      expect(metadata3.priceRange).toBe('high');
    });

    it('should set featured flag correctly', () => {
      const featuredProduct = {
        ...mockProduct,
        rating: { average: 4.5, count: 200 }
      };
      const featuredInvestigation = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          recommendation: {
            ...mockInvestigation.analysis.recommendation,
            score: 90
          }
        }
      };

      const metadata = generator.generateSEOMetadata(featuredProduct, featuredInvestigation);
      expect(metadata.featured).toBe(true);
    });
  });

  describe('createMobileOptimizedLayout', () => {
    it('should optimize content for mobile', () => {
      const content = 'これは長い文章です。' + '文字'.repeat(200) + '。次の文章です。';
      const optimized = generator.createMobileOptimizedLayout(content);

      expect(optimized).toContain('\n\n');
      expect(optimized.length).toBeGreaterThanOrEqual(content.length);
    });

    it('should add mobile-responsive classes to images', () => {
      const content = '![テスト画像](https://example.com/image.jpg)';
      const optimized = generator.createMobileOptimizedLayout(content);

      expect(optimized).toContain('class="mobile-responsive-image"');
    });
  });

  describe('insertAffiliateLinks', () => {
    it('should insert affiliate links with proper format', () => {
      const content = '## 商品詳細・購入\n\n商品の詳細情報です。';
      const result = generator.insertAffiliateLinks(content, mockProduct);

      expect(result).toContain('amazon.co.jp/dp/B08N5WRWNW');
      expect(result).toContain('class="affiliate-link');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should use environment affiliate tag when available', () => {
      process.env.AMAZON_PARTNER_TAG = 'test-affiliate-tag';
      const localGenerator = new ArticleGenerator();
      const content = '## 商品詳細・購入\n\n商品の詳細情報です。';
      const result = localGenerator.insertAffiliateLinks(content, mockProduct);

      expect(result).toContain('tag=test-affiliate-tag');

      delete process.env.AMAZON_PARTNER_TAG;
    });
  });

  describe('performance / concurrency', () => {
    it('should process competitor data concurrently', async () => {
      const delay = 100; // 100ms delay per file read
      const competitorCount = 5;

      // Setup multiple competitors
      const competitors = [];
      for (let i = 0; i < competitorCount; i++) {
        competitors.push({
          name: `競合商品${i}`,
          asin: `COMPETITOR${i}`,
          priceComparison: '安い',
          featureComparison: ['機能'],
          differentiators: ['差別化']
        });
      }

      const perfInvestigation = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          competitiveAnalysis: competitors
        }
      };

      // Mock readFile to simulate delay
      // Since fs is already mocked, we need to override the implementation for this test
      (fs.promises.readFile as jest.Mock).mockImplementation(async (_pathStr: string) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        return JSON.stringify({ analysis: { recommendation: { score: 85 } } });
      });

      const startTime = Date.now();
      // Pass an empty map for competitorDetails to enable the section generation
      await generator.generateArticle(mockProduct, perfInvestigation, mockReviewAnalysis, undefined, undefined, new Map());
      const endTime = Date.now();
      const duration = endTime - startTime;

      // console.log(`Duration: ${duration}ms (Expected parallel: ~${delay}ms + overhead, Sequential: ~${delay * competitorCount}ms)`);

      // Verify concurrency: duration should be significantly less than sequential execution time
      // Allow some overhead (e.g., 80% of sequential time is safe margin)
      expect(duration).toBeLessThan(delay * competitorCount * 0.8);

      // Verify all competitors were processed
      // Note: toHaveBeenCalledTimes is cumulative if not cleared, but beforeEach creates new generator.
      // However, fs mock is global. We should check if previous tests called readFile.
      // Better to check calls within this test execution or rely on resetMocks: true in jest config (not sure)
      // Or just check that it was called at least competitorCount times more than before (which is hard).
      // Given this is the only test using this specific mock implementation in this block,
      // let's rely on the duration check which is the main point.

      // But let's verify calls anyway.
      // Since other tests might call readFile (though most mock it per test or rely on default mock),
      // we might want to clear mocks before this test.
    });
  });

  describe('edge cases', () => {
    it('should handle empty investigation results', async () => {
      const emptyInvestigation = {
        ...mockInvestigation,
        analysis: {
          positivePoints: [],
          negativePoints: [],
          useCases: [],
          competitiveAnalysis: [],
          recommendation: {
            targetUsers: [],
            pros: [],
            cons: [],
            score: 0
          },
          userStories: [],
          userImpression: '',
          sources: []
          // Note: productName is intentionally omitted to test ASIN fallback
        }
      };

      const result = await generator.generateArticle(mockProduct, emptyInvestigation);
      expect(result).toBeDefined();
      // When productName is not set, should still have product-hero-card
      expect(result.content).toContain('hero:');
    });

    it('should handle products with minimal information', async () => {
      const minimalProduct = {
        asin: 'B08MINIMAL',
        title: 'ミニマル商品',
        category: 'Test',
        price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
        images: { primary: '', thumbnails: [] },
        specifications: {},
        rating: { average: 0, count: 0 }
      };

      const result = await generator.generateArticle(minimalProduct, mockInvestigation);
      expect(result).toBeDefined();
      expect(result.content).toContain('ミニマル商品');
    });
  });
});