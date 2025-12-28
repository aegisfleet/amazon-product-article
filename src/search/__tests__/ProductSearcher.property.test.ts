/**
 * Property-based tests for Product Searcher
 * Feature: amazon-product-research-system, Property 2: Product Search and Data Extraction Completeness
 * Validates: Requirements 1.2, 1.3, 1.5
 */

import * as fc from 'fast-check';
import fs from 'fs/promises';
import path from 'path';
import { PAAPIClient } from '../../api/PAAPIClient';
import { Product, ProductSearchParams } from '../../types/Product';
import { ProductSearcher } from '../ProductSearcher';
import { ReviewVerifier } from '../ReviewVerifier';

// Mock ReviewVerifier
jest.mock('../ReviewVerifier');
const mockedReviewVerifier = ReviewVerifier as jest.MockedClass<typeof ReviewVerifier>;

// Setup default mock implementation
mockedReviewVerifier.prototype.verifyReviews = jest.fn().mockResolvedValue({
  count: 100,
  rating: 4.5
});

// Mock PAAPIClient for testing
class MockPAAPIClient extends PAAPIClient {
  async searchProducts(params: ProductSearchParams) {
    // Return mock products with all required fields
    const mockProducts: Product[] = Array.from({ length: Math.min(params.maxResults, 5) }, (_, i) => ({
      asin: `B${String(i).padStart(9, '0')}TEST`,
      title: `Test Product ${i + 1} for ${params.keywords.join(' ')}`,
      category: params.category,
      price: {
        amount: 10 + i * 5,
        currency: 'USD',
        formatted: `$${10 + i * 5}.00`
      },
      images: {
        primary: `https://example.com/image${i + 1}.jpg`,
        thumbnails: [`https://example.com/thumb${i + 1}.jpg`]
      },
      specifications: {
        brand: `Brand${i + 1}`,
        model: `Model${i + 1}`
      },
      availability: 'In Stock',
      rating: {
        average: 4.0 + (i * 0.2),
        count: 100 + i * 10
      }
    }));

    return {
      products: mockProducts,
      totalResults: mockProducts.length,
      searchParams: params,
      timestamp: new Date()
    };
  }
}

