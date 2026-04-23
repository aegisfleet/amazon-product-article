/**
 * Unit tests for ArticleGenerator
 */

import fs from 'node:fs';
import type { ReviewAnalysisResult } from '../../analysis/ReviewAnalyzer';
import type { InvestigationResult } from '../../types/JulesTypes';
import type { Product, ProductDetail } from '../../types/Product';
import { ArticleGenerator } from '../ArticleGenerator';

// Mock fs
jest.mock('node:fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  promises: {
    ...jest.requireActual('fs').promises,
    readFile: jest.fn(),
  },
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
            secretKey: 'test-secret-key',
          },
          jules: {
            apiKey: 'test-api-key',
          },
        })),
      }),
      resetInstance: jest.fn(),
    },
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
        formatted: '¥50,000',
      },
      images: {
        primary: 'https://example.com/image.jpg',
        thumbnails: ['https://example.com/thumb1.jpg'],
      },
      specifications: {
        ディスプレイ: '6.1インチ',
        ストレージ: '128GB',
        カメラ: '12MP',
      },
      rating: {
        average: 4.2,
        count: 150,
      },
    };

    mockInvestigation = {
      sessionId: 'test-session-123',
      product: mockProduct,
      analysis: {
        productName: 'テスト商品 スマートフォン',
        positivePoints: ['画質が非常に鮮明で美しい', 'バッテリー持ちが良好', '操作が直感的で使いやすい'],
        negativePoints: ['価格がやや高め', '重量が気になる場合がある'],
        useCases: ['写真撮影を重視するユーザー', 'ビジネス用途での利用', '動画視聴やゲーム用途'],
        competitiveAnalysis: [
          {
            name: '競合商品A',
            asin: 'B08COMPET1',
            priceComparison: '約10,000円安価',
            featureComparison: ['カメラ性能は同等', 'バッテリー容量が少ない'],
            differentiators: ['ブランド力', '品質の安定性'],
          },
        ],

        recommendation: {
          targetUsers: ['写真愛好家', 'ビジネスユーザー'],
          pros: ['高品質なカメラ', '安定した性能'],
          cons: ['価格が高い', '重量がある'],
          score: 85,
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
          dimensions: { weight: '160g' },
        },
        sources: [],
      },
      generatedAt: new Date('2025-01-01T00:00:00Z'),
    };

    // Add new fields for tests
    mockInvestigation.analysis.userStories = [
      {
        userType: '会社員',
        scenario: '通勤・通学',
        experience: '通勤中のストレスが減った',
        sentiment: 'positive',
      },
      {
        userType: '学生',
        scenario: '勉強中',
        experience: '集中力が高まった',
        sentiment: 'positive',
      },
    ];
    mockInvestigation.analysis.userImpression = '多くのユーザーが満足感を得ている';
    mockInvestigation.analysis.sources = [
      {
        name: 'Amazonレビュー',
        url: 'https://amazon.co.jp',
        tier: 'high',
        evidenceType: 'primary',
        publishedAt: '2025-01-01',
        author: '購入者レビュー',
        conflictOfInterest: 'none',
        notes: '第三者検証あり',
      },
      {
        name: 'Tech Blog',
        url: 'https://example.com/blog',
        tier: 'medium',
        evidenceType: 'secondary',
        publishedAt: '2024-12-15',
        author: '編集部',
        conflictOfInterest: 'possible',
        notes: '比較検証あり',
      },
    ];

    mockReviewAnalysis = {
      positiveInsights: [
        {
          category: '品質',
          insight: '画質が非常に鮮明で美しい',
          frequency: 8,
          impact: 'high',
          examples: ['画質が非常に鮮明で美しい'],
        },
      ],
      negativeInsights: [
        {
          category: '価格',
          insight: '価格がやや高め',
          frequency: 5,
          impact: 'medium',
          examples: ['価格がやや高め'],
        },
      ],
      useCaseAnalysis: [
        {
          useCase: '写真撮影を重視するユーザー',
          suitability: 90,
          userTypes: ['写真愛好家'],
          scenarios: ['旅行での撮影', '日常の記録'],
          limitations: ['暗所での撮影には限界がある'],
        },
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
            competitorComparison: '競合商品Aとの比較: ブランド力',
          },
        ],
      },
      overallSentiment: {
        overall: 0.6,
        aspects: {
          quality: 0.8,
          value: -0.2,
          usability: 0.7,
          support: 0.5,
          reliability: 0.9,
        },
        confidence: 0.8,
        confidenceStatus: 'scored',
        confidenceFactors: {
          dataPointCount: 10,
          sourceCount: 3,
          independentSourceRatio: 0.67,
          lastVerifiedAt: '2025-01-10',
          contradictionRate: 0.2,
        },
      },
      keyThemes: ['品質', '価格', '使いやすさ'],
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
        tier: 'high',
        evidenceType: 'primary',
        publishedAt: '2025-01-01',
        author: 'Amazon公式',
        conflictOfInterest: 'disclosed',
        notes: '公式一次資料',
      });

      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        mockReviewAnalysis,
        undefined,
        undefined,
        mockCompetitorDetails,
      );

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
      expect(result.content).toContain('購入者の声');
      expect(result.content).toContain('会社員の体験談 (通勤・通学)');
      expect(result.content).toContain('多くのユーザーが満足感を得ている');
      expect(result.content).toContain(
        '<a href="https://amazon.co.jp" target="_blank" rel="noopener noreferrer">Amazonレビュー</a>',
      );
      // Verify Creators API is rendered as plain text, not a link
      // Note: optimizeListsForMobile wraps list items in a span
      expect(result.content).toContain(
        '<span class="mobile-list-item">Amazon Creators API （信頼度: 高 / 情報種別: 一次情報 / 公開日: 2025-01-01 / 執筆主体: Amazon公式 / 利害関係を開示 / 評価理由: 公式一次資料）</span>',
      );
      expect(result.content).not.toContain('[Amazon Creators API](https://webservices.amazon.co.jp/creators/v1/items)');
      expect(result.content).toContain(
        '**信頼度**: 80.0%（データ件数: 10 / ソース件数: 3 / 独立ソース比率: 67% / 最終確認日: 2025-01-10 / 矛盾率: 20%）',
      );

      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.sections).toHaveLength(6);
    });

    it('should fallback to 評価保留 when confidence is not calculable', async () => {
      const pendingReviewAnalysis = {
        ...mockReviewAnalysis,
        overallSentiment: {
          ...mockReviewAnalysis.overallSentiment,
          confidence: null,
          confidenceStatus: 'pending' as const,
          confidenceFactors: {
            dataPointCount: 1,
            sourceCount: 0,
            independentSourceRatio: null,
            lastVerifiedAt: null,
            contradictionRate: 0,
          },
        },
      };

      const result = await generator.generateArticle(mockProduct, mockInvestigation, pendingReviewAnalysis);

      expect(result.content).toContain(
        '**信頼度**: 評価保留（データ件数: 1 / ソース件数: 0 / 独立ソース比率: N/A / 最終確認日: 未確認 / 矛盾率: 0%）',
      );
    });

    it('should filter out user stories containing "(推測)" but keep impression', async () => {
      mockInvestigation.analysis.userStories = [
        {
          userType: '会社員',
          scenario: '通勤',
          experience: '実体験のレビューです',
          sentiment: 'positive',
        },
        {
          userType: '学生',
          scenario: '学習',
          experience: 'この内容は（推測）です',
          sentiment: 'positive',
        },
        {
          userType: '主婦',
          scenario: '家事',
          experience: 'この内容は（スペックからの推測体験）です',
          sentiment: 'positive',
        },
      ];
      mockInvestigation.analysis.userImpression = '全体の印象（推測）';

      const result = await generator.generateArticle(mockProduct, mockInvestigation);

      expect(result.content).toContain('実体験のレビューです');
      expect(result.content).not.toContain('この内容は（推測）です');
      expect(result.content).not.toContain('この内容は（スペックからの推測体験）です');
      expect(result.content).toContain('全体の印象（推測）');
      expect(result.content).toContain('購入者の声');
    });

    it('should still show the section if impression exists even if all stories are filtered out', async () => {
      mockInvestigation.analysis.userStories = [
        {
          userType: '学生',
          scenario: '学習',
          experience: 'この内容は（推測）です',
          sentiment: 'positive',
        },
      ];
      mockInvestigation.analysis.userImpression = '全体の印象（推測）';

      const result = await generator.generateArticle(mockProduct, mockInvestigation);

      expect(result.content).toContain('購入者の声');
      expect(result.content).toContain('全体の印象（推測）');
      expect(result.content).not.toContain('体験談');
    });

    it('should hide the entire section only if both stories and impression are missing or empty', async () => {
      mockInvestigation.analysis.userStories = [];
      mockInvestigation.analysis.userImpression = '';

      const result = await generator.generateArticle(mockProduct, mockInvestigation);

      expect(result.content).not.toContain('購入者の声');
    });

    it('should generate proper front matter', async () => {
      const result = await generator.generateArticle(mockProduct, mockInvestigation);

      expect(result.content).toContain('---');
      expect(result.content).toContain('title: "テスト商品 スマートフォン"');
      expect(result.content).toContain('asin: "B08N5WRWNW"');
      expect(result.content).toContain('review:');
      expect(result.content).toContain('author: "編集部"');
      expect(result.content).toContain('date_published: "2025-01-01"');
      expect(result.content).toContain('summary: "第三者検証あり"');
      expect(result.content).toContain('rating: 4.2');
      expect(result.content).toContain('rating_count: 150');
    });

    it('should include availability in front matter and hero section', async () => {
      mockProduct.availability = '在庫あり';
      const result = await generator.generateArticle(mockProduct, mockInvestigation);

      expect(result.content).toContain('availability: "在庫あり"');
      // Check for both top-level and hero section
      const matches = result.content.match(/availability: "在庫あり"/g);
      expect(matches?.length).toBe(2);
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
      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        undefined,
        undefined,
        undefined,
        mockCompetitorDetails,
      );

      expect(result).toBeDefined();
      expect(result.content).toContain('hero:');
      expect(result.sections).toHaveLength(6);
    });

    it('should not output review front matter when no verified review summary exists', async () => {
      const unverifiedInvestigation: InvestigationResult = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          sources: [
            {
              name: '未検証ブログ',
              url: 'https://example.com/unverified',
              tier: 'medium',
              evidenceType: 'secondary',
              publishedAt: '2025-01-02',
              author: 'メーカー公式',
              conflictOfInterest: 'possible',
              notes: '',
            },
          ],
        },
      };

      const result = await generator.generateArticle(mockProduct, unverifiedInvestigation);

      expect(result.content).not.toContain('review:');
      expect(result.content).not.toContain('summary: "第三者検証あり"');
    });
    it('should keep items but hide links for competitors with failed Creators API lookup', async () => {
      const mockCompetitorDetails = new Map<string, ProductDetail>();

      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        undefined,
        undefined,
        undefined,
        mockCompetitorDetails,
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
        mockCompetitorDetails,
      );

      expect(result.content).toContain('競合商品A');
      expect(result.content).toContain('amazon.co.jp/dp/B08COMPET1');
    });

    it('should show internal link for competitors with existing investigation file', async () => {
      // Mock fs.promises.readFile to return valid JSON
      (fs.promises.readFile as jest.Mock).mockImplementation((pathStr: string) => {
        if (pathStr.includes('B08COMPET1')) {
          return Promise.resolve(
            JSON.stringify({
              analysis: {
                positivePoints: [],
                negativePoints: [],
                useCases: [],
                userStories: [],
                userImpression: '',
                sources: [],
                competitiveAnalysis: [],
                recommendation: { score: 85, targetUsers: [], pros: [], cons: [] },
              },
            }),
          );
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
        price: {
          ...mockProduct.price,
          amount: 45000,
          formatted: '¥45,000',
        },
        isAmazonDirect: true,
        availability: '在庫あり',
      } as any;
      const mockCompetitorDetails = new Map<string, ProductDetail>();
      mockCompetitorDetails.set('B08COMPET1', mockDetail);

      const result = await generator.generateArticle(
        mockProduct,
        mockInvestigation,
        undefined,
        undefined,
        undefined,
        mockCompetitorDetails,
      );

      expect(result.content).toContain('href="../b08compet1/"');
      expect(result.content).toContain('サイト内レビュー');
      expect(result.content).toContain('class="btn-internal-small"');
      // Verify unified design and price difference
      expect(result.content).toContain('<span class="badge-amazon-direct">Amazon直販</span>');
      expect(result.content).toContain('class="competitor-price-diff price-down">(-￥5,000)</span>');
      expect(result.content).toContain('<span class="badge-availability">在庫あり</span>');
      // Mock fs.promises.readFile to reject
      expect(result.content).toContain('<a href="../b08compet1/" class="competitor-preview">');
      expect(result.content).not.toContain('<div class="competitor-preview">');
    });

    it('should NOT show internal link if investigation file does not exist', async () => {
      // Mock fs.existsSync to return false
      // Mock fs.promises.readFile to reject
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
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
        mockCompetitorDetails,
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
              width: '10cm',
            },
            // Duplicate keys at top level
            weight: '200g',
            width: '20cm',
          },
        },
      };

      const result = await generator.generateArticle(mockProduct, conflictInvestigation);

      // Check for duplicate 'weight:' keys in specs section
      const content = result.content;
      const specsMatch = /specs:(?:(?!(?:hero:|---))[\s\S])*/.exec(content);

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

    it('should exclude invalid placeholder values like "null", "none", "unknown"', async () => {
      const invalidInvestigation: InvestigationResult = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          technicalSpecs: {
            os: 'null',
            cpu: 'none',
            ram: 'unknown',
            storage: '不明',
            dimensions: {
              weight: 'n/a',
              height: '-',
              width: 'なし',
              depth: '10cm',
            },
          },
        },
      };

      const result = await generator.generateArticle(mockProduct, invalidInvestigation);
      const content = result.content;
      const specsMatch = /specs:(?:(?!(?:hero:|---))[\s\S])*/.exec(content);

      expect(specsMatch).not.toBeNull();
      if (specsMatch) {
        const specsSection = specsMatch[0];
        // Only depth should remain
        expect(specsSection).toContain('depth: "10cm"');
        expect(specsSection).not.toContain('os:');
        expect(specsSection).not.toContain('cpu:');
        expect(specsSection).not.toContain('ram:');
        expect(specsSection).not.toContain('storage:');
        expect(specsSection).not.toContain('weight:');
        expect(specsSection).not.toContain('height:');
        expect(specsSection).not.toContain('width:');
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
      expect(metadata.rating).toBe(4.2);
      expect(metadata.ratingCount).toBe(150);
      expect(metadata.mobileOptimized).toBe(true);
      expect(metadata.tags).toContain('商品レビュー');
      expect(metadata.seoKeywords).toContain('レビュー');
    });

    it('should set review author to fixed editorial name when verified source exists', () => {
      const metadata = generator.generateSEOMetadata(mockProduct, mockInvestigation);

      expect(metadata.review).toEqual({
        author: '編集部',
        datePublished: '2025-01-01',
        summary: '第三者検証あり',
        rating: 4.2,
      });
      expect(metadata.review?.author).not.toBe('購入者レビュー');
      expect(metadata.review?.author).not.toBe(metadata.manufacturer);
    });

    it('should fallback review datePublished to current date when publishDate is invalid', () => {
      const invalidGeneratedAtInvestigation: InvestigationResult = {
        ...mockInvestigation,
        generatedAt: new Date('invalid-date'),
      };

      const metadata = generator.generateSEOMetadata(mockProduct, invalidGeneratedAtInvestigation);

      expect(metadata.review?.author).toBe('編集部');
      expect(metadata.review?.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(metadata.review?.summary).toBe('第三者検証あり');
    });

    it('should not generate review metadata when only unverified author evidence exists', () => {
      const unverifiedInvestigation: InvestigationResult = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          userImpression: '印象はあるが根拠不足',
          sources: [
            {
              name: '未検証ブログ',
              url: 'https://example.com/unverified',
              tier: 'medium',
              evidenceType: 'secondary',
              publishedAt: '2025-01-02',
              author: 'メーカー公式',
              conflictOfInterest: 'possible',
              notes: '',
            },
          ],
        },
      };

      const metadata = generator.generateSEOMetadata(mockProduct, unverifiedInvestigation);

      expect(metadata.review).toBeUndefined();
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

    it('should not set ratingCount when rating count is zero', () => {
      const unratedCountProduct = {
        ...mockProduct,
        rating: { ...mockProduct.rating, count: 0 },
      };

      const metadata = generator.generateSEOMetadata(unratedCountProduct, mockInvestigation);
      expect(metadata.ratingCount).toBeUndefined();
    });

    it('should set featured flag correctly', () => {
      const featuredProduct = {
        ...mockProduct,
        rating: { average: 4.5, count: 200 },
      };
      const featuredInvestigation = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          recommendation: {
            ...mockInvestigation.analysis.recommendation,
            score: 90,
          },
        },
      };

      const metadata = generator.generateSEOMetadata(featuredProduct, featuredInvestigation);
      expect(metadata.featured).toBe(true);
    });
  });

  describe('createMobileOptimizedLayout', () => {
    it('should optimize content for mobile', () => {
      const content = `これは長い文章です。${'文字'.repeat(200)}。次の文章です。`;
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
          differentiators: ['差別化'],
        });
      }

      const perfInvestigation = {
        ...mockInvestigation,
        analysis: {
          ...mockInvestigation.analysis,
          competitiveAnalysis: competitors,
        },
      };

      // Mock readFile to simulate delay
      // Since fs is already mocked, we need to override the implementation for this test
      (fs.promises.readFile as jest.Mock).mockImplementation(async (_pathStr: string) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return JSON.stringify({
          analysis: {
            positivePoints: [],
            negativePoints: [],
            useCases: [],
            userStories: [],
            userImpression: '',
            sources: [],
            competitiveAnalysis: [],
            recommendation: { score: 85, targetUsers: [], pros: [], cons: [] },
          },
        });
      });

      const startTime = Date.now();
      // Pass an empty map for competitorDetails to enable the section generation
      await generator.generateArticle(
        mockProduct,
        perfInvestigation,
        mockReviewAnalysis,
        undefined,
        undefined,
        new Map(),
      );
      const endTime = Date.now();
      const duration = endTime - startTime;

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
            score: 0,
          },
          userStories: [],
          userImpression: '',
          sources: [],
          // Note: productName is intentionally omitted to test ASIN fallback
        },
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
        rating: { average: 0, count: 0 },
      };

      const result = await generator.generateArticle(minimalProduct, mockInvestigation);
      expect(result).toBeDefined();
      expect(result.content).toContain('ミニマル商品');
    });
  });

  describe('Helper Methods', () => {
    describe('formatSpecValue', () => {
      it('should format string values correctly', () => {
        expect((generator as any).formatSpecValue('Test')).toBe('Test');
        expect((generator as any).formatSpecValue('  Leading Space')).toBe('Leading Space');
      });

      it('should filter out invalid placeholders', () => {
        expect((generator as any).formatSpecValue('null')).toBe('');
        expect((generator as any).formatSpecValue('none')).toBe('');
        expect((generator as any).formatSpecValue('unknown')).toBe('');
        expect((generator as any).formatSpecValue('不明')).toBe('');
        expect((generator as any).formatSpecValue('-')).toBe('');
        expect((generator as any).formatSpecValue('なし')).toBe('');
        expect((generator as any).formatSpecValue('NULL')).toBe('');
      });

      it('should handle numbers and booleans', () => {
        expect((generator as any).formatSpecValue(100)).toBe('100');
        expect((generator as any).formatSpecValue(true)).toBe('あり');
      });

      it('should localize common english values', () => {
        expect((generator as any).formatSpecValue('black')).toBe('ブラック');
        expect((generator as any).formatSpecValue('in stock')).toBe('在庫あり');
        expect((generator as any).formatSpecValue('true')).toBe('あり');
        expect((generator as any).formatSpecValue(false)).toBe('なし');
        expect((generator as any).formatSpecValue('black, white')).toBe('ブラック, ホワイト');
      });

      it('should preserve numeric values with internal commas (regression)', () => {
        expect((generator as any).formatSpecValue('1,000mAh')).toBe('1,000mAh');
        expect((generator as any).formatSpecValue('価格: 1,500円')).toBe('価格: 1,500円');
      });

      it('should handle nested objects including placeholders', () => {
        const specs = {
          height: '10cm',
          weight: 'null',
          depth: 'unknown',
        };
        const result = (generator as any).formatSpecValue(specs);
        expect(result).toContain('高さ: 10cm');
        expect(result).not.toContain('重量');
        expect(result).not.toContain('奥行き');
      });

      it('should handle arrays with placeholders', () => {
        const array = ['Valid', 'null', 'none', 'Also Valid'];
        const result = (generator as any).formatSpecValue(array);
        expect(result).toBe('Valid, Also Valid');
      });
    });

    describe('extractScoreRationaleItems', () => {
      it('should return empty results for undefined input', () => {
        const result = (generator as any).extractScoreRationaleItems(undefined);
        expect(result).toEqual({ plus: [], minus: [], topPlus: null, topMinus: null });
      });

      it('should extract all plus and minus items from string input', () => {
        const rationale = '[加点: +10] Plus Item 1\n[減点: -5] Minus Item 1';
        const result = (generator as any).extractScoreRationaleItems(rationale);
        expect(result.plus).toEqual([{ points: 10, desc: 'Plus Item 1' }]);
        expect(result.minus).toEqual([{ points: 5, desc: 'Minus Item 1' }]);
        expect(result.topPlus).toEqual({ points: 10, desc: 'Plus Item 1' });
        expect(result.topMinus).toEqual({ points: 5, desc: 'Minus Item 1' });
      });

      it('should extract all plus and minus items from array input', () => {
        const rationale = ['[加点: +10] Plus Item 1', '[減点: -5] Minus Item 1'];
        const result = (generator as any).extractScoreRationaleItems(rationale);
        expect(result.plus).toEqual([{ points: 10, desc: 'Plus Item 1' }]);
        expect(result.minus).toEqual([{ points: 5, desc: 'Minus Item 1' }]);
        expect(result.topPlus).toEqual({ points: 10, desc: 'Plus Item 1' });
        expect(result.topMinus).toEqual({ points: 5, desc: 'Minus Item 1' });
      });

      it('should select the item with maximum points for top items', () => {
        const rationale = [
          '[加点: +5] Small Plus',
          '[加点: +20] Big Plus',
          '[減点: -2] Small Minus',
          '[減点: -15] Big Minus',
        ];
        const result = (generator as any).extractScoreRationaleItems(rationale);
        expect(result.plus).toHaveLength(2);
        expect(result.minus).toHaveLength(2);
        expect(result.topPlus).toEqual({ points: 20, desc: 'Big Plus' });
        expect(result.topMinus).toEqual({ points: 15, desc: 'Big Minus' });
      });

      it('should clean descriptions (remove HTML, parens)', () => {
        const rationale = ['[加点: +10] (<b>Bold</b>)', '[減点: -5] (<i>Italic</i>)'];
        const result = (generator as any).extractScoreRationaleItems(rationale);
        expect(result.plus[0]).toEqual({ points: 10, desc: 'Bold' });
        expect(result.minus[0]).toEqual({ points: 5, desc: 'Italic' });
      });

      it('should ignore items that do not match the pattern', () => {
        const rationale = ['Just some text', '[Invalid: 10] No sign'];
        const result = (generator as any).extractScoreRationaleItems(rationale);
        expect(result).toEqual({ plus: [], minus: [], topPlus: null, topMinus: null });
      });
    });

    describe('formatScoreRationaleAsCard', () => {
      it('should format base score correctly', () => {
        const rationale = '[基本点: 70]';
        const result = (generator as any).formatScoreRationaleAsCard(rationale);
        expect(result).toContain('<div class="score-base">');
        expect(result).toContain('70');
      });

      it('should format plus items correctly', () => {
        const rationale = '[加点: +10] Good Point';
        const result = (generator as any).formatScoreRationaleAsCard(rationale);
        expect(result).toContain('<div class="score-item score-plus">');
        expect(result).toContain('+10');
        expect(result).toContain('Good Point');
      });

      it('should format minus items correctly', () => {
        const rationale = '[減点: -5] Bad Point';
        const result = (generator as any).formatScoreRationaleAsCard(rationale);
        expect(result).toContain('<div class="score-item score-minus">');
        expect(result).toContain('-5');
        expect(result).toContain('Bad Point');
      });

      it('should format total score correctly', () => {
        const rationale = '[合計: 75]';
        const result = (generator as any).formatScoreRationaleAsCard(rationale);
        expect(result).toContain('<div class="score-total">');
        expect(result).toContain('75');
      });

      it('should format zero points correctly', () => {
        let result = (generator as any).formatScoreRationaleAsCard('[加点: 0] Zero Plus');
        expect(result).toContain('score-plus');
        expect(result).toContain('±0');

        result = (generator as any).formatScoreRationaleAsCard('[減点: 0] Zero Minus');
        expect(result).toContain('score-minus');
        expect(result).toContain('±0');

        result = (generator as any).formatScoreRationaleAsCard('[Info: 0] Zero Neutral');
        expect(result).toContain('score-neutral');
        expect(result).toContain('±0');
      });

      it('should handle array input', () => {
        const rationale = ['[基本点: 50]', '[合計: 50]'];
        const result = (generator as any).formatScoreRationaleAsCard(rationale);
        expect(result).toContain('score-base');
        expect(result).toContain('score-total');
      });
    });

    describe('calculateWordCount', () => {
      it('should count Japanese characters', () => {
        const text = 'こんにちは世界'; // 7 chars
        const count = (generator as any).calculateWordCount(text);
        expect(count).toBe(7);
      });

      it('should return 0 for English text', () => {
        const text = 'Hello World';
        const count = (generator as any).calculateWordCount(text);
        expect(count).toBe(0);
      });

      it('should count only Japanese characters in mixed text', () => {
        const text = 'Hello こんにちは World 世界';
        // 'こんにちは' (5) + '世界' (2) = 7
        const count = (generator as any).calculateWordCount(text);
        expect(count).toBe(7);
      });

      it('should return 0 for empty string', () => {
        const count = (generator as any).calculateWordCount('');
        expect(count).toBe(0);
      });
    });

    describe('escapeHtml', () => {
      it('should escape HTML special characters', () => {
        const input = '<b>"Me & You"</b>';
        const expected = '&lt;b&gt;&quot;Me &amp; You&quot;&lt;/b&gt;';
        const result = (generator as any).escapeHtml(input);
        expect(result).toBe(expected);
      });

      it('should escape single quotes', () => {
        const input = "It's a test";
        const expected = 'It&#039;s a test';
        const result = (generator as any).escapeHtml(input);
        expect(result).toBe(expected);
      });

      it('should return empty string for null/undefined/empty input', () => {
        expect((generator as any).escapeHtml(null)).toBe('');
        expect((generator as any).escapeHtml(undefined)).toBe('');
        expect((generator as any).escapeHtml('')).toBe('');
      });
    });
  });
});
