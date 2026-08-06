#!/usr/bin/env ts-node
/**
 * Find Price Discrepancy Script (案5)
 * data/cache/paapi-product-cache.json の最新価格と、
 * content/articles/ の Front Matter 記載価格を突き合わせ、
 * 乖離率が閾値以上の商品を抽出する。
 *
 * 環境変数:
 *   PRICE_DISCREPANCY_THRESHOLD - 乖離率の閾値（%、デフォルト 15）
 *   PRICE_DISCREPANCY_MAX_RESULTS - 最大抽出件数（デフォルト 20）
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface PriceDiscrepancyCandidate {
  asin: string;
  title: string;
  category: string;
  articlePrice: number;
  cachePrice: number;
  discrepancyRate: number;
  direction: 'cheaper' | 'more_expensive';
  lastInvestigated: string | null;
  cacheTimestamp: number;
  detailPageUrl: string;
}

export interface PriceDiscrepancyCandidatesFile {
  extractedAt: string;
  threshold: number;
  totalCandidates: number;
  candidates: PriceDiscrepancyCandidate[];
}

interface CacheEntry {
  data: ProductDetail | null;
  timestamp: number;
  status: 'valid' | 'invalid' | 'permanent_invalid';
}

interface CacheStore {
  [asin: string]: CacheEntry;
}

/**
 * Front Matter の price フィールド（例: "¥12,000" や "12000"）を数値に変換する
 */
function parseFrontMatterPrice(priceStr: string | undefined | null): number {
  if (!priceStr) return 0;
  // 数字のみを抽出してカンマを除去
  const digits = priceStr.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

/**
 * content/articles/ 配下の Markdown ファイルから Front Matter を簡易パースして
 * ASIN → { price, lastInvestigated } のマップを生成する
 */
async function loadArticleData(
  articlesDir: string,
): Promise<Map<string, { price: number; lastInvestigated: string | null }>> {
  const result = new Map<string, { price: number; lastInvestigated: string | null }>();

  if (!fs.existsSync(articlesDir)) {
    logger.warn(`Articles directory not found: ${articlesDir}`);
    return result;
  }

  const files = await fs.promises.readdir(articlesDir);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  const PRICE_PATTERN = /^price:\s*["']?([^"'\n]+)["']?/m;
  const LAST_INVESTIGATED_PATTERN = /^last_investigated:\s*["']?([^"'\n]+)["']?/m;
  const ASIN_PATTERN = /^asin:\s*["']?([A-Z0-9]{10})["']?/im;

  for (const file of mdFiles) {
    const filePath = path.join(articlesDir, file);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');

      // Front Matter 部分のみ抽出（--- から --- まで）
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch || !fmMatch[1]) continue;
      const fm = fmMatch[1];

      const asinMatch = fm.match(ASIN_PATTERN);
      const priceMatch = fm.match(PRICE_PATTERN);
      const lastInvestigatedMatch = fm.match(LAST_INVESTIGATED_PATTERN);

      if (!asinMatch || !asinMatch[1]) continue;
      const asin = asinMatch[1].trim();

      const price = parseFrontMatterPrice(priceMatch?.[1]);
      const lastInvestigated = lastInvestigatedMatch?.[1]?.trim() || null;

      if (price > 0) {
        result.set(asin, { price, lastInvestigated });
      }
    } catch (err) {
      logger.error(`Failed to parse front matter for ${file}:`, err);
    }
  }

  return result;
}

export async function findPriceDiscrepancy(
  cacheFilePath?: string,
  articlesDir?: string,
  outputFilePath?: string,
  threshold = 15,
  maxResults = 20,
): Promise<PriceDiscrepancyCandidatesFile> {
  const cachePath = cacheFilePath || path.join(process.cwd(), 'data/cache/paapi-product-cache.json');
  const articles = articlesDir || path.join(process.cwd(), 'content/articles');
  const outputPath = outputFilePath || path.join(process.cwd(), 'tmp/price_discrepancy_candidates.json');

  if (!fs.existsSync(cachePath)) {
    logger.warn(`Cache file not found: ${cachePath}`);
    const empty: PriceDiscrepancyCandidatesFile = {
      extractedAt: new Date().toISOString(),
      threshold,
      totalCandidates: 0,
      candidates: [],
    };
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, JSON.stringify(empty, null, 2), 'utf-8');
    return empty;
  }

  logger.info('Loading cache file...');
  const rawCache = await fs.promises.readFile(cachePath, 'utf-8');
  const cache = JSON.parse(rawCache) as CacheStore;

  logger.info('Loading article front matter data...');
  const articleData = await loadArticleData(articles);
  logger.info(`Found ${articleData.size} articles with price data`);

  const candidates: PriceDiscrepancyCandidate[] = [];

  for (const [asin, entry] of Object.entries(cache)) {
    if (entry.status !== 'valid' || !entry.data) continue;
    const cachePrice = entry.data.price?.amount;
    if (!cachePrice || cachePrice <= 0) continue;

    const articleInfo = articleData.get(asin);
    if (!articleInfo || articleInfo.price <= 0) continue;

    const articlePrice = articleInfo.price;
    const discrepancyRate = (Math.abs(cachePrice - articlePrice) / articlePrice) * 100;

    if (discrepancyRate < threshold) continue;

    candidates.push({
      asin,
      title: entry.data.title,
      category: entry.data.category || 'その他',
      articlePrice,
      cachePrice,
      discrepancyRate: Math.round(discrepancyRate * 10) / 10,
      direction: cachePrice < articlePrice ? 'cheaper' : 'more_expensive',
      lastInvestigated: articleInfo.lastInvestigated,
      cacheTimestamp: entry.timestamp,
      detailPageUrl: entry.data.detailPageUrl || `https://www.amazon.co.jp/dp/${asin}`,
    });
  }

  // 乖離率の高い順にソート
  candidates.sort((a, b) => b.discrepancyRate - a.discrepancyRate);
  const topCandidates = candidates.slice(0, maxResults);

  const result: PriceDiscrepancyCandidatesFile = {
    extractedAt: new Date().toISOString(),
    threshold,
    totalCandidates: topCandidates.length,
    candidates: topCandidates,
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  logger.info(`Found ${candidates.length} total, extracted top ${topCandidates.length} (threshold: ${threshold}%)`);

  return result;
}

// CLIとして直接実行された場合
if (require.main === module) {
  const threshold = Number.parseInt(process.env.PRICE_DISCREPANCY_THRESHOLD || '15', 10);
  const maxResults = Number.parseInt(process.env.PRICE_DISCREPANCY_MAX_RESULTS || '20', 10);

  findPriceDiscrepancy(undefined, undefined, undefined, threshold, maxResults)
    .then((result) => {
      console.log(
        `Successfully found ${result.totalCandidates} price discrepancy candidates (threshold: ${result.threshold}%)`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to find price discrepancies:', err);
      process.exit(1);
    });
}
