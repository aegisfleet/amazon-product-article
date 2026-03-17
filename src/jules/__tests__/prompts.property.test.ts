/**
 * Property-based tests for Investigation Prompts
 * **Simplified Version: Basic Structure Validation**
 */

import * as fc from 'fast-check';
import type { Product } from '../../types/Product';
import { formatInvestigationPrompt } from '../prompts';

describe('Investigation Prompt Property Tests', () => {
  /**
   * Property: Jules Investigation Request Basics
   * 
   * Validates that the prompt contains the essential product info and follows the required format.
   * This test is simplified to avoid fragility against prompt text refinements.
   */
  test('Property: Basic structure and required elements', () => {
    fc.assert(
      fc.property(
        fc.record({
          asin: fc.string({ minLength: 10, maxLength: 10 }).map((s) => s.toUpperCase()),
          title: fc.string({ minLength: 10, maxLength: 100 }),
          category: fc.oneof(
            fc.constant('Electronics'),
            fc.constant('Home & Garden'),
            fc.constant('Beauty'),
            fc.constant('Food'),
          ),
          price: fc.record({
            amount: fc.float({ min: 1, max: 10000 }),
            currency: fc.constant('JPY'),
            formatted: fc.string({ minLength: 5, maxLength: 20 }),
          }),
          images: fc.record({
            primary: fc.webUrl(),
            thumbnails: fc.array(fc.webUrl(), { minLength: 0, maxLength: 5 }),
          }),
          specifications: fc.dictionary(
            fc.string({ minLength: 3, maxLength: 20 }),
            fc.string({ minLength: 3, maxLength: 50 }),
            { minKeys: 1, maxKeys: 10 },
          ),
          rating: fc.record({
            average: fc.float({ min: 1, max: 5 }),
            count: fc.integer({ min: 0, max: 10000 }),
          }),
        }),
        (product: Product) => {
          const prompt = formatInvestigationPrompt(product);

          // 1. Essential Product Info
          expect(prompt).toContain(product.title);
          expect(prompt).toContain(product.asin);
          expect(prompt).toContain(product.category);

          // 2. Format markers
          expect(prompt).toContain('【基本ルール】');
          expect(prompt).toContain('出力形式 (JSON)');
          expect(prompt).toContain('data/investigations/');

          // 3. New Requirements (Structural)
          expect(prompt).toContain('比較ポイント:');
          expect(prompt).toContain('選び方のポイント:');
          expect(prompt).toContain('technicalSpecs');

          // 4. Verification that prompt is long enough to contain instructions
          expect(prompt.length).toBeGreaterThan(1000);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Deterministic check: Same product should result in the same prompt
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
            currency: fc.constant('JPY'),
            formatted: fc.string({ minLength: 3, maxLength: 15 }),
          }),
          images: fc.record({
            primary: fc.webUrl(),
            thumbnails: fc.array(fc.webUrl(), { maxLength: 3 }),
          }),
          specifications: fc.dictionary(
            fc.string({ minLength: 2, maxLength: 10 }),
            fc.string({ minLength: 2, maxLength: 20 }),
            { minKeys: 0, maxKeys: 5 },
          ),
          rating: fc.record({
            average: fc.float({ min: 1, max: 5 }),
            count: fc.integer({ min: 0, max: 1000 }),
          }),
        }),
        (product: Product) => {
          const prompt1 = formatInvestigationPrompt(product);
          const prompt2 = formatInvestigationPrompt(product);
          expect(prompt1).toBe(prompt2);
        },
      ),
      { numRuns: 20 },
    );
  });
});
