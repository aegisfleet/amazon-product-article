
import { InvestigationResult } from '../../types/JulesTypes';
import { Product, ProductDetail } from '../../types/Product';
import { ArticleGenerator } from '../ArticleGenerator';

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

describe('ArticleGenerator Affiliate Links', () => {
    let generator: ArticleGenerator;
    let mockProduct: Product;
    let mockInvestigation: InvestigationResult;

    beforeEach(() => {
        generator = new ArticleGenerator();
        mockProduct = {
            asin: 'B00TESTPRD', // Valid 10 chars
            title: 'Test Product',
            category: 'Test Category',
            price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
            images: { primary: 'img.jpg', thumbnails: [] },
            specifications: {},
            rating: { average: 4.5, count: 100 }
        };

        mockInvestigation = {
            sessionId: 'test-session',
            product: mockProduct,
            analysis: {
                positivePoints: [],
                negativePoints: [],
                useCases: [],
                competitiveAnalysis: [],
                recommendation: { targetUsers: [], pros: [], cons: [], score: 80 },
                userStories: [],
                userImpression: '',
                sources: []
            },
            generatedAt: new Date()
        };
    });

    it('should generate affiliate link for competitor with ASIN', async () => {
        mockInvestigation.analysis.competitiveAnalysis = [
            {
                name: 'Competitor A',
                asin: 'B00COMPETA', // Valid 10 chars
                priceComparison: 'Same price',
                featureComparison: ['Feature 1'],
                differentiators: ['Diff 1']
            }
        ];

        const mockCompetitorDetails = new Map<string, ProductDetail>();
        mockCompetitorDetails.set('B00COMPETA', { ...mockProduct, asin: 'B00COMPETA', detailPageUrl: 'https://www.amazon.co.jp/dp/B00COMPETA' } as any);

        const result = await generator.generateArticle(mockProduct, mockInvestigation, undefined, undefined, undefined, mockCompetitorDetails);

        // New format: competitor links appear in HTML anchor tags
        expect(result.content).toContain('https://www.amazon.co.jp/dp/B00COMPETA');
        // Table format includes links
        expect(result.content).toContain('Competitor A');
    });

    it('should use default name for competitor without ASIN', async () => {
        mockInvestigation.analysis.competitiveAnalysis = [
            {
                name: 'Competitor B',
                priceComparison: 'Cheaper',
                featureComparison: ['Feature 1'],
                differentiators: ['Diff 1']
            }
        ];

        const result = await generator.generateArticle(mockProduct, mockInvestigation, undefined, undefined, undefined, new Map());

        // Check if the competitor section uses just the name (new card format)
        expect(result.content).toContain('<h4>Competitor B</h4>');
        // Should not contain affiliate link for competitor without ASIN
        expect(result.content).not.toContain('https://www.amazon.co.jp/dp/B00COMPETITORB');
    });
});
