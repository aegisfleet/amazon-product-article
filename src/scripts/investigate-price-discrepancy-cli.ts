#!/usr/bin/env ts-node
/**
 * Investigate Price Discrepancy CLI
 * 価格乖離のある商品を抽出し、再調査用のプロンプトを生成する
 *
 * このスクリプトには2つのモードがある:
 *   1. --find-asins: 価格乖離ASINリストを抽出して GITHUB_OUTPUT に出力（search:products ステップで使用）
 *   2. --investigate: latest-session.json を読み込んで agy 調査プロンプトを生成
 *
 * 環境変数:
 *   MAX_INVESTIGATION_PRODUCTS  - 最大調査件数（デフォルト: 10）
 *   PRICE_DISCREPANCY_THRESHOLD - 乖離率閾値%（デフォルト: 15）
 */

import 'dotenv/config';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';
import { findPriceDiscrepancy } from './find-price-discrepancy';
import { generateInvestigationPromptsFromSession } from './jules-investigation-cli';

const logger = Logger.getInstance();

/**
 * モード1: 価格乖離のASINリストを抽出して GITHUB_OUTPUT に書き出す
 */
async function findAndOutputAsins(
  maxProducts: number,
  threshold: number,
  cooldownDays: number,
  investigatedPriceThreshold: number,
): Promise<void> {
  logger.info(
    `Extracting price discrepancy candidates (threshold: ${threshold}%, investigatedThreshold: ${investigatedPriceThreshold}%, cooldown: ${cooldownDays}d)...`,
  );

  const discrepancyFile = await findPriceDiscrepancy(
    undefined,
    undefined,
    undefined,
    threshold,
    maxProducts * 2, // バッファとして多めに取得
    cooldownDays,
    investigatedPriceThreshold,
  );

  if (discrepancyFile.totalCandidates === 0) {
    logger.warn('No price discrepancy candidates found.');
    await setGitHubOutput('asins', '');
    await setGitHubOutput('products-found', 'false');
    return;
  }

  const asins = discrepancyFile.candidates
    .slice(0, maxProducts)
    .map((c) => c.asin)
    .join(',');

  logger.info(`Found ${discrepancyFile.totalCandidates} candidates. Top ${maxProducts} ASINs: ${asins}`);
  await setGitHubOutput('asins', asins);
  await setGitHubOutput('products-found', 'true');
}

async function main(): Promise<void> {
  logger.info('Starting Price Discrepancy Investigation CLI...');

  const maxProducts = Number.parseInt(process.env.MAX_INVESTIGATION_PRODUCTS || '10', 10);
  const threshold = Number.parseInt(process.env.PRICE_DISCREPANCY_THRESHOLD || '15', 10);
  const cooldownDays = Number.parseInt(process.env.PRICE_DISCREPANCY_COOLDOWN_DAYS || '30', 10);
  const investigatedPriceThreshold = Number.parseInt(process.env.INVESTIGATED_PRICE_DISCREPANCY_THRESHOLD || '30', 10);
  const mode = process.argv.includes('--investigate') ? 'investigate' : 'find-asins';

  try {
    if (mode === 'find-asins') {
      await findAndOutputAsins(maxProducts, threshold, cooldownDays, investigatedPriceThreshold);
    } else {
      await generateInvestigationPromptsFromSession(maxProducts, false);
    }
    process.exit(0);
  } catch (error) {
    logger.error('Price discrepancy investigation failed:', error);
    await setGitHubOutput('prompts-generated', '0');
    await setGitHubOutput('has-prompts', 'false');
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
