#!/usr/bin/env ts-node
/**
 * Find Uncovered Deals Script (案4)
 * data/cache/paapi-product-cache.json のセール商品のうち、
 * まだ調査レポート（content/articles/ASIN.md）が存在しない商品を抽出する。
 *
 * 環境変数:
 *   UNCOVERED_DEALS_MAX_RESULTS    - 最大抽出件数（デフォルト 20）
 *   UNCOVERED_DEALS_MAX_PER_CATEGORY - カテゴリあたりの最大件数（デフォルト 3）
 *   UNCOVERED_DEALS_MIN_SAVINGS    - 最小割引率%（デフォルト 0、dealBadgeがあれば含む）
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface UncoveredDealCandidate {
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
  isLimitedTimeSale: boolean;
  loyaltyPoints: number;
  brand: string;
  timestamp: number;
  detailPageUrl: string;
}

export interface UncoveredDealsCandidatesFile {
  extractedAt: string;
  totalCandidates: number;
  candidates: UncoveredDealCandidate[];
}

interface CacheEntry {
  data: ProductDetail | null;
  timestamp: number;
  status: 'valid' | 'invalid' | 'permanent_invalid';
}

interface CacheStore {
  [asin: string]: CacheEntry;
}

const LIMITED_SALE_KEYWORDS = ['限定', '24時間', '特選', '数量限定', '本日限定'];

function isLimitedTimeSaleBadge(badge?: string): boolean {
  if (!badge) return false;
  return LIMITED_SALE_KEYWORDS.some((kw) => badge.includes(kw));
}

/**
 * data/investigations/ または content/articles/ 配下に存在するASINのセットを返す
 */
async function getExistingArticleAsins(investigationsDir: string): Promise<Set<string>> {
  const result = new Set<string>();

  if (!fs.existsSync(investigationsDir)) {
    logger.warn(`Directory not found: ${investigationsDir}`);
    return result;
  }

  const files = await fs.promises.readdir(investigationsDir);
  for (const file of files) {
    if (file.endsWith('.json') || file.endsWith('.md')) {
      const asin = path.basename(file, path.extname(file)).toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(asin)) {
        result.add(asin);
      }
    }
  }

  return result;
}

/**
 * キャッシュから条件を満たす未調査セール商品を抽出する
 */
function filterUncoveredCandidateEntries(
  cache: CacheStore,
  existingAsins: Set<string>,
  minSavings: number,
): UncoveredDealCandidate[] {
  const candidates: UncoveredDealCandidate[] = [];

  for (const [asin, entry] of Object.entries(cache)) {
    if (entry.status !== 'valid' || !entry.data) continue;
    if (!entry.data.price || entry.data.price.amount <= 0) continue;

    const dealBadge = entry.data.dealBadge?.trim();
    if (!dealBadge) continue;

    const savingsPercentage = entry.data.savingsPercentage || 0;
    if (savingsPercentage < minSavings) continue;

    if (existingAsins.has(asin.toUpperCase())) continue;

    candidates.push({
      asin,
      title: entry.data.title,
      category: entry.data.category || 'その他',
      price: entry.data.price,
      savingsPercentage,
      dealBadge,
      isLimitedTimeSale: isLimitedTimeSaleBadge(dealBadge),
      loyaltyPoints: entry.data.loyaltyPoints || 0,
      brand: entry.data.brand || '',
      timestamp: entry.timestamp,
      detailPageUrl: entry.data.detailPageUrl || `https://www.amazon.co.jp/dp/${asin}`,
    });
  }

  return candidates;
}

/**
 * カテゴリごとの上限件数および全体の最大件数でフィルタリングする
 */
function filterCandidatesByCategory(
  candidates: UncoveredDealCandidate[],
  maxTotal: number,
  maxPerCategory: number,
): UncoveredDealCandidate[] {
  const categoryCounts: Record<string, number> = {};
  const filtered: UncoveredDealCandidate[] = [];

  for (const candidate of candidates) {
    const cat = candidate.category;
    const count = categoryCounts[cat] || 0;
    if (count < maxPerCategory && filtered.length < maxTotal) {
      filtered.push(candidate);
      categoryCounts[cat] = count + 1;
    }
  }

  return filtered;
}

export async function findUncoveredDeals(
  cacheFilePath?: string,
  investigationsDir?: string,
  outputFilePath?: string,
  maxTotal = 20,
  maxPerCategory = 3,
  minSavings = 0,
): Promise<UncoveredDealsCandidatesFile> {
  const cachePath = cacheFilePath || path.join(process.cwd(), 'data/cache/paapi-product-cache.json');
  const investigations = investigationsDir || path.join(process.cwd(), 'data/investigations');
  const outputPath = outputFilePath || path.join(process.cwd(), 'tmp/uncovered_deals.json');

  if (!fs.existsSync(cachePath)) {
    logger.warn(`Cache file not found: ${cachePath}`);
    const empty: UncoveredDealsCandidatesFile = {
      extractedAt: new Date().toISOString(),
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

  logger.info('Loading existing article/investigation ASINs...');
  const existingAsins = await getExistingArticleAsins(investigations);
  logger.info(`Found ${existingAsins.size} existing investigations/articles`);

  // セール商品を抽出
  const candidates = filterUncoveredCandidateEntries(cache, existingAsins, minSavings);

  // ソート: 限定セール > dealBadgeあり > 割引率高順 > 新しい順
  candidates.sort((a, b) => {
    if (a.isLimitedTimeSale !== b.isLimitedTimeSale) return a.isLimitedTimeSale ? -1 : 1;
    if (a.savingsPercentage !== b.savingsPercentage) return b.savingsPercentage - a.savingsPercentage;
    return b.timestamp - a.timestamp;
  });

  // カテゴリごとの件数制限
  const filtered = filterCandidatesByCategory(candidates, maxTotal, maxPerCategory);

  const result: UncoveredDealsCandidatesFile = {
    extractedAt: new Date().toISOString(),
    totalCandidates: filtered.length,
    candidates: filtered,
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  logger.info(`Found ${candidates.length} total uncovered deals, extracted ${filtered.length} to ${outputPath}`);

  return result;
}

// CLIとして直接実行された場合
if (require.main === module) {
  const maxTotal = Number.parseInt(process.env.UNCOVERED_DEALS_MAX_RESULTS || '20', 10);
  const maxPerCategory = Number.parseInt(process.env.UNCOVERED_DEALS_MAX_PER_CATEGORY || '3', 10);
  const minSavings = Number.parseInt(process.env.UNCOVERED_DEALS_MIN_SAVINGS || '0', 10);

  findUncoveredDeals(undefined, undefined, undefined, maxTotal, maxPerCategory, minSavings)
    .then((result) => {
      console.log(`Successfully found ${result.totalCandidates} uncovered deal candidates`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to find uncovered deals:', err);
      process.exit(1);
    });
}
