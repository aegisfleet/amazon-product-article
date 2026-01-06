import fs from 'fs';
import path from 'path';
import { ProductDetail } from '../../types/Product';
import { PAAPICache } from '../PAAPICache';

jest.mock('fs');
jest.mock('../../utils/Logger', () => ({
    Logger: {
        getInstance: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        })
    }
}));

describe('PAAPICache', () => {
    const mockCacheDir = 'data/cache/test';
    const mockCachePath = path.join(process.cwd(), mockCacheDir, 'paapi-product-cache.json');
    let cache: PAAPICache;

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        cache = new PAAPICache(24, 1, mockCacheDir);
    });

    const mockProduct: ProductDetail = {
        asin: 'B000AR4WPW',
        title: 'Test Product',
        category: 'Test',
        price: { amount: 1000, currency: 'JPY', formatted: '￥1,000' },
        images: { primary: 'img.jpg', thumbnails: [] },
        specifications: {},
        rating: { average: 0, count: 0 },
        detailPageUrl: 'https://amazon.co.jp/dp/B000AR4WPW',
        features: []
    };

    test('should return null for expired valid entries', () => {
        const now = Date.now();
        const past = now - (25 * 60 * 60 * 1000); // 25 hours ago

        // Manually set cache state for testing expiration
        (cache as any).cache['B001'] = {
            data: mockProduct,
            timestamp: past,
            status: 'valid'
        };

        expect(cache.get('B001')).toBeNull();
    });

    test('should return data for non-expired valid entries', () => {
        cache.set('B002', mockProduct);
        expect(cache.get('B002')).toEqual(mockProduct);
    });

    test('should return true for fresh invalid entries', () => {
        // Mock file exists to use shortened invalidTtl
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        cache.markInvalid('B003');
        expect(cache.isInvalid('B003')).toBe(true);
        expect(cache.get('B003')).toBeNull();
    });

    test('should use invalidTtl (short) when investigation file exists', () => {
        const now = Date.now();
        const past = now - (2 * 60 * 60 * 1000); // 2 hours ago (invalid TTL is 1 hour)

        (cache as any).cache['B004'] = {
            data: null,
            timestamp: past,
            status: 'invalid'
        };

        // File exists => should use invalidTtl (1h) => should be expired (false)
        (fs.existsSync as jest.Mock).mockImplementation((p: string) => p.includes('B004.json'));
        expect(cache.isInvalid('B004')).toBe(false);
    });

    test('should use standard ttl (long) when investigation file DOES NOT exist', () => {
        const now = Date.now();
        const past = now - (2 * 60 * 60 * 1000); // 2 hours ago (invalid TTL is 1 hour, standard is 24h)

        (cache as any).cache['B005'] = {
            data: null,
            timestamp: past,
            status: 'invalid'
        };

        // File DOES NOT exist => should use standard ttl (24h) => should NOT be expired (true)
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        expect(cache.isInvalid('B005')).toBe(true);
    });

    test('getMissingAsins should respect selective TTL logic', () => {
        const now = Date.now();
        const pastInvalid = now - (2 * 60 * 60 * 1000); // 2h ago

        // ASIN with file: should be expired (missing: true)
        (cache as any).cache['WITH_FILE'] = { data: null, timestamp: pastInvalid, status: 'invalid' };
        // ASIN without file: should NOT be expired (missing: false)
        (cache as any).cache['WITHOUT_FILE'] = { data: null, timestamp: pastInvalid, status: 'invalid' };

        (fs.existsSync as jest.Mock).mockImplementation((p: string) => p.includes('WITH_FILE.json'));

        const missing = cache.getMissingAsins(['WITH_FILE', 'WITHOUT_FILE']);

        expect(missing).toContain('WITH_FILE');
        expect(missing).not.toContain('WITHOUT_FILE');
    });
});
