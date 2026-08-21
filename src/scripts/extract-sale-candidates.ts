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

/**
 * 候補商品の魅力度・信頼性スコアを計算
 */
export function calculateCandidateScore(candidate: SaleCandidate, brandMatchers: RegExp[] = []): number {
  let score = 0;

  // 1. 限定セールバッジ（緊急性・注目度）
  if (candidate.isLimitedTimeSale) {
    score += 50;
  } else if (candidate.dealBadge) {
    score += 30;
  }

  // 2. 適正割引率の評価（10%〜50%を高く評価、70%以上は事前除外されている前提）
  const discount = candidate.savingsPercentage || 0;
  if (discount >= 10 && discount <= 50) {
    score += discount * 0.8; // 最大40点
  } else if (discount > 50 && discount < 70) {
    score += Math.max(0, (70 - discount) * 1.5); // 50%超は徐々に減点
  } else if (discount > 0 && discount < 10) {
    score += discount * 0.5;
  }

  // 3. レビュー評価とレビュー件数
  if (candidate.rating) {
    const { average, count } = candidate.rating;
    if (average >= 4.3) {
      score += 25;
    } else if (average >= 4.0) {
      score += 20;
    } else if (average >= 3.5) {
      score += 10;
    }

    if (count >= 500) {
      score += 25;
    } else if (count >= 100) {
      score += 18;
    } else if (count >= 20) {
      score += 12;
    } else if (count >= 5) {
      score += 6;
    }
  }

  // 4. 有名ブランドとのマッチング
  if (brandMatchers.length > 0) {
    const isKnownBrand = brandMatchers.some((regex) => regex.test(candidate.title));
    if (isKnownBrand) {
      score += 20;
    }
  }

  return score;
}

function loadBrandMatchers(): RegExp[] {
  try {
    const brandPath = path.join(process.cwd(), 'data/brandgroups.json');
    if (!fs.existsSync(brandPath)) return [];
    const content = fs.readFileSync(brandPath, 'utf-8');
    const brands = JSON.parse(content) as Record<string, { matcher?: { value?: string } }>;
    const matchers: RegExp[] = [];

    for (const group of Object.values(brands)) {
      if (group.matcher?.value) {
        try {
          matchers.push(new RegExp(group.matcher.value, 'i'));
        } catch {
          // ignore invalid regex
        }
      }
    }
    return matchers;
  } catch {
    return [];
  }
}

function parseCandidateFromEntry(asin: string, entry: CacheEntry): SaleCandidate | null {
  if (entry.status !== 'valid' || !entry.data) return null;

  const product = entry.data;
  if (!product.price || product.price.amount <= 0) return null;

  const dealBadge = product.dealBadge && product.dealBadge.trim() !== '' ? product.dealBadge.trim() : undefined;

  // 二重価格（参考価格吊り上げによる常時割引表示）を排除するため、
  // Amazon公式のセールバッジ (dealBadge) が明示されている商品のみを抽出対象とする。
  if (!dealBadge) return null;

  const discount = product.savingsPercentage;

  // 70%以上の異常な割引率は二重価格・ノーブランド粗悪品の可能性が極めて高いため厳格に除外
  if (discount !== undefined && (discount >= 70 || discount < 0)) {
    return null;
  }

  // レビュー評価が存在する場合、平均3.5未満の低評価商品は除外
  if (product.rating && product.rating.average > 0 && product.rating.average < 3.5) {
    return null;
  }

  // レビュー0件かつ高割引率（50%超）のノーブランド疑い商品は除外
  if ((!product.rating || product.rating.count === 0) && discount !== undefined && discount > 50) {
    return null;
  }

  return {
    asin,
    title: product.title,
    category: product.category || 'その他',
    price: product.price,
    savingsPercentage: product.savingsPercentage,
    dealBadge: product.dealBadge,
    isLimitedTimeSale: isLimitedTimeSaleBadge(dealBadge),
    rating: product.rating,
    timestamp: entry.timestamp,
  };
}

function sortCandidates(candidates: SaleCandidate[], brandMatchers: RegExp[] = []): void {
  const scoreMap = new Map<string, number>();
  for (const c of candidates) {
    scoreMap.set(c.asin, calculateCandidateScore(c, brandMatchers));
  }

  candidates.sort((a, b) => {
    const scoreA = scoreMap.get(a.asin) || 0;
    const scoreB = scoreMap.get(b.asin) || 0;
    if (scoreA !== scoreB) {
      return scoreB - scoreA; // スコア降順
    }

    return b.timestamp - a.timestamp;
  });
}

function filterByCategory(candidates: SaleCandidate[], maxTotal: number, maxPerCategory: number): SaleCandidate[] {
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

  return filteredCandidates;
}

export async function extractSaleCandidates(
  cacheFilePath?: string,
  outputFilePath?: string,
  maxTotal: number = 40,
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
      const candidate = parseCandidateFromEntry(asin, entry);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    const brandMatchers = loadBrandMatchers();
    sortCandidates(candidates, brandMatchers);
    const filteredCandidates = filterByCategory(candidates, maxTotal, maxPerCategory);

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
    return {
      extractedAt: new Date().toISOString(),
      totalCandidates: 0,
      candidates: [],
    };
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
