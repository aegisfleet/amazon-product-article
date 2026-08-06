#!/usr/bin/env ts-node
/**
 * Find Price Discrepancy Script (案5)
 * 調査済み商品（data/investigations/{ASIN}.json）の中から、
 * data/cache/paapi-product-cache.json でセールバッジが付与されている、
 * または割引率（savingsPercentage）が閾値（デフォルト15%）以上の「価格乖離（値下げ・セール化）商品」を抽出する。
 *
 * 環境変数:
 *   PRICE_DISCREPANCY_THRESHOLD - 乖離（割引率）の閾値（%、デフォルト 15）
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
  price: {
    amount: number;
    currency: string;
    formatted: string;
  };
  savingsPercentage: number;
  dealBadge: string;
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
 * data/investigations/ 配下に存在する調査済み ASIN の Set を取得する
 */
async function getInvestigatedAsins(investigationsDir: string): Promise<Set<string>> {
  const result = new Set<string>();

  if (!fs.existsSync(investigationsDir)) {
    logger.warn(`Investigations directory not found: ${investigationsDir}`);
    return result;
  }

  const files = await fs.promises.readdir(investigationsDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const asin = path.basename(file, '.json').toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(asin)) {
        result.add(asin);
      }
    }
  }

  return result;
}

export async function findPriceDiscrepancy(
  cacheFilePath?: string,
  investigationsDir?: string,
  outputFilePath?: string,
  threshold = 15,
  maxResults = 20,
): Promise<PriceDiscrepancyCandidatesFile> {
  const cachePath = cacheFilePath || path.join(process.cwd(), 'data/cache/paapi-product-cache.json');
  const investigations = investigationsDir || path.join(process.cwd(), 'data/investigations');
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

  logger.info('Loading investigated ASINs...');
  const investigatedAsins = await getInvestigatedAsins(investigations);
  logger.info(`Found ${investigatedAsins.size} investigated products`);

  const candidates: PriceDiscrepancyCandidate[] = [];

  for (const [asin, entry] of Object.entries(cache)) {
    if (entry.status !== 'valid' || !entry.data) continue;
    if (!entry.data.price || entry.data.price.amount <= 0) continue;

    // 調査済みの商品のみ対象
    if (!investigatedAsins.has(asin.toUpperCase())) continue;

    const savingsPercentage = entry.data.savingsPercentage || 0;
    const dealBadge = entry.data.dealBadge?.trim() || '';

    // 割引率が閾値以上、またはセールバッジが付与されている商品を「価格乖離（値下げ・セール）」とみなす
    if (savingsPercentage < threshold && !dealBadge) continue;

    candidates.push({
      asin,
      title: entry.data.title,
      category: entry.data.category || 'その他',
      price: entry.data.price,
      savingsPercentage,
      dealBadge,
      cacheTimestamp: entry.timestamp,
      detailPageUrl: entry.data.detailPageUrl || `https://www.amazon.co.jp/dp/${asin}`,
    });
  }

  // 割引率の高い順 > セールバッジあり > 新しい順
  candidates.sort((a, b) => {
    if (a.savingsPercentage !== b.savingsPercentage) return b.savingsPercentage - a.savingsPercentage;
    if (Boolean(a.dealBadge) !== Boolean(b.dealBadge)) return a.dealBadge ? -1 : 1;
    return b.cacheTimestamp - a.cacheTimestamp;
  });

  const topCandidates = candidates.slice(0, maxResults);

  const result: PriceDiscrepancyCandidatesFile = {
    extractedAt: new Date().toISOString(),
    threshold,
    totalCandidates: topCandidates.length,
    candidates: topCandidates,
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  logger.info(
    `Found ${candidates.length} total price discrepancy candidates, extracted top ${topCandidates.length} (threshold: ${threshold}%)`,
  );

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
