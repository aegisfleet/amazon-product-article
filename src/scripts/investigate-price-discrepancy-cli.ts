#!/usr/bin/env ts-node
/**
 * Investigate Price Discrepancy CLI (案5)
 * 価格乖離のある商品を再調査する Jules セッションを開始する
 *
 * このスクリプトには2つのモードがある:
 *   1. --find-asins: 価格乖離ASINリストを抽出して GITHUB_OUTPUT に出力（search:products ステップで使用）
 *   2. --investigate: latest-session.json を読み込んで Jules セッションを開始（investigate ステップで使用）
 *
 * 環境変数:
 *   JULES_API_KEY               - Jules API キー
 *   JULES_SOURCE                - Jules ソース名
 *   JULES_STARTING_BRANCH       - 開始ブランチ（デフォルト: main）
 *   MAX_INVESTIGATION_PRODUCTS  - 最大調査件数（デフォルト: 10）
 *   PRICE_DISCREPANCY_THRESHOLD - 乖離率閾値%（デフォルト: 15）
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JulesInvestigator } from '../jules/JulesInvestigator';
import { saveSessionInfo } from '../jules/SessionManager';
import type { JulesCredentials, SourceContext } from '../types/JulesTypes';
import type { Product } from '../types/Product';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';
import { findPriceDiscrepancy } from './find-price-discrepancy';

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

/**
 * モード2: latest-session.json から商品を読み込んで Jules セッションを開始
 */
async function investigateProducts(
  apiKey: string,
  source: string,
  startingBranch: string,
  maxProducts: number,
): Promise<void> {
  const sessionFile = path.join(process.cwd(), 'data', 'products', 'latest-session.json');
  const products: Product[] = [];

  try {
    const data = await fs.readFile(sessionFile, 'utf-8');
    const session = JSON.parse(data) as { results?: Array<{ products?: Product[] }> };
    for (const result of session.results || []) {
      products.push(...(result.products || []));
    }
  } catch (error) {
    logger.error('Failed to load products from latest-session.json:', error);
    await setGitHubOutput('sessions-started', '0');
    process.exit(0);
  }

  if (products.length === 0) {
    logger.warn('No products to investigate');
    await setGitHubOutput('sessions-started', '0');
    process.exit(0);
  }

  const productsToInvestigate = products.slice(0, maxProducts);
  logger.info(`Investigating ${productsToInvestigate.length} products`);

  const credentials: JulesCredentials = { apiKey };
  const investigator = new JulesInvestigator(credentials);
  const sourceContext: SourceContext = {
    source,
    githubRepoContext: { startingBranch },
  };

  let startedSessions = 0;
  for (const product of productsToInvestigate) {
    try {
      if (!/^[A-Z0-9]{10}$/i.test(product.asin)) {
        logger.warn(`Skipping invalid ASIN: ${product.asin}`);
        continue;
      }
      logger.info(`Starting investigation for: ${product.title} (${product.asin})`);
      const sessionInfo = await investigator.startInvestigation(product, sourceContext);
      await saveSessionInfo(product, sessionInfo);
      startedSessions++;
      logger.info(`Session started: ${sessionInfo.sessionId}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error(`Failed to start investigation for ${product.asin}:`, error);
    }
  }

  await setGitHubOutput('sessions-started', startedSessions.toString());
  logger.info(
    `Price discrepancy investigation complete: ${startedSessions}/${productsToInvestigate.length} sessions started`,
  );
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
      const apiKey = process.env.JULES_API_KEY;
      const source = process.env.JULES_SOURCE;
      const startingBranch = process.env.JULES_STARTING_BRANCH || 'main';
      if (!apiKey) throw new Error('Missing required environment variable: JULES_API_KEY');
      if (!source) throw new Error('Missing required environment variable: JULES_SOURCE');
      await investigateProducts(apiKey, source, startingBranch, maxProducts);
    }
    process.exit(0);
  } catch (error) {
    logger.error('Price discrepancy investigation failed:', error);
    await setGitHubOutput('sessions-started', '0');
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
