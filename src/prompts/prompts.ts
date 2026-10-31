import type { Product } from '../types/Product';
import { InvestigationPromptBuilder } from './InvestigationPromptBuilder';
import { RecommendationPromptBuilder } from './RecommendationPromptBuilder';

/**
 * Product Investigation & Recommendation Prompts
 *
 * Handles the generation of prompts for Antigravity CLI (agy) investigation sessions.
 */

/**
 * 調査プロンプトを生成
 */
export function formatInvestigationPrompt(product: Product): string {
  return new InvestigationPromptBuilder(product).build();
}

/**
 * 本日の注目商品調査プロンプトを生成
 */
export function formatRecommendationPrompt(maxProducts = 10): string {
  return new RecommendationPromptBuilder(undefined, maxProducts).build();
}
