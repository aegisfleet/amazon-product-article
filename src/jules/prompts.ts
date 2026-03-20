import type { Product } from '../types/Product';
import { InvestigationPromptBuilder } from './InvestigationPromptBuilder';
import { RecommendationPromptBuilder } from './RecommendationPromptBuilder';

/**
 * Jules Investigation Prompts
 *
 * Handles the generation of prompts for the Jules API investigation sessions.
 */

/**
 * 調査プロンプトを生成
 */
export function formatInvestigationPrompt(product: Product): string {
  return new InvestigationPromptBuilder(product).build();
}

/**
 * 本日の注目商品10選調査プロンプトを生成
 */
export function formatRecommendationPrompt(): string {
  return new RecommendationPromptBuilder().build();
}
