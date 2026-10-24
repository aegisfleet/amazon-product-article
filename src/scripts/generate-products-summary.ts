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
  description: string;
  url: string;
  image: string;
}

export interface GenerateSummaryOptions {
  articlesDir?: string;
  outputPath?: string;
  baseUrl?: string;
}

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const ASIN_REGEX = /asin:\s*["']?([A-Z0-9]{10})["']?/i;
const TITLE_REGEX = /title:\s*["']?(.*?)["']?(?:\r?\n|$)/;
const DESCRIPTION_REGEX = /description:\s*["']?(.*?)["']?(?:\r?\n|$)/;
const BRAND_REGEX = /brand:\s*["']?(.*?)["']?(?:\r?\n|$)/;
const CATEGORIES_REGEX = /categories:\s*\[\s*["']?([^"'\]]+)/;
const PRICE_REGEX = /price:\s*["']?(.*?)["']?(?:\r?\n|$)/;
const SCORE_REGEX = /score:\s*(\d+)/;
const IMAGES_INLINE_REGEX = /images:\s*\[\s*["']([^"']+)["']/;
const IMAGES_BLOCK_REGEX = /images:\s*(?:\r?\n)+\s*-\s*["']?([^"'\r\n]+)["']?/;
const IMAGE_SINGLE_REGEX = /image:\s*["']?([^"'\r\n]+)["']?/;

export function extractFirstImage(fm: string): string {
  const inlineMatch = IMAGES_INLINE_REGEX.exec(fm);
  if (inlineMatch?.[1]) {
    return inlineMatch[1].trim();
  }
  const blockMatch = IMAGES_BLOCK_REGEX.exec(fm);
  if (blockMatch?.[1]) {
    return blockMatch[1].trim();
  }
  const singleMatch = IMAGE_SINGLE_REGEX.exec(fm);
  if (singleMatch?.[1]) {
    return singleMatch[1].trim();
  }
  return '';
}

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
  const description = DESCRIPTION_REGEX.exec(fm)?.[1]?.trim() ?? '';
  const brand = BRAND_REGEX.exec(fm)?.[1]?.trim() ?? '';
  const category = CATEGORIES_REGEX.exec(fm)?.[1]?.trim() ?? '';
  const priceRaw = PRICE_REGEX.exec(fm)?.[1] ?? '';
  const price = parsePrice(priceRaw);
  const score = Number.parseInt(SCORE_REGEX.exec(fm)?.[1] ?? '0', 10) || 0;
  const image = extractFirstImage(fm);

  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  return {
    asin,
    title,
    brand,
    category,
    price,
    score,
    description,
    url: `${cleanBaseUrl}${asin.toLowerCase()}/`,
    image,
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
  const targetFiles = files.filter((file) => file.endsWith('.md') && file !== '_index.md');

  // Promise.all による並行読み込み・パース処理（直列 await の解消と高速化）
  const results = await Promise.all(
    targetFiles.map(async (file) => {
      try {
        const content = await fs.promises.readFile(path.join(articlesDir, file), 'utf-8');
        return parseProductSummary(content, baseUrl);
      } catch {
        return null;
      }
    }),
  );

  const items: ProductSummaryItem[] = results.filter((item): item is ProductSummaryItem => item !== null);

  // 独自スコア降順（同点の場合は価格昇順、さらに同点ならASIN順）でソート
  // AIツールが大きなJSONの読み取り途中で切断されても、高評価商品が先頭から確実に取得できるようにする
  items.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.price !== b.price) {
      return a.price - b.price;
    }
    return a.asin.localeCompare(b.asin);
  });

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
