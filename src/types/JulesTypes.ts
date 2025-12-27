/**
 * Google Jules API types and interfaces
 */

import { Product } from './Product';

export interface JulesCredentials {
  apiKey: string;
  projectId: string;
  region?: string;
}

export interface InvestigationContext {
  product: Product;
  focusAreas: string[];
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
  includeCompetitors: boolean;
}

export interface JulesSessionRequest {
  prompt: string;
  context: InvestigationContext;
  sessionConfig?: {
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
  };
}

export interface JulesSessionResponse {
  sessionId: string;
  status: 'created' | 'processing' | 'completed' | 'failed';
  estimatedCompletionTime?: number;
  message?: string;
}

export interface SessionStatus {
  sessionId: string;
  status: 'created' | 'processing' | 'completed' | 'failed' | 'timeout';
  progress?: number;
  currentStep?: string;
  estimatedTimeRemaining?: number;
  error?: string;
}

export interface CompetitiveProduct {
  name: string;
  asin?: string;
  priceComparison: string;
  featureComparison: string[];
  differentiators: string[];
}

export interface InvestigationResult {
  sessionId: string;
  product: Product;
  analysis: {
    positivePoints: string[];
    negativePoints: string[];
    useCases: string[];
    competitiveAnalysis: CompetitiveProduct[];
    recommendation: {
      targetUsers: string[];
      pros: string[];
      cons: string[];
      score: number;
    };
  };
  generatedAt: Date;
  rawResponse?: string;
}

export interface JulesError {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
}

export interface JulesApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: JulesError;
  requestId?: string;
}