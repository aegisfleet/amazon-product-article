#!/usr/bin/env ts-node
/**
 * Product Investigation Prompt Generation CLI Script
 * GitHub Actions (hosted runner) から実行され、調査対象商品のプロンプトとマニフェストを
 * data/prompts/ 配下に生成するスクリプト。
 * 生成されたプロンプトは self-hosted runner 上の Antigravity CLI (agy) で実行される。
 *
 * 環境変数:
 *   MAX_INVESTIGATION_PRODUCTS - 最大調査件数 (デフォルト: 30)
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { formatInvestigationPrompt } from '../jules/prompts';
import type { Product } from '../types/Product';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface PromptManifestItem {
  asin: string;
  title: string;
  promptFile: string;
}

export interface PromptManifest {
  generatedAt: string;
  totalProducts: number;
  items: PromptManifestItem[];
}

async function loadProducts(): Promise<Product[]> {
  const sessionFile = path.join(process.cwd(), 'data', 'products', 'latest-session.json');

  try {
    const data = await fs.readFile(sessionFile, 'utf-8');
    const session = JSON.parse(data) as { results?: Array<{ products?: Product[] }> };

    // すべてのカテゴリから商品を収集
    const products: Product[] = [];
    for (const result of session.results || []) {
      products.push(...(result.products || []));
    }

    return products;
  } catch (error) {
    logger.error('Failed to load products:', error);
    return [];
  }
}

/**
 * latest-session.json から調査対象商品を読み込み、data/prompts/ にプロンプトと manifest.json を生成する
 */
export async function generateInvestigationPromptsFromSession(maxProducts: number, shuffle = true): Promise<number> {
  const promptsDir = path.join(process.cwd(), 'data', 'prompts');
  await fs.mkdir(promptsDir, { recursive: true });

  const products = await loadProducts();
  if (products.length === 0) {
    logger.warn('No products to investigate');
    await setGitHubOutput('prompts-generated', '0');
    await setGitHubOutput('total-products', '0');
    await setGitHubOutput('has-prompts', 'false');
    return 0;
  }

  logger.info(`Loaded ${products.length} products`);

  const candidateProducts = [...products];
  if (shuffle) {
    for (let i = candidateProducts.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [candidateProducts[i], candidateProducts[j]] = [candidateProducts[j]!, candidateProducts[i]!];
    }
  }

  const productsToInvestigate = candidateProducts.slice(0, maxProducts);
  logger.info(
    `Generating prompts for ${productsToInvestigate.length} products (${shuffle ? 'shuffled' : 'ordered'} from ${products.length} found)`,
  );

  const items: PromptManifestItem[] = [];

  for (const product of productsToInvestigate) {
    if (!/^[A-Z0-9]{10}$/i.test(product.asin)) {
      logger.warn(`Skipping product with invalid ASIN: ${product.asin}`);
      continue;
    }

    const prompt = formatInvestigationPrompt(product);
    const relativePromptPath = path.posix.join('data', 'prompts', `${product.asin}.txt`);
    const fullPromptPath = path.join(process.cwd(), 'data', 'prompts', `${product.asin}.txt`);

    await fs.writeFile(fullPromptPath, prompt, 'utf-8');
    items.push({
      asin: product.asin,
      title: product.title,
      promptFile: relativePromptPath,
    });

    logger.info(`Generated investigation prompt for ${product.asin}: ${product.title}`);
  }

  const manifest: PromptManifest = {
    generatedAt: new Date().toISOString(),
    totalProducts: items.length,
    items,
  };

  const manifestPath = path.join(promptsDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  await setGitHubOutput('prompts-generated', items.length.toString());
  await setGitHubOutput('total-products', productsToInvestigate.length.toString());
  await setGitHubOutput('has-prompts', items.length > 0 ? 'true' : 'false');

  logger.info(`Investigation prompts generated: ${items.length}/${productsToInvestigate.length} products`);
  return items.length;
}

async function main(): Promise<void> {
  logger.info('Starting investigation prompt generation CLI...');

  try {
    const maxProducts = Number.parseInt(process.env.MAX_INVESTIGATION_PRODUCTS || '30', 10);
    const shuffle = !process.argv.includes('--no-shuffle');

    logger.info(`Max products to investigate: ${maxProducts} (shuffle: ${shuffle})`);
    await generateInvestigationPromptsFromSession(maxProducts, shuffle);
    process.exit(0);
  } catch (error) {
    logger.error('Investigation prompt generation failed:', error);
    await setGitHubOutput('prompts-generated', '0');
    await setGitHubOutput('has-prompts', 'false');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
