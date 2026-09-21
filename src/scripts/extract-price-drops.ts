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
  brand?: string | undefined;
  currentPrice: number;
  previousPrice: number;
  priceDiff: number;
  priceDiffRate: number;
  formattedPrice: string;
  formattedPreviousPrice: string;
  dealBadge?: string | undefined;
  savingsPercentage?: number | undefined;
  score: number;
  rating?:
    | {
        average: number;
        count: number;
      }
    | undefined;
  imageUrl?: string | undefined;
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
  previousPrice?: number | undefined;
  priceChangedAt?: number | undefined;
}

interface CacheStore {
  [asin: string]: CacheEntry;
}

export interface ExtractPriceDropsOptions {
  cachePath?: string | undefined;
  articlesDir?: string | undefined;
  outputPath?: string | undefined;
  maxResults?: number | undefined;
  recentDropHours?: number | undefined;
  now?: number | undefined;
}

interface ArticleMeta {
  score: number;
  brand?: string | undefined;
  category?: string | undefined;
}

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const ASIN_REGEX = /asin:\s*["']?([A-Z0-9]{10})["']?/i;
const SCORE_REGEX = /score:\s*(\d+)/;
const BRAND_REGEX = /brand:\s*["']?([^"'\r\n]+)["']?/;
const CATEGORIES_REGEX = /categories:\s*\[\s*["']([^"']+)["']/;

function parseArticleMeta(content: string): { asin?: string | undefined; meta?: ArticleMeta | undefined } {
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

  return {
    asin,
    meta: {
      score: Number.isNaN(score) ? 0 : score,
      brand: brandMatch?.[1]?.trim(),
      category: catMatch?.[1]?.trim(),
    },
  };
}

function formatJPY(amount: number): string {
  return `￥${amount.toLocaleString('ja-JP')}`;
}

export async function extractPriceDrops(options: ExtractPriceDropsOptions = {}): Promise<PriceDropsData> {
  const cachePath = options.cachePath || path.join(process.cwd(), 'data/cache/paapi-product-cache.json');
  const articlesDir = options.articlesDir || path.join(process.cwd(), 'content/articles');
  const outputPath = options.outputPath || path.join(process.cwd(), 'data/recommendations/price-drops.json');
  const maxResults = options.maxResults ?? 15;
  const recentDropHours = options.recentDropHours ?? 48;
  const now = options.now ?? Date.now();
  const recentThresholdMs = recentDropHours * 60 * 60 * 1000;

  // 1. 記事メタデータの読み込み
  const articleMetaMap = new Map<string, ArticleMeta>();
  if (fs.existsSync(articlesDir)) {
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
  }

  // 2. キャッシュの読み込み
  let cacheStore: CacheStore = {};
  if (fs.existsSync(cachePath)) {
    try {
      const raw = await fs.promises.readFile(cachePath, 'utf-8');
      cacheStore = JSON.parse(raw) as CacheStore;
    } catch (err) {
      logger.error(`Failed to read cache at ${cachePath}`, err);
    }
  }

  // 3. 直近値下げ商品の抽出
  const candidateMap = new Map<string, PriceDropItem>();

  for (const [asin, entry] of Object.entries(cacheStore)) {
    if (entry.status !== 'valid' || !entry.data || !entry.data.price) continue;

    const currentPrice = entry.data.price.amount;
    if (typeof currentPrice !== 'number' || currentPrice <= 0) continue;

    const artMeta = articleMetaMap.get(asin);
    const score = artMeta?.score || 0;
    const category = artMeta?.category || entry.data.category || 'その他';
    const brand = artMeta?.brand || entry.data.brand;
    const title = entry.data.title || '';
    const imageUrl = entry.data.images?.primary;
    const savingsPercentage = entry.data.savingsPercentage;
    const dealBadge = entry.data.dealBadge;
    const rating = entry.data.rating;

    // 異常な割引率（二重価格表示の疑い）の除外規約（AGENTS.md 3.5）
    // 割引率が 75% 以上の商品は除外
    const MAX_ALLOWED_DISCOUNT_RATE = 75;
    const MIN_REQUIRED_SCORE = 60;

    // スコアが基準未満（または未評価・記事なし）の場合は除外
    if (score < MIN_REQUIRED_SCORE) continue;

    // 直近値下げチェック (recent_drop のみ)
    if (
      entry.previousPrice &&
      entry.previousPrice > currentPrice &&
      entry.priceChangedAt &&
      now - entry.priceChangedAt <= recentThresholdMs
    ) {
      const priceDiff = entry.previousPrice - currentPrice;
      const priceDiffRate = Math.round((priceDiff / entry.previousPrice) * 100);

      // 値下げ率 5%以上 75%未満のみ採用
      if (priceDiffRate < MAX_ALLOWED_DISCOUNT_RATE && priceDiffRate >= 5) {
        candidateMap.set(asin, {
          asin,
          title,
          category,
          brand,
          currentPrice,
          previousPrice: entry.previousPrice,
          priceDiff,
          priceDiffRate,
          formattedPrice: formatJPY(currentPrice),
          formattedPreviousPrice: formatJPY(entry.previousPrice),
          dealBadge,
          savingsPercentage,
          score,
          rating,
          imageUrl,
          dropType: 'recent_drop',
          priceChangedAt: entry.priceChangedAt,
        });
      }
    }
  }

  // 4. ソート（値下げ率 降順 -> スコア 降順）
  const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => {
    // 1. 値下げ率 (降順)
    if (a.priceDiffRate !== b.priceDiffRate) {
      return b.priceDiffRate - a.priceDiffRate;
    }

    // 2. スコア (降順)
    return b.score - a.score;
  });

  const selectedDrops = sortedCandidates.slice(0, maxResults);

  const resultData: PriceDropsData = {
    updatedAt: new Date(now).toISOString(),
    date: new Date(now).toISOString().split('T')[0] ?? '',
    totalDrops: selectedDrops.length,
    drops: selectedDrops,
  };

  // 5. 出力ファイル保存
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
