
import fs from 'fs/promises';
import { CreatorsAPIClient } from '../../api/CreatorsAPIClient';
import { Product, ProductSearchResult } from '../../types/Product';
import { ProductSearcher } from '../ProductSearcher';

// Mock dependencies
jest.mock('../../api/CreatorsAPIClient');
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
    let mockCreatorsClient: jest.Mocked<CreatorsAPIClient>;

    beforeEach(() => {
        mockCreatorsClient = new CreatorsAPIClient() as jest.Mocked<CreatorsAPIClient>;
        searcher = new ProductSearcher(mockCreatorsClient);
        jest.clearAllMocks();

        // Default mocks
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.readdir as jest.Mock).mockResolvedValue([]);
        (fs.readFile as jest.Mock).mockResolvedValue('{}');
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
            mockCreatorsClient.getProductDetails.mockResolvedValue(mockProduct as any);

            const session = await searcher.searchByAsins(asins);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockCreatorsClient.getProductDetails).toHaveBeenCalledTimes(2);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockCreatorsClient.getProductDetails).toHaveBeenCalledWith('B000000001');
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockCreatorsClient.getProductDetails).toHaveBeenCalledWith('B000000002');
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

            mockCreatorsClient.searchProducts.mockResolvedValue(mockResult);

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

            mockCreatorsClient.searchProducts.mockResolvedValue(mockResult);

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

    describe('getAllStoredProducts', () => {
        it('should retrieve stored products from enabled categories', async () => {
            // Mock fs.readdir to return files for 'electronics' category
            (fs.readdir as jest.Mock).mockImplementation((pathStr: string) => {
                const normalizedPath = pathStr.replace(/\\/g, '/');
                if (normalizedPath.endsWith('categories/electronics')) {
                    return Promise.resolve(['session1.json']);
                }
                return Promise.resolve([]);
            });

            // Mock fs.readFile
            (fs.readFile as jest.Mock).mockImplementation((pathStr: string) => {
                const normalizedPath = pathStr.replace(/\\/g, '/');
                if (normalizedPath.endsWith('session1.json')) {
                    return Promise.resolve(JSON.stringify({
                        products: [{ asin: 'B001', title: 'Product 1' }]
                    }));
                }
                return Promise.resolve('{}');
            });

            const result = await searcher.getAllStoredProducts();

            // electronics is a default category, so it should be checked
            expect(result['electronics']).toBeDefined();
            expect(result['electronics']?.[0]?.asin).toBe('B001');
        });
    });
});
