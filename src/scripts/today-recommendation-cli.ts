#!/usr/bin/env ts-node
/**
 * Today's Recommendation Prompt Generation CLI Script
 * 本日の注目商品10選を調査するためのセール候補抽出およびプロンプト生成を行う
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { formatRecommendationPrompt } from '../prompts/prompts';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';
import { extractSaleCandidates } from './extract-sale-candidates';

const logger = Logger.getInstance();

async function main(): Promise<void> {
  logger.info("Starting Today's Recommendation prompt generation CLI...");

  try {
    const maxProducts = Number.parseInt(process.env.MAX_RECOMMENDATION_PRODUCTS || '10', 10);
    logger.info(`Max recommendation products: ${maxProducts}`);

    // キャッシュからセール・値引き候補商品を事前抽出 (tmp/sale_candidates.json)
    logger.info('Extracting sale candidates from cache...');
    await extractSaleCandidates();

    // 注目商品調査プロンプトを生成
    const prompt = formatRecommendationPrompt(maxProducts);
    const promptPath = path.join(process.cwd(), 'data', 'prompts', 'recommendations-prompt.txt');
    await fs.mkdir(path.dirname(promptPath), { recursive: true });
    await fs.writeFile(promptPath, prompt, 'utf-8');

    await setGitHubOutput('has-prompt', 'true');
    logger.info(`Recommendation prompt generated successfully at ${promptPath}`);
    process.exit(0);
  } catch (error) {
    logger.error("Today's recommendation prompt generation failed:", error);
    await setGitHubOutput('has-prompt', 'false');
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
