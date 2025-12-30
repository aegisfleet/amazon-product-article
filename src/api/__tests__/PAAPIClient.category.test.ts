
import { PAAPIClient } from '../PAAPIClient';

describe('PAAPIClient Category Extraction', () => {
    let client: PAAPIClient;

    beforeEach(() => {
        client = new PAAPIClient();
    });

    it('should filter out invalid category nodes including business pricing and promotions', () => {
        const clientAny = client as any;

        const invalidCategories = [
            '【5％以上OFF】ホーム&キッチン用品 法人価格 | Amazonビジネス',
            'AmazonGlobal',
            'カテゴリー別',
            '10% OFF',
            'Prime Day セール',
            'SnS Engagement Test Grocery ASINs',
            'SnS May Promo Code Campaign Grocery',
            'Grocery_over2000_BFW24',
            'ホーム＆キッチン Winter Sale',
            '家電 ストア',
            'キッチン ストア',
            'ホームストア',
            'パソコン ストア',
            'ドラッグストア', // Should be excluded based on user request "exclude EVERYTHING ending in store"
            'Androidアプリストア'
        ];

        invalidCategories.forEach(cat => {
            expect(clientAny.isValidCategoryNode(cat)).toBe(false);
        });

        const validCategories = [
            'ホーム＆キッチン',
            'キッチン用品',
            'コーヒー・ティー用品'
        ];

        validCategories.forEach(cat => {
            expect(clientAny.isValidCategoryNode(cat)).toBe(true);
        });
    });
});
