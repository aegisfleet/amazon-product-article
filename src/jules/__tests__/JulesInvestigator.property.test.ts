/**
 * Property-based tests for JulesInvestigator
 * **Feature: amazon-product-research-system, Property 4: Jules Investigation Request Formatting**
 */

import * as fc from 'fast-check';
import { JulesCredentials } from '../../types/JulesTypes';
import { Product } from '../../types/Product';
import { JulesInvestigator } from '../JulesInvestigator';

describe('JulesInvestigator Property Tests', () => {
  let investigator: JulesInvestigator;

  beforeAll(() => {
    const mockCredentials: JulesCredentials = {
      apiKey: 'test-api-key'
    };
    investigator = new JulesInvestigator(mockCredentials);
  });

  /**
   * Property 4: Jules Investigation Request Formatting
   * **Validates: Requirements 2.1, 2.2, 2.4**
   * 
   * For any product investigation request, the generated prompt should contain all required elements 
   * (user review analysis instructions, competitive comparison requirements, market positioning focus) 
   * in the proper structured format.
   */
  test('Property 4: Jules Investigation Request Formatting', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary Product objects
        fc.record({
          asin: fc.string({ minLength: 10, maxLength: 10 }).map(s => s.toUpperCase()),
          title: fc.string({ minLength: 10, maxLength: 100 }),
          category: fc.oneof(
            fc.constant('Electronics'),
            fc.constant('Home & Garden'),
            fc.constant('Sports & Outdoors'),
            fc.constant('Books'),
            fc.constant('Clothing')
          ),
          price: fc.record({
            amount: fc.float({ min: 1, max: 10000 }),
            currency: fc.constant('USD'),
            formatted: fc.string({ minLength: 5, maxLength: 20 })
          }),
          images: fc.record({
            primary: fc.webUrl(),
            thumbnails: fc.array(fc.webUrl(), { minLength: 0, maxLength: 5 })
          }),
          specifications: fc.dictionary(
            fc.string({ minLength: 3, maxLength: 20 }),
            fc.string({ minLength: 3, maxLength: 50 }),
            { minKeys: 1, maxKeys: 10 }
          ),
          availability: fc.oneof(
            fc.constant('In Stock'),
            fc.constant('Out of Stock'),
            fc.constant('Limited Stock')
          ),
          rating: fc.record({
            average: fc.float({ min: 1, max: 5 }),
            count: fc.integer({ min: 0, max: 10000 })
          })
        }),
        (product: Product) => {
          // Generate investigation prompt
          const prompt = investigator.formatInvestigationPrompt(product);

          // Verify all required elements are present

          // 1. User review analysis instructions (Requirements 2.1, 2.2)
          expect(prompt).toContain('ユーザーレビュー分析');
          expect(prompt).toContain('良い点：具体的な使用体験と満足ポイント');
          expect(prompt).toContain('悪い点：問題点と改善要望');
          expect(prompt).toContain('使用シーン：どのような場面で活用されているか');

          // 2. Competitive comparison requirements (Requirements 2.2, 2.4)
          expect(prompt).toContain('競合商品との比較');
          expect(prompt).toContain('同カテゴリの主要競合商品3-5点');
          expect(prompt).toContain('価格、機能、品質の比較');
          expect(prompt).toContain('差別化ポイントの特定');

          // 3. Market positioning focus (Requirements 2.4)
          expect(prompt).toContain('購買推奨度');
          expect(prompt).toContain('どのようなユーザーに適しているか');
          expect(prompt).toContain('購入時の注意点');
          expect(prompt).toContain('コストパフォーマンス評価');

          // 4. Product information inclusion (Requirements 2.1)
          expect(prompt).toContain(product.title);
          expect(prompt).toContain(product.asin);
          expect(prompt).toContain(product.category);
          expect(prompt).toContain(product.price.formatted);

          // 5. Structured format requirements (Requirements 2.2)
          expect(prompt).toContain('JSON形式で構造化');
          expect(prompt).toContain('"analysis"');
          expect(prompt).toContain('"positivePoints"');
          expect(prompt).toContain('"negativePoints"');
          expect(prompt).toContain('"useCases"');
          expect(prompt).toContain('"competitiveAnalysis"');
          expect(prompt).toContain('"recommendation"');

          // 6. Verify prompt is not empty and has reasonable length
          expect(prompt.length).toBeGreaterThan(500);
          expect(prompt.length).toBeLessThan(5000);

          // 7. Verify proper Japanese formatting
          expect(prompt).toMatch(/商品「.*」について/);
          expect(prompt).toContain('調査結果は以下のJSON形式で');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property test for prompt consistency
   */
  test('Property: Investigation prompt consistency', () => {
    fc.assert(
      fc.property(
        fc.record({
          asin: fc.string({ minLength: 10, maxLength: 10 }),
          title: fc.string({ minLength: 5, maxLength: 50 }),
          category: fc.string({ minLength: 3, maxLength: 20 }),
          price: fc.record({
            amount: fc.float({ min: 1, max: 1000 }),
            currency: fc.constant('USD'),
            formatted: fc.string({ minLength: 3, maxLength: 15 })
          }),
          images: fc.record({
            primary: fc.webUrl(),
            thumbnails: fc.array(fc.webUrl(), { maxLength: 3 })
          }),
          specifications: fc.dictionary(
            fc.string({ minLength: 2, maxLength: 10 }),
            fc.string({ minLength: 2, maxLength: 20 }),
            { minKeys: 0, maxKeys: 5 }
          ),
          availability: fc.string({ minLength: 5, maxLength: 20 }),
          rating: fc.record({
            average: fc.float({ min: 1, max: 5 }),
            count: fc.integer({ min: 0, max: 1000 })
          })
        }),
        (product: Product) => {
          // Generate prompt multiple times for same product
          const prompt1 = investigator.formatInvestigationPrompt(product);
          const prompt2 = investigator.formatInvestigationPrompt(product);

          // Prompts should be identical for same product (deterministic)
          expect(prompt1).toBe(prompt2);

          // Prompt should contain all product-specific information
          expect(prompt1).toContain(product.asin);
          expect(prompt1).toContain(product.title);
          expect(prompt1).toContain(product.category);
        }
      ),
      { numRuns: 50 }
    );
  });
});