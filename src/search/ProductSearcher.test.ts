
import fs from 'fs/promises';
import { PAAPIClient } from '../api/PAAPIClient';
import { Product, ProductSearchResult } from '../types/Product';
import { ProductSearcher } from './ProductSearcher';

// Mock dependencies
jest.mock('../api/PAAPIClient');
jest.mock('fs/promises');
jest.mock('../utils/Logger', () => {
    return {
        Logger: {
            getInstance: jest.fn().mockReturnValue({
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn()
            })
        }
    };
});

describe('ProductSearcher', () => {
    let searcher: ProductSearcher;
    let mockPapiClient: jest.Mocked<PAAPIClient>;

    beforeEach(() => {
        mockPapiClient = new PAAPIClient() as jest.Mocked<PAAPIClient>;
        searcher = new ProductSearcher(mockPapiClient);
        jest.clearAllMocks();

        // Default mocks
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.readdir as jest.Mock).mockResolvedValue([]);
    });

    describe('searchByAsins', () => {
        it('should fetch specific ASINs', async () => {
            const asins = ['B000000001', 'B000000002'];
            const mockProduct: Product = {
                asin: 'B000000001',
                title: 'Test Product',
                price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
                rating: { average: 4.5, count: 100 },
                images: { primary: '', thumbnails: [] },
                category: 'Electronics',
                specifications: {}
            };

            // Mock getProductDetails to return mock product
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            mockPapiClient.getProductDetails.mockResolvedValue(mockProduct as any);

            const session = await searcher.searchByAsins(asins);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockPapiClient.getProductDetails).toHaveBeenCalledTimes(2);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockPapiClient.getProductDetails).toHaveBeenCalledWith('B000000001');
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockPapiClient.getProductDetails).toHaveBeenCalledWith('B000000002');
            expect(session.results.length).toBe(1); // One result batch
            expect(session.results?.[0]?.products.length).toBe(2);
            expect(session.categories).toContain('Manual');
        });
    });


    describe('searchAllCategories', () => {
        it('should exclude products in content/articles', async () => {
            // Mock sleep to return immediately
            // @ts-expect-error - Accessing private method for testing
            searcher.sleep = jest.fn().mockResolvedValue(undefined);

            // Mock searchProducts to return a product that is already investigated
            const existingAsin = 'B0EXISTING';
            const newAsin = 'B0NEW00000';

            const mockResult: ProductSearchResult = {
                products: [
                    { asin: existingAsin, title: 'Existing', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} },
                    { asin: newAsin, title: 'New', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} }
                ],
                totalResults: 2,
                searchParams: { category: 'Test', keywords: ['test'], maxResults: 10 },
                timestamp: new Date()
            };

            mockPapiClient.searchProducts.mockResolvedValue(mockResult);

            // Mock fs.readdir to return the existing ASIN folder
            (fs.readdir as jest.Mock).mockResolvedValue([existingAsin]);

            const session = await searcher.searchAllCategories();

            // Should have filtered out existingAsin
            const allProducts = session.results.flatMap(r => r.products);
            expect(allProducts.find(p => p.asin === existingAsin)).toBeUndefined();
            expect(allProducts.find(p => p.asin === newAsin)).toBeDefined();
        });
    });
});
