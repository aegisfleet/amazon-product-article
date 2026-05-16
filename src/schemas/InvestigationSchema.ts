import { z } from 'zod';

/**
 * JSONファイルの実際の構造（analysisのみを含む）
 */
export const InvestigationFileSchema = z.looseObject({
  analysis: z.looseObject({
    positivePoints: z.array(z.string().trim()),
    negativePoints: z.array(z.string().trim()),
    useCases: z.array(z.string().trim()),
    userStories: z
      .array(
        z.object({
          userType: z.string().trim(),
          scenario: z.string().trim(),
          experience: z.string().trim(),
          sentiment: z.enum(['positive', 'negative', 'mixed']),
        }),
      )
      .optional(),
    userImpression: z.string().trim(),
    sources: z.array(
      z.object({
        name: z.string().trim(),
        url: z.string().trim().nullable().optional(),
        tier: z.enum(['high', 'medium', 'low', 'primary']).optional(),
        evidenceType: z.enum(['primary', 'secondary']).optional(),
        publishedAt: z.string().trim().optional(),
        author: z.string().trim().optional(),
        conflictOfInterest: z.enum(['none', 'possible', 'disclosed', 'unknown']).optional(),
        notes: z.string().trim().optional(),
      }),
    ),
    competitiveAnalysis: z.array(
      z.object({
        name: z.string().trim(),
        asin: z.string().trim().nullable().optional(),
        priceComparison: z.string().trim(),
        featureComparison: z.array(z.string().trim()),
        differentiators: z.array(z.string().trim()),
      }),
    ),
    recommendation: z.looseObject({
      targetUsers: z.array(z.string().trim()),
      pros: z.array(z.string().trim()),
      cons: z.array(z.string().trim()),
      score: z.number(),
    }),
    lastInvestigated: z.string().trim().optional(),
  }),
});

export type InvestigationFileContent = z.infer<typeof InvestigationFileSchema>;