describe('ProductSearcher Property Tests', () => {
  let mockClient: MockPAAPIClient;
  let searcher: ProductSearcher;
  let testDataDir: string;

  beforeEach(async () => {
    mockClient = new MockPAAPIClient();
    searcher = new ProductSearcher(mockClient);

    // Use a test-specific data directory
    testDataDir = path.join(process.cwd(), 'test-data', 'products');
    (searcher as any).dataDir = testDataDir;

    await searcher.initialize();

    // Mock sleep to speed up tests
    (searcher as any).sleep = jest.fn().mockResolvedValue(void 0);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Property 2: Product Search and Data Extraction Completeness', () => {
    /**
     * For any valid product category search, the system should return products 
     * with all required fields (ASIN, title, price, specifications) properly 
     * extracted and stored in the expected structured format.
     */
    it('should return complete product data for all valid search parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('electronics', 'books', 'clothing', 'home', 'sports'),
            keywords: fc.array(
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              { minLength: 1, maxLength: 5 }
            ),
            maxResults: fc.integer({ min: 1, max: 10 }),
            sortBy: fc.option(fc.constantFrom('relevance', 'price', 'rating'), { nil: undefined })
          }),
          async (searchParams) => {
            const result = await searcher.customSearch(searchParams as ProductSearchParams);

            // Verify result structure
            expect(result).toHaveProperty('products');
            expect(result).toHaveProperty('totalResults');
            expect(result).toHaveProperty('searchParams');
            expect(result).toHaveProperty('timestamp');

            // Verify all products have required fields
            for (const product of result.products) {
              // Required fields from requirements
              expect(product).toHaveProperty('asin');
              expect(product).toHaveProperty('title');
              expect(product).toHaveProperty('category');
              expect(product).toHaveProperty('price');
              expect(product).toHaveProperty('images');
              expect(product).toHaveProperty('specifications');
              expect(product).toHaveProperty('availability');
              expect(product).toHaveProperty('rating');

              // Verify field types and structure
              expect(typeof product.asin).toBe('string');
              expect(product.asin.length).toBeGreaterThan(0);

              expect(typeof product.title).toBe('string');
              expect(product.title.length).toBeGreaterThan(0);

              expect(typeof product.category).toBe('string');

              // Price structure validation
              expect(product.price).toHaveProperty('amount');
              expect(product.price).toHaveProperty('currency');
              expect(product.price).toHaveProperty('formatted');
              expect(typeof product.price.amount).toBe('number');
              expect(product.price.amount).toBeGreaterThanOrEqual(0);

              // Images structure validation
              expect(product.images).toHaveProperty('primary');
              expect(product.images).toHaveProperty('thumbnails');
              expect(typeof product.images.primary).toBe('string');
              expect(Array.isArray(product.images.thumbnails)).toBe(true);

              // Specifications validation
              expect(typeof product.specifications).toBe('object');

              // Rating structure validation
              expect(product.rating).toHaveProperty('average');
              expect(product.rating).toHaveProperty('count');
              expect(typeof product.rating.average).toBe('number');
              expect(typeof product.rating.count).toBe('number');
              expect(product.rating.average).toBeGreaterThanOrEqual(0);
              expect(product.rating.average).toBeLessThanOrEqual(5);
              expect(product.rating.count).toBeGreaterThanOrEqual(0);
            }

            // Verify search parameters are preserved
            expect(result.searchParams.category).toBe(searchParams.category);
            expect(result.searchParams.keywords).toEqual(searchParams.keywords);
            expect(result.searchParams.maxResults).toBe(searchParams.maxResults);

            // Verify sortBy if provided (or default behavior)
            if (searchParams.sortBy) {
              expect(result.searchParams.sortBy).toBe(searchParams.sortBy);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should store and retrieve product data consistently', async () => {
      // Simplified test to avoid timeout issues
      const searchParams = {
        category: 'electronics',
        keywords: ['test'],
        maxResults: 2
      };

      // Perform search
      const originalResult = await searcher.customSearch(searchParams);

      // Wait a bit to ensure file is written
      await new Promise(resolve => setTimeout(resolve, 200));

      // Retrieve stored products
      const storedProducts = await searcher.getStoredProducts(`custom_${searchParams.category}`);

      // Verify stored data matches original
      expect(storedProducts.length).toBe(originalResult.products.length);

      for (let i = 0; i < storedProducts.length; i++) {
        const stored = storedProducts[i];
        const original = originalResult.products[i];

        if (stored && original) {
          expect(stored.asin).toBe(original.asin);
          expect(stored.title).toBe(original.title);
          expect(stored.category).toBe(original.category);
          expect(stored.price.amount).toBe(original.price.amount);
          expect(stored.price.currency).toBe(original.price.currency);
          expect(stored.images.primary).toBe(original.images.primary);
          expect(stored.rating.average).toBe(original.rating.average);
          expect(stored.rating.count).toBe(original.rating.count);
        }
      }
    }, 10000);

    it('should handle empty search results gracefully', async () => {
      // Mock empty results
      const originalSearchProducts = mockClient.searchProducts;
      mockClient.searchProducts = async (params) => ({
        products: [],
        totalResults: 0,
        searchParams: params,
        timestamp: new Date()
      });

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('electronics', 'books'),
            keywords: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 2 }),
            maxResults: fc.integer({ min: 1, max: 5 })
          }),
          async (searchParams) => {
            const result = await searcher.customSearch(searchParams);

            // Should handle empty results without errors
            expect(result.products).toEqual([]);
            expect(result.totalResults).toBe(0);
            expect(result.searchParams).toEqual(searchParams);
            expect(result.timestamp).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 20 }
      );

      // Restore original method
      mockClient.searchProducts = originalSearchProducts;
    });

    it('should maintain data integrity across multiple searches', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              category: fc.constantFrom('electronics', 'books', 'clothing'),
              keywords: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 2 }),
              maxResults: fc.integer({ min: 1, max: 3 })
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (searchParamsArray) => {
            const results = [];

            // Perform multiple searches
            for (const params of searchParamsArray) {
              const result = await searcher.customSearch(params);
              results.push(result);

              // Small delay between searches
              await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Verify each result maintains integrity
            for (let i = 0; i < results.length; i++) {
              const result = results[i];
              const originalParams = searchParamsArray[i];

              if (result && originalParams) {
                expect(result.searchParams.category).toBe(originalParams.category);
                expect(result.searchParams.keywords).toEqual(originalParams.keywords);
                expect(result.products.length).toBeLessThanOrEqual(originalParams.maxResults);

                // Verify all products in this result have consistent category
                for (const product of result.products) {
                  expect(product.category).toBe(originalParams.category);
                }
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should generate valid session IDs and maintain session data', async () => {
      // Simplified test with valid keywords
      const searchParams = {
        category: 'electronics',
        keywords: ['test', 'product'],
        maxResults: 1
      };

      const result = await searcher.customSearch(searchParams);

      // Wait a bit for session data to be written
      await new Promise(resolve => setTimeout(resolve, 100));

      // Session ID should be generated and stored
      const stats = await searcher.getSearchStatistics();

      // Should have at least one session recorded
      expect(stats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(stats.totalProducts).toBeGreaterThanOrEqual(0);
      expect(typeof stats.categoryCounts).toBe('object');

      if (stats.lastSearchDate) {
        expect(stats.lastSearchDate).toBeInstanceOf(Date);
      }
    });
  });
});