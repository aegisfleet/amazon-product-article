
import fs from 'fs/promises';
import { CreatorsAPIClient } from '../api/CreatorsAPIClient';
import { ProductSearcher } from '../search/ProductSearcher';
import { ProductSearchResult } from '../types/Product';

// Mock dependencies
jest.mock('../api/CreatorsAPIClient');
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

// Mock config
jest.mock('../config/ConfigManager', () => {
    return {
        ConfigManager: {
            getInstance: jest.fn().mockReturnValue({
                getConfig: jest.fn().mockReturnValue({
                    productSearch: {
                        categories: [] // Will be ignored because we mock getEnabledCategories logic via categories.json import indirectly or we can mock the method
                    }
                })
            })
        }
    };
});

describe('ProductSearcher Performance Benchmark', () => {
    let searcher: ProductSearcher;
    let mockCreatorsClient: jest.Mocked<CreatorsAPIClient>;

    // Setup 100 categories
    const NUM_CATEGORIES = 100;
    const CATEGORIES = Array.from({ length: NUM_CATEGORIES }, (_, i) => ({
        name: `cat_${i}`,
        searchIndex: 'All',
        keywords: ['test'],
        maxResults: 10,
        enabled: true
    }));

    beforeEach(() => {
        mockCreatorsClient = new CreatorsAPIClient() as jest.Mocked<CreatorsAPIClient>;
        searcher = new ProductSearcher(mockCreatorsClient);
        jest.clearAllMocks();

        // Mock getEnabledCategories to return our large list
        // We can't easily mock a private method, so we'll mock the config import or just override the property if possible.
        // Or we can cast to any.
        (searcher as any).getEnabledCategories = jest.fn().mockReturnValue(CATEGORIES);

        // Mock fs.readdir to simulate finding session files
        (fs.readdir as jest.Mock).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10)); // 10ms I/O delay
            return ['session1.json'];
        });

        // Mock fs.readFile to simulate reading data
        (fs.readFile as jest.Mock).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10)); // 10ms I/O delay
            const result: ProductSearchResult = {
                products: [{ asin: '123', title: 'test', category: 'test', price: { amount: 100, currency: 'JPY', formatted: '100' }, rating: { average: 4, count: 10 }, images: { primary: '', thumbnails: [] }, specifications: {} }],
                totalResults: 1,
                searchParams: { category: 'test', keywords: ['test'], maxResults: 10 },
                timestamp: new Date()
            };
            return JSON.stringify(result);
        });
    });

    it('Benchmark: Sequential vs Parallel', async () => {
        console.log(`\nStarting Benchmark with ${NUM_CATEGORIES} categories...`);

        // 1. Sequential (Simulated)
        const startSeq = Date.now();
        const resultsSeq: Record<string, any> = {};
        for (const category of CATEGORIES) {
             resultsSeq[category.name] = await searcher.getStoredProducts(category.name);
        }
        const timeSeq = Date.now() - startSeq;
        console.log(`Sequential Time: ${timeSeq}ms`);

        // 2. Parallel (Current Implementation)
        const startPar = Date.now();
        await searcher.getAllStoredProducts();
        const timePar = Date.now() - startPar;
        console.log(`Parallel Time: ${timePar}ms`);

        expect(timePar).toBeLessThan(timeSeq);
        console.log(`Speedup: ${(timeSeq / timePar).toFixed(2)}x`);
    });
});
