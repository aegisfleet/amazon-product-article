#!/usr/bin/env ts-node
/**
 * Generate Products Summary Script
 * content/articles/*.md を走査し、AIやブラウジングツール向けの
 * 超軽量商品サマリーインデックス（static/products-summary.json）を生成する。
 */

import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface ProductSummaryItem {
  asin: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  score: number;
  url: string;
  affiliate_url: string;
}

export interface GenerateSummaryOptions {
  articlesDir?: string;
  outputPath?: string;
  baseUrl?: string;
}

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const ASIN_REGEX = /asin:\s*["']?([A-Z0-9]{10})["']?/i;
const TITLE_REGEX = /title:\s*["']?(.*?)["']?(?:\r?\n|$)/;
const BRAND_REGEX = /brand:\s*["']?(.*?)["']?(?:\r?\n|$)/;
const CATEGORIES_REGEX = /categories:\s*\[\s*["']?([^"'\]]+)/;
const PRICE_REGEX = /price:\s*["']?(.*?)["']?(?:\r?\n|$)/;
const SCORE_REGEX = /score:\s*(\d+)/;
const AFFILIATE_URL_REGEX = /affiliate_url:\s*["']?(.*?)["']?(?:\r?\n|$)/;

export function parsePrice(priceText: string): number {
  if (!priceText) return 0;
  const numericText = priceText.replaceAll(/[^0-9.]/g, '');
  if (!numericText) return 0;
  const base = Number.parseFloat(numericText);
  if (Number.isNaN(base)) return 0;

  if (priceText.includes('万')) {
    return Math.round(base * 10000);
  }
  if (priceText.includes('千')) {
    return Math.round(base * 1000);
  }
  return Math.round(base);
}

export function parseProductSummary(content: string, baseUrl: string): ProductSummaryItem | null {
  const match = FRONT_MATTER_REGEX.exec(content);
  if (!match?.[1]) return null;

  const fm = match[1];
  const asinMatch = ASIN_REGEX.exec(fm);
  if (!asinMatch?.[1]) return null;

  const asin = asinMatch[1].toUpperCase();
  const title = TITLE_REGEX.exec(fm)?.[1]?.trim() ?? '';
  const brand = BRAND_REGEX.exec(fm)?.[1]?.trim() ?? '';
  const category = CATEGORIES_REGEX.exec(fm)?.[1]?.trim() ?? '';
  const priceRaw = PRICE_REGEX.exec(fm)?.[1] ?? '';
  const price = parsePrice(priceRaw);
  const score = Number.parseInt(SCORE_REGEX.exec(fm)?.[1] ?? '0', 10) || 0;
  const affiliateUrl = AFFILIATE_URL_REGEX.exec(fm)?.[1]?.trim() ?? '';

  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  return {
    asin,
    title,
    brand,
    category,
    price,
    score,
    url: `${cleanBaseUrl}${asin}/`,
    affiliate_url: affiliateUrl,
  };
}

export async function generateProductsSummary(options: GenerateSummaryOptions = {}): Promise<ProductSummaryItem[]> {
  const articlesDir = options.articlesDir || path.join(process.cwd(), 'content/articles');
  const outputPath = options.outputPath || path.join(process.cwd(), 'static/products-summary.json');
  const baseUrl = options.baseUrl || 'https://www.amazon-hikaku.com/';

  if (!fs.existsSync(articlesDir)) {
    logger.warn(`Articles directory not found: ${articlesDir}`);
    return [];
  }

  const files = await fs.promises.readdir(articlesDir);
  const items: ProductSummaryItem[] = [];

  for (const file of files) {
    if (!file.endsWith('.md') || file === '_index.md') continue;

    try {
      const content = await fs.promises.readFile(path.join(articlesDir, file), 'utf-8');
      const item = parseProductSummary(content, baseUrl);
      if (item) {
        items.push(item);
      }
    } catch {
      // 読み込みエラーはスキップ
    }
  }

  // 出力ディレクトリ作成
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir, { recursive: true });
  }

  // コンパクトJSON（インデントなし）でファイルサイズを最小化
  const jsonContent = JSON.stringify(items);
  await fs.promises.writeFile(outputPath, jsonContent, 'utf-8');

  const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);
  logger.info(`Generated lightweight summary for ${items.length} products (${sizeKb} KB) at ${outputPath}`);

  return items;
}

if (require.main === module) {
  generateProductsSummary()
    .then((items) => {
      console.log(`Successfully generated products-summary.json with ${items.length} items.`);
    })
    .catch((err) => {
      console.error('Failed to generate products-summary.json:', err);
      process.exit(1);
    });
}
