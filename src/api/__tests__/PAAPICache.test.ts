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
        cache.markInvalid('B003');
        expect(cache.isInvalid('B003')).toBe(true);
        expect(cache.get('B003')).toBeNull();
    });

    test('should return false for expired invalid entries (re-check needed)', () => {
        const now = Date.now();
        const past = now - (2 * 60 * 60 * 1000); // 2 hours ago (invalid TTL is 1 hour)

        (cache as any).cache['B004'] = {
            data: null,
            timestamp: past,
            status: 'invalid'
        };

        expect(cache.isInvalid('B004')).toBe(false);
    });

    test('getMissingAsins should include expired invalid entries', () => {
        const now = Date.now();
        const pastValid = now - (25 * 60 * 60 * 1000);
        const pastInvalid = now - (2 * 60 * 60 * 1000);

        (cache as any).cache['VALID_EXPIRED'] = { data: mockProduct, timestamp: pastValid, status: 'valid' };
        (cache as any).cache['INVALID_EXPIRED'] = { data: null, timestamp: pastInvalid, status: 'invalid' };
        (cache as any).cache['INVALID_FRESH'] = { data: null, timestamp: now, status: 'invalid' };

        const missing = cache.getMissingAsins(['VALID_EXPIRED', 'INVALID_EXPIRED', 'INVALID_FRESH']);

        expect(missing).toContain('VALID_EXPIRED');
        expect(missing).toContain('INVALID_EXPIRED');
        expect(missing).not.toContain('INVALID_FRESH');
    });
});
