#!/usr/bin/env ts-node
/**
 * Extract Price Drops Script
 * キャッシュ、調査データ、記事フロントマターを走査し、
 * 「直近値下げ（recent_drop）」「調査時比値下げ（investigated_drop）」「セール注目品（sale_deal）」を抽出して
 * data/recommendations/price-drops.json に出力する。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface PriceDropItem {
  asin: string;
  title: string;
  category: string;
  brand?: string;
  currentPrice: number;
  previousPrice: number;
  priceDiff: number;
  priceDiffRate: number;
  formattedPrice: string;
  formattedPreviousPrice: string;
  dealBadge?: string;
  savingsPercentage?: number;
  score: number;
  rating?: {
    average: number;
    count: number;
  };
  imageUrl?: string;
  dropType: 'recent_drop';
  priceChangedAt: number;
}

export interface PriceDropsData {
  updatedAt: string;
  date: string;
  totalDrops: number;
  drops: PriceDropItem[];
}

interface CacheEntry {
  data: ProductDetail | null;
  timestamp: number;
  status: 'valid' | 'invalid' | 'permanent_invalid';
  previousPrice?: number;
  priceChangedAt?: number;
}

interface CacheStore {
  [asin: string]: CacheEntry;
}

export interface ExtractPriceDropsOptions {
  cachePath?: string;
  articlesDir?: string;
  outputPath?: string;
  maxResults?: number;
  recentDropHours?: number;
  now?: number;
}

interface ArticleMeta {
  score: number;
  brand?: string;
  category?: string;
}

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const ASIN_REGEX = /asin:\s*["']?([A-Z0-9]{10})["']?/i;
const SCORE_REGEX = /score:\s*(\d+)/;
const BRAND_REGEX = /brand:\s*["']?([^"'\r\n]+)["']?/;
const CATEGORIES_REGEX = /categories:\s*\[\s*["']([^"']+)["']/;

function parseArticleMeta(content: string): { asin?: string; meta?: ArticleMeta } {
  const match = FRONT_MATTER_REGEX.exec(content);
  if (!match?.[1]) return {};

  const fm = match[1];
  const asinMatch = ASIN_REGEX.exec(fm);
  if (!asinMatch?.[1]) return {};

  const asin = asinMatch[1].toUpperCase();
  const scoreMatch = SCORE_REGEX.exec(fm);
  const score = scoreMatch?.[1] ? Number.parseInt(scoreMatch[1], 10) : 0;

  const brandMatch = BRAND_REGEX.exec(fm);
  const catMatch = CATEGORIES_REGEX.exec(fm);

  const brand = brandMatch?.[1]?.trim();
  const category = catMatch?.[1]?.trim();

  return {
    asin,
    meta: {
      score: Number.isNaN(score) ? 0 : score,
      ...(brand ? { brand } : {}),
      ...(category ? { category } : {}),
    },
  };
}

function formatJPY(amount: number): string {
  return `￥${amount.toLocaleString('ja-JP')}`;
}

const MAX_ALLOWED_DISCOUNT_RATE = 75;
const MIN_REQUIRED_SCORE = 60;
const MIN_REQUIRED_DISCOUNT_RATE = 5;

async function loadArticleMetaMap(articlesDir: string): Promise<Map<string, ArticleMeta>> {
  const articleMetaMap = new Map<string, ArticleMeta>();
  if (!fs.existsSync(articlesDir)) return articleMetaMap;

  const articleFiles = await fs.promises.readdir(articlesDir);
  for (const file of articleFiles) {
    if (!file.endsWith('.md') || file === '_index.md') continue;
    try {
      const content = await fs.promises.readFile(path.join(articlesDir, file), 'utf-8');
      const { asin, meta } = parseArticleMeta(content);
      if (asin && meta) {
        articleMetaMap.set(asin, meta);
      }
    } catch {
      // ignore read error
    }
  }
  return articleMetaMap;
}

async function loadCacheStore(cachePath: string): Promise<CacheStore> {
  if (!fs.existsSync(cachePath)) return {};
  try {
    const raw = await fs.promises.readFile(cachePath, 'utf-8');
    return JSON.parse(raw) as CacheStore;
  } catch (err) {
    logger.error(`Failed to read cache at ${cachePath}`, err);
    return {};
  }
}

function evaluateRecentDrop(
  asin: string,
  entry: CacheEntry,
  artMeta: ArticleMeta | undefined,
  now: number,
  recentThresholdMs: number,
): PriceDropItem | null {
  if (entry.status !== 'valid' || !entry.data?.price) return null;

  const currentPrice = entry.data.price.amount;
  if (typeof currentPrice !== 'number' || currentPrice <= 0) return null;

  const score = artMeta?.score || 0;
  if (score < MIN_REQUIRED_SCORE) return null;

  const previousPrice = entry.previousPrice;
  const priceChangedAt = entry.priceChangedAt;
  if (!previousPrice || previousPrice <= currentPrice || !priceChangedAt) return null;
  if (now - priceChangedAt > recentThresholdMs) return null;

  const priceDiff = previousPrice - currentPrice;
  const priceDiffRate = Math.round((priceDiff / previousPrice) * 100);

  if (priceDiffRate < MIN_REQUIRED_DISCOUNT_RATE || priceDiffRate >= MAX_ALLOWED_DISCOUNT_RATE) {
    return null;
  }

  const brand = artMeta?.brand || entry.data.brand;
  const dealBadge = entry.data.dealBadge;
  const savingsPercentage = entry.data.savingsPercentage;
  const rating = entry.data.rating;
  const imageUrl = entry.data.images?.primary;

  const item: PriceDropItem = {
    asin,
    title: entry.data.title || '',
    category: artMeta?.category || entry.data.category || 'その他',
    currentPrice,
    previousPrice,
    priceDiff,
    priceDiffRate,
    formattedPrice: formatJPY(currentPrice),
    formattedPreviousPrice: formatJPY(previousPrice),
    score,
    dropType: 'recent_drop',
    priceChangedAt,
    ...(brand ? { brand } : {}),
    ...(dealBadge ? { dealBadge } : {}),
    ...(savingsPercentage !== undefined ? { savingsPercentage } : {}),
    ...(rating ? { rating } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };

  return item;
}

export async function extractPriceDrops(options: ExtractPriceDropsOptions = {}): Promise<PriceDropsData> {
  const cachePath = options.cachePath || path.join(process.cwd(), 'data/cache/paapi-product-cache.json');
  const articlesDir = options.articlesDir || path.join(process.cwd(), 'content/articles');
  const outputPath = options.outputPath || path.join(process.cwd(), 'data/recommendations/price-drops.json');
  const maxResults = options.maxResults ?? 15;
  const recentDropHours = options.recentDropHours ?? 48;
  const now = options.now ?? Date.now();
  const recentThresholdMs = recentDropHours * 60 * 60 * 1000;

  const [articleMetaMap, cacheStore] = await Promise.all([loadArticleMetaMap(articlesDir), loadCacheStore(cachePath)]);

  const candidates: PriceDropItem[] = [];
  for (const [asin, entry] of Object.entries(cacheStore)) {
    const item = evaluateRecentDrop(asin, entry, articleMetaMap.get(asin), now, recentThresholdMs);
    if (item) {
      candidates.push(item);
    }
  }

  candidates.sort((a, b) => b.priceDiffRate - a.priceDiffRate || b.score - a.score);
  const selectedDrops = candidates.slice(0, maxResults);

  const resultData: PriceDropsData = {
    updatedAt: new Date(now).toISOString(),
    date: new Date(now).toISOString().split('T')[0] ?? '',
    totalDrops: selectedDrops.length,
    drops: selectedDrops,
  };

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir, { recursive: true });
  }
  await fs.promises.writeFile(outputPath, JSON.stringify(resultData, null, 2), 'utf-8');

  logger.info(`Extracted ${selectedDrops.length} price drops to ${outputPath}`);
  return resultData;
}

if (require.main === module) {
  extractPriceDrops()
    .then((res) => {
      console.log(`Successfully extracted ${res.totalDrops} price drops.`);
    })
    .catch((err) => {
      console.error('Failed to extract price drops:', err);
      process.exit(1);
    });
}
