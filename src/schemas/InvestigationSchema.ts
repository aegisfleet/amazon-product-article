import { z } from 'zod';

/**
 * JSONファイルの実際の構造（analysisのみを含む）
 */
export const InvestigationFileSchema = z.object({
  analysis: z
    .object({
      positivePoints: z.array(z.string()),
      negativePoints: z.array(z.string()),
      useCases: z.array(z.string()),
      userStories: z.array(
        z.object({
          userType: z.string(),
          scenario: z.string(),
          experience: z.string(),
          sentiment: z.enum(['positive', 'negative', 'mixed']),
        }),
      ),
      userImpression: z.string(),
      sources: z.array(
        z.object({
          name: z.string(),
          url: z.string().nullable().optional(),
          tier: z.enum(['high', 'medium', 'low']).optional(),
          evidenceType: z.enum(['primary', 'secondary']).optional(),
          publishedAt: z.string().optional(),
          author: z.string().optional(),
          conflictOfInterest: z.enum(['none', 'possible', 'disclosed', 'unknown']).optional(),
          notes: z.string().optional(),
        }),
      ),
      competitiveAnalysis: z.array(
        z.object({
          name: z.string(),
          asin: z.string().nullable().optional(),
          priceComparison: z.string(),
          featureComparison: z.array(z.string()),
          differentiators: z.array(z.string()),
        }),
      ),
      recommendation: z
        .object({
          targetUsers: z.array(z.string()),
          pros: z.array(z.string()),
          cons: z.array(z.string()),
          score: z.number(),
        })
        .passthrough(),
      lastInvestigated: z.string().optional(),
    })
    .passthrough(),
});

export type InvestigationFileContent = z.infer<typeof InvestigationFileSchema>;
