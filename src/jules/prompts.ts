import { Product } from '../types/Product';
import { InvestigationPromptBuilder } from './InvestigationPromptBuilder';

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
