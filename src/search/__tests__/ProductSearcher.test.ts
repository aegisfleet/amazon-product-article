
import fs from 'fs/promises';
import { PAAPIClient } from '../../api/PAAPIClient';
import { Product, ProductSearchResult } from '../../types/Product';
import { ProductSearcher } from '../ProductSearcher';

// Mock dependencies
jest.mock('../../api/PAAPIClient');
jest.mock('fs/promises');
jest.mock('../../utils/Logger', () => {
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

            // Mock fs.readdir to return the existing ASIN folder in content/articles
            (fs.readdir as jest.Mock).mockImplementation((pathStr: string) => {
                const normalizedPath = pathStr.replace(/\\/g, '/');
                if (normalizedPath.includes('/content/articles') || normalizedPath.endsWith('articles')) {
                    return Promise.resolve([existingAsin]);
                }
                return Promise.resolve([]);
            });

            const session = await searcher.searchAllCategories();

            // Should have filtered out existingAsin
            const allProducts = session.results.flatMap(r => r.products);
            expect(allProducts.find(p => p.asin === existingAsin)).toBeUndefined();
            expect(allProducts.find(p => p.asin === newAsin)).toBeDefined();
        });

        it('should exclude products in data/investigations', async () => {
            // @ts-expect-error - Accessing private method for testing
            searcher.sleep = jest.fn().mockResolvedValue(undefined);

            const existingAsin = 'B0INVESTIG';
            const newAsin = 'B0NEW00001';

            const mockResult: ProductSearchResult = {
                products: [
                    { asin: existingAsin, title: 'In Investigation', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} },
                    { asin: newAsin, title: 'New', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} }
                ],
                totalResults: 2,
                searchParams: { category: 'Test', keywords: ['test'], maxResults: 10 },
                timestamp: new Date()
            };

            mockPapiClient.searchProducts.mockResolvedValue(mockResult);

            // Mock fs.access to succeed for investigations
            (fs.access as jest.Mock).mockResolvedValue(undefined);

            // Mock fs.readdir to return the existing ASIN.json in investigations
            (fs.readdir as jest.Mock).mockImplementation((pathStr: string) => {
                const normalizedPath = pathStr.replace(/\\/g, '/');
                if (normalizedPath.includes('/data/investigations') || normalizedPath.endsWith('investigations')) {
                    return Promise.resolve([`${existingAsin}.json`]);
                }
                return Promise.resolve([]);
            });

            const session = await searcher.searchAllCategories();

            // Should have filtered out existingAsin
            const allProducts = session.results.flatMap(r => r.products);
            // NOTE: In some test environments, path matching for mocks might be sensitive.
            // The logic has been manually verified with verify-exclusion.ts.
            expect(allProducts.find(p => p.asin === existingAsin)).toBeUndefined();
            expect(allProducts.find(p => p.asin === newAsin)).toBeDefined();
        });
    });

    describe('searchByKeywords', () => {
        beforeEach(() => {
            // @ts-expect-error - Accessing private method for testing
            searcher.sleep = jest.fn().mockResolvedValue(undefined);
        });

        it('should exclude existing products by default', async () => {
            const existingAsin = 'B0EXISTING';
            const newAsin = 'B0NEW00000';

            mockPapiClient.searchProducts.mockResolvedValue({
                products: [
                    { asin: existingAsin, title: 'Existing', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} },
                    { asin: newAsin, title: 'New', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} }
                ],
                totalResults: 2,
                searchParams: { category: 'All', keywords: ['test'], maxResults: 10 },
                timestamp: new Date()
            });

            (fs.readdir as jest.Mock).mockImplementation((pathStr: string) => {
                if (pathStr.includes('articles')) return Promise.resolve([existingAsin]);
                return Promise.resolve([]);
            });

            const session = await searcher.searchByKeywords(['test']);
            const products = session.results[0]!.products;

            expect(products.find(p => p.asin === existingAsin)).toBeUndefined();
            expect(products.find(p => p.asin === newAsin)).toBeDefined();
        });

        it('should NOT exclude existing products when ignoreExclusion is true', async () => {
            const existingAsin = 'B0EXISTING';
            mockPapiClient.searchProducts.mockResolvedValue({
                products: [
                    { asin: existingAsin, title: 'Existing', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} }
                ],
                totalResults: 1,
                searchParams: { category: 'All', keywords: ['test'], maxResults: 10 },
                timestamp: new Date()
            });

            (fs.readdir as jest.Mock).mockImplementation((pathStr: string) => {
                if (pathStr.includes('articles')) return Promise.resolve([existingAsin]);
                return Promise.resolve([]);
            });

            const session = await searcher.searchByKeywords(['test'], 10, undefined, true);
            const products = session.results[0]!.products;

            expect(products.find(p => p.asin === existingAsin)).toBeDefined();
        });

        it('should fetch next page if filtered results are less than maxResults', async () => {
            const existingAsin = 'B0EXISTING';
            const newAsin = 'B0NEW00000';

            // Page 1: only existing product
            mockPapiClient.searchProducts.mockResolvedValueOnce({
                products: [{ asin: existingAsin, title: 'Existing', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} }],
                totalResults: 2,
                searchParams: { category: 'All', keywords: ['test'], maxResults: 2, itemPage: 1 },
                timestamp: new Date()
            });

            // Page 2: new product
            mockPapiClient.searchProducts.mockResolvedValueOnce({
                products: [{ asin: newAsin, title: 'New', category: 'Test', price: { amount: 0, currency: 'JPY', formatted: '' }, rating: { average: 0, count: 0 }, images: { primary: '', thumbnails: [] }, specifications: {} }],
                totalResults: 2,
                searchParams: { category: 'All', keywords: ['test'], maxResults: 2, itemPage: 2 },
                timestamp: new Date()
            });

            (fs.readdir as jest.Mock).mockImplementation((pathStr: string) => {
                if (pathStr.includes('articles')) return Promise.resolve([existingAsin]);
                return Promise.resolve([]);
            });

            const session = await searcher.searchByKeywords(['test'], 2, undefined, false, 2);

            expect(mockPapiClient.searchProducts).toHaveBeenCalledTimes(2);
            expect(mockPapiClient.searchProducts).toHaveBeenNthCalledWith(1, expect.objectContaining({ itemPage: 1 }));
            expect(mockPapiClient.searchProducts).toHaveBeenNthCalledWith(2, expect.objectContaining({ itemPage: 2 }));

            const products = session.results[0]!.products;
            expect(products.length).toBe(1);
            expect(products[0]!.asin).toBe(newAsin);
        });
    });
});
