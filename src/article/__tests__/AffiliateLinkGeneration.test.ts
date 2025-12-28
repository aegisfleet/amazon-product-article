
import { InvestigationResult } from '../../types/JulesTypes';
import { Product } from '../../types/Product';
import { ArticleGenerator } from '../ArticleGenerator';

describe('ArticleGenerator Affiliate Links', () => {
    let generator: ArticleGenerator;
    let mockProduct: Product;
    let mockInvestigation: InvestigationResult;

    beforeEach(() => {
        generator = new ArticleGenerator();
        mockProduct = {
            asin: 'B00TESTPRODUCT',
            title: 'Test Product',
            category: 'Test Category',
            price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
            images: { primary: 'img.jpg', thumbnails: [] },
            specifications: {},
            availability: 'In Stock',
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
                asin: 'B00COMPETITORA',
                priceComparison: 'Same price',
                featureComparison: [],
                differentiators: []
            }
        ];

        const result = await generator.generateArticle(mockProduct, mockInvestigation);

        // Check if the competitor section contains the affiliate link
        expect(result.content).toContain('[Competitor A](https://www.amazon.co.jp/dp/B00COMPETITORA?tag=');
    });

    it('should use default name for competitor without ASIN', async () => {
        mockInvestigation.analysis.competitiveAnalysis = [
            {
                name: 'Competitor B',
                priceComparison: 'Cheaper',
                featureComparison: [],
                differentiators: []
            }
        ];

        const result = await generator.generateArticle(mockProduct, mockInvestigation);

        // Check if the competitor section uses just the name
        expect(result.content).toContain('### Competitor Bとの比較');
        expect(result.content).not.toContain('[Competitor B](https://www.amazon.co.jp/dp/');
    });
});
