#!/usr/bin/env ts-node
/**
 * Extract Sale Candidates Script
 * data/cache/paapi-product-cache.json からタイムセール中や高割引率の商品を抽出する
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';

export interface SaleCandidate {
  asin: string;
  title: string;
  category: string;
  price: {
    amount: number;
    currency: string;
    formatted: string;
  };
  savingsPercentage?: number | undefined;
  dealBadge?: string | undefined;
  isLimitedTimeSale?: boolean | undefined;
  rating?:
    | {
        average: number;
        count: number;
      }
    | undefined;
  timestamp: number;
}

export interface SaleCandidatesFile {
  extractedAt: string;
  totalCandidates: number;
  candidates: SaleCandidate[];
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

function ensureDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function extractSaleCandidates(
  cacheFilePath?: string,
  outputFilePath?: string,
  maxTotal: number = 30,
  maxPerCategory: number = 3,
): Promise<SaleCandidatesFile> {
  const logger = Logger.getInstance();
  const cachePath = cacheFilePath || path.join(process.cwd(), 'data/cache/paapi-product-cache.json');
  const outputPath = outputFilePath || path.join(process.cwd(), 'tmp/sale_candidates.json');

  if (!fs.existsSync(cachePath)) {
    logger.warn(`Cache file not found at: ${cachePath}. Returning empty candidates.`);
    const emptyResult: SaleCandidatesFile = {
      extractedAt: new Date().toISOString(),
      totalCandidates: 0,
      candidates: [],
    };
    ensureDirectory(outputPath);
    await fs.promises.writeFile(outputPath, JSON.stringify(emptyResult, null, 2), 'utf-8');
    return emptyResult;
  }

  try {
    const rawData = await fs.promises.readFile(cachePath, 'utf-8');
    const cache = JSON.parse(rawData) as CacheStore;

    const candidates: SaleCandidate[] = [];

    for (const [asin, entry] of Object.entries(cache)) {
      if (entry.status !== 'valid' || !entry.data) continue;

      const product = entry.data;
      if (!product.price || product.price.amount <= 0) continue;

      const dealBadge = product.dealBadge && product.dealBadge.trim() !== '' ? product.dealBadge.trim() : undefined;
      const savingsPercentage = product.savingsPercentage;

      // 異常割引率（80%以上）は二重価格等の可能性があるため除外
      if (savingsPercentage && savingsPercentage >= 80) continue;

      // 判定: dealBadge が存在するか、または savingsPercentage が 10% 以上 75% 以下
      const hasDealBadge = Boolean(dealBadge);
      const hasValidDiscount = Boolean(savingsPercentage && savingsPercentage >= 10 && savingsPercentage <= 75);

      if (!hasDealBadge && !hasValidDiscount) continue;

      const isLimitedTimeSale = isLimitedTimeSaleBadge(dealBadge);

      candidates.push({
        asin,
        title: product.title,
        category: product.category || 'その他',
        price: product.price,
        savingsPercentage: product.savingsPercentage,
        dealBadge: product.dealBadge,
        isLimitedTimeSale,
        rating: product.rating,
        timestamp: entry.timestamp,
      });
    }

    // ソート順:
    // 1. isLimitedTimeSale（限定・特選・24時間セール）優先
    // 2. dealBadge あり優先
    // 3. savingsPercentage 高い順
    // 4. timestamp 新しい順
    candidates.sort((a, b) => {
      const aLimited = a.isLimitedTimeSale ? 1 : 0;
      const bLimited = b.isLimitedTimeSale ? 1 : 0;
      if (aLimited !== bLimited) return bLimited - aLimited;

      const aBadge = a.dealBadge ? 1 : 0;
      const bBadge = b.dealBadge ? 1 : 0;
      if (aBadge !== bBadge) return bBadge - aBadge;

      const aDiscount = a.savingsPercentage || 0;
      const bDiscount = b.savingsPercentage || 0;
      if (aDiscount !== bDiscount) return bDiscount - aDiscount;

      return b.timestamp - a.timestamp;
    });

    // カテゴリごとに制限し、多様性を確保
    const categoryCounts: Record<string, number> = {};
    const filteredCandidates: SaleCandidate[] = [];

    for (const item of candidates) {
      const cat = item.category;
      const currentCount = categoryCounts[cat] || 0;

      if (currentCount < maxPerCategory) {
        filteredCandidates.push(item);
        categoryCounts[cat] = currentCount + 1;
        if (filteredCandidates.length >= maxTotal) break;
      }
    }

    const result: SaleCandidatesFile = {
      extractedAt: new Date().toISOString(),
      totalCandidates: filteredCandidates.length,
      candidates: filteredCandidates,
    };

    ensureDirectory(outputPath);
    await fs.promises.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    logger.info(`Extracted ${filteredCandidates.length} sale candidates to ${outputPath}`);

    return result;
  } catch (error) {
    logger.error('Failed to extract sale candidates:', error);
    const emptyResult: SaleCandidatesFile = {
      extractedAt: new Date().toISOString(),
      totalCandidates: 0,
      candidates: [],
    };
    return emptyResult;
  }
}

// CLIスクリプトとして直接実行された場合
if (require.main === module) {
  extractSaleCandidates()
    .then((result) => {
      console.log(`Successfully extracted ${result.totalCandidates} sale candidates.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Extraction failed:', err);
      process.exit(1);
    });
}
