/**
 * Property-based tests for ReviewAnalyzer
 * **Feature: amazon-product-research-system, Property 5: Investigation Result Processing Completeness**
 */

import * as fc from 'fast-check';
import { ReviewAnalyzer } from '../ReviewAnalyzer';
import { InvestigationResult, CompetitiveProduct } from '../../types/JulesTypes';
import { Product } from '../../types/Product';

describe('ReviewAnalyzer Property Tests', () => {
  let analyzer: ReviewAnalyzer;

  beforeAll(() => {
    analyzer = new ReviewAnalyzer();
  });

  /**
   * Property 5: Investigation Result Processing Completeness
   * **Validates: Requirements 2.3, 5.3**
   * 
   * For any Jules investigation response, the system should successfully extract all required 
   * analysis components (pros/cons, competitive insights, user experiences) and structure them 
   * for article generation.
   */
  test('Property 5: Investigation Result Processing Completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary InvestigationResult objects
        fc.record({
          sessionId: fc.uuid(),
          product: fc.record({
            asin: fc.string({ minLength: 10, maxLength: 10 }).map(s => s.toUpperCase()),
            title: fc.string({ minLength: 10, maxLength: 100 }),
            category: fc.oneof(
              fc.constant('Electronics'),
              fc.constant('Home & Garden'),
              fc.constant('Sports & Outdoors')
            ),
            price: fc.record({
              amount: fc.float({ min: 1, max: 1000 }),
              currency: fc.constant('USD'),
              formatted: fc.string({ minLength: 5, maxLength: 15 })
            }),
            images: fc.record({
              primary: fc.webUrl(),
              thumbnails: fc.array(fc.webUrl(), { maxLength: 3 })
            }),
            specifications: fc.dictionary(
              fc.string({ minLength: 3, maxLength: 15 }),
              fc.string({ minLength: 3, maxLength: 30 }),
              { minKeys: 1, maxKeys: 5 }
            ),
            availability: fc.string({ minLength: 5, maxLength: 20 }),
            rating: fc.record({
              average: fc.float({ min: 1, max: 5 }),
              count: fc.integer({ min: 0, max: 1000 })
            })
          }),
          analysis: fc.record({
            positivePoints: fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
            negativePoints: fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 0, maxLength: 8 }),
            useCases: fc.array(fc.string({ minLength: 15, maxLength: 150 }), { minLength: 1, maxLength: 5 }),
            competitiveAnalysis: fc.array(
              fc.record({
                name: fc.string({ minLength: 5, maxLength: 50 }),
                priceComparison: fc.string({ minLength: 10, maxLength: 100 }),
                featureComparison: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { maxLength: 5 }),
                differentiators: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { maxLength: 3 })
              }),
              { minLength: 1, maxLength: 5 }
            ),
            recommendation: fc.record({
              targetUsers: fc.array(fc.string({ minLength: 5, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
              pros: fc.array(fc.string({ minLength: 10, maxLength: 80 }), { minLength: 1, maxLength: 8 }),
              cons: fc.array(fc.string({ minLength: 10, maxLength: 80 }), { minLength: 0, maxLength: 6 }),
              score: fc.integer({ min: 0, max: 100 })
            })
          }),
          generatedAt: fc.date()
        }),
        async (investigationResult: InvestigationResult) => {
          // Process investigation result
          const analysisResult = await analyzer.analyzeInvestigationResult(investigationResult);

          // Verify all required analysis components are extracted (Requirements 2.3, 5.3)
          
          // 1. Pros/cons analysis completeness
          expect(analysisResult.positiveInsights).toBeDefined();
          expect(analysisResult.negativeInsights).toBeDefined();
          expect(analysisResult.positiveInsights.length).toBeGreaterThan(0);
          
          // Each insight should have required structure
          analysisResult.positiveInsights.forEach(insight => {
            expect(insight.category).toBeDefined();
            expect(insight.insight).toBeDefined();
            expect(insight.frequency).toBeGreaterThan(0);
            expect(['high', 'medium', 'low']).toContain(insight.impact);
            expect(Array.isArray(insight.examples)).toBe(true);
          });

          // 2. Competitive insights extraction
          expect(analysisResult.competitivePositioning).toBeDefined();
          expect(Array.isArray(analysisResult.competitivePositioning.strengths)).toBe(true);
          expect(Array.isArray(analysisResult.competitivePositioning.weaknesses)).toBe(true);
          expect(Array.isArray(analysisResult.competitivePositioning.differentiators)).toBe(true);
          expect(['leader', 'challenger', 'follower', 'niche']).toContain(
            analysisResult.competitivePositioning.marketPosition
          );

          // 3. User experiences analysis
          expect(analysisResult.useCaseAnalysis).toBeDefined();
          expect(analysisResult.useCaseAnalysis.length).toBeGreaterThan(0);
          
          analysisResult.useCaseAnalysis.forEach(useCase => {
            expect(useCase.useCase).toBeDefined();
            expect(useCase.suitability).toBeGreaterThanOrEqual(0);
            expect(useCase.suitability).toBeLessThanOrEqual(100);
            expect(Array.isArray(useCase.userTypes)).toBe(true);
            expect(Array.isArray(useCase.scenarios)).toBe(true);
            expect(Array.isArray(useCase.limitations)).toBe(true);
          });

          // 4. Structured output for article generation
          expect(analysisResult.overallSentiment).toBeDefined();
          expect(analysisResult.overallSentiment.overall).toBeGreaterThanOrEqual(-1);
          expect(analysisResult.overallSentiment.overall).toBeLessThanOrEqual(1);
          expect(analysisResult.overallSentiment.confidence).toBeGreaterThanOrEqual(0);
          expect(analysisResult.overallSentiment.confidence).toBeLessThanOrEqual(1);

          // 5. Key themes extraction
          expect(Array.isArray(analysisResult.keyThemes)).toBe(true);
          expect(analysisResult.keyThemes.length).toBeLessThanOrEqual(5);

          // 6. Verify data consistency
          const totalOriginalPoints = investigationResult.analysis.positivePoints.length + 
                                    investigationResult.analysis.negativePoints.length;
          const totalProcessedInsights = analysisResult.positiveInsights.length + 
                                       analysisResult.negativeInsights.length;
          expect(totalProcessedInsights).toBe(totalOriginalPoints);
        }
      ),
      { numRuns: 100 }
    );
  });
});