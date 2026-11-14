/**
 * Types for Gemini Decisions API and Category Classification
 */

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
}

export type DecisionQuestion = ChoiceQuestion | NoulQuestion;

export interface DecisionChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface DecisionNoulAnswer {
  probability: number;
  confidence: number;
}

export type DecisionAnswer = DecisionChoiceAnswer | DecisionNoulAnswer;

export interface DecisionRequest {
  model?: string;
  input: string;
  questions: Record<string, DecisionQuestion>;
}

export interface DecisionResponse {
  answers: Record<string, DecisionChoiceAnswer>;
}

export interface ProductClassificationInput {
  title: string;
  brand?: string | undefined;
  specsSummary?: string | undefined;
  description?: string | undefined;
  amazonCategory?: string | undefined;
}

export interface ClassificationResult {
  parentSlug: string;
  parentConfidence: number;
  childSlug: string;
  childConfidence: number;
  parentRunnerUp?: { slug: string; probability: number } | undefined;
  childRunnerUp?: { slug: string; probability: number } | undefined;
  needsReview: boolean;
  inputHash: string;
  source: 'gemini-decision-1' | 'fallback-map';
  classifiedAt: string;
}
