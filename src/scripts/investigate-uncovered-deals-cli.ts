#!/usr/bin/env ts-node
/**
 * Investigate Uncovered Deals CLI
 * キャッシュの未調査セール商品を抽出し、調査用のプロンプトを生成する
 *
 * このスクリプトには2つのモードがある:
 *   1. --find-asins: 未調査ASINリストを抽出して GITHUB_OUTPUT に出力
 *   2. --investigate: latest-session.json を読み込んで agy 調査プロンプトを生成
 *
 * 環境変数:
 *   MAX_INVESTIGATION_PRODUCTS - 最大調査件数（デフォルト: 10）
 */

import 'dotenv/config';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';
import { findUncoveredDeals } from './find-uncovered-deals';
import { generateInvestigationPromptsFromSession } from './jules-investigation-cli';

const logger = Logger.getInstance();

/**
 * モード1: 未調査セールASINリストを抽出して GITHUB_OUTPUT に書き出す
 */
async function findAndOutputAsins(maxProducts: number): Promise<void> {
  logger.info('Extracting uncovered deal candidates...');

  const dealsFile = await findUncoveredDeals(
    undefined,
    undefined,
    undefined,
    maxProducts * 2, // バッファとして多めに取得
    3,
    0,
  );

  if (dealsFile.totalCandidates === 0) {
    logger.warn('No uncovered deal candidates found.');
    await setGitHubOutput('asins', '');
    await setGitHubOutput('products-found', 'false');
    return;
  }

  const asins = dealsFile.candidates
    .slice(0, maxProducts)
    .map((c) => c.asin)
    .join(',');

  logger.info(`Found ${dealsFile.totalCandidates} uncovered deals. Top ${maxProducts} ASINs: ${asins}`);
  await setGitHubOutput('asins', asins);
  await setGitHubOutput('products-found', 'true');
}

async function main(): Promise<void> {
  logger.info('Starting Uncovered Deals Investigation CLI...');

  const maxProducts = Number.parseInt(process.env.MAX_INVESTIGATION_PRODUCTS || '10', 10);
  const mode = process.argv.includes('--investigate') ? 'investigate' : 'find-asins';

  try {
    if (mode === 'find-asins') {
      await findAndOutputAsins(maxProducts);
    } else {
      await generateInvestigationPromptsFromSession(maxProducts, false);
    }
    process.exit(0);
  } catch (error) {
    logger.error('Uncovered deals investigation failed:', error);
    await setGitHubOutput('prompts-generated', '0');
    await setGitHubOutput('has-prompts', 'false');
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
