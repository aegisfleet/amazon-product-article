#!/usr/bin/env ts-node
/**
 * Extract Sale Candidates Script
 * data/cache/paapi-product-cache.json および content/articles/*.md から
 * 調査済み高スコア（75点以上）のタイムセール中・注目商品を抽出する
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
  articleScore?: number | undefined;
  brand?: string | undefined;
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

export interface ArticleMetadata {
  score: number;
  brand?: string | undefined;
  category?: string | undefined;
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

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const SCORE_REGEX = /score:\s*(\d+)/;
const BRAND_REGEX = /brand:\s*["']?([^"'\r\n]+)["']?/;
const CATEGORIES_REGEX = /categories:\s*\[\s*["']([^"']+)["']/;

function parseArticleMetadata(content: string): ArticleMetadata | undefined {
  // Front Matter のみ（--- で囲まれた部分）を高速パース
  const match = FRONT_MATTER_REGEX.exec(content);
  if (!match?.[1]) return undefined;

  const fm = match[1];
  const scoreMatch = SCORE_REGEX.exec(fm);
  if (!scoreMatch?.[1]) return undefined;

  const score = Number.parseInt(scoreMatch[1], 10);
  if (Number.isNaN(score)) return undefined;

  const brandMatch = BRAND_REGEX.exec(fm);
  const brand = brandMatch?.[1] ? brandMatch[1].trim() : undefined;

  const catMatch = CATEGORIES_REGEX.exec(fm);
  const category = catMatch?.[1] ? catMatch[1].trim() : undefined;

  return {
    score,
    brand,
    category,
  };
}

export function loadArticleScoreMap(articlesDir?: string): Map<string, ArticleMetadata> {
  const map = new Map<string, ArticleMetadata>();
  const targetDir = articlesDir || path.join(process.cwd(), 'content/articles');

  if (!fs.existsSync(targetDir)) {
    return map;
  }

  try {
    const files = fs.readdirSync(targetDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const asin = path.basename(file, '.md');
      try {
        const filePath = path.join(targetDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const metadata = parseArticleMetadata(content);
        if (metadata) {
          map.set(asin, metadata);
        }
      } catch {
        // ignore parse error
      }
    }
  } catch {
    // ignore directory read error
  }

  return map;
}

function calculateDealBadgeScore(candidate: SaleCandidate): number {
  if (candidate.isLimitedTimeSale) return 40;
  if (candidate.dealBadge) return 25;
  return 0;
}

function calculateArticleScoreBonus(articleScore?: number): number {
  if (articleScore === undefined) return 0;
  if (articleScore >= 90) return 15;
  if (articleScore >= 85) return 12;
  if (articleScore >= 80) return 8;
  if (articleScore >= 75) return 5;
  return 0;
}

function calculateFreshnessScore(timestamp?: number): number {
  if (!timestamp) return 0;
  const now = Date.now();
  const diffHours = (now - timestamp) / (1000 * 60 * 60);
  if (diffHours <= 24) return 20;
  if (diffHours <= 72) return 10;
  return 0;
}

function calculateDiscountScore(discount = 0): number {
  if (discount >= 10 && discount <= 45) {
    return discount * 0.8; // 最大36点
  }
  if (discount > 45 && discount < 70) {
    return Math.max(0, (70 - discount) * 1.0); // 45%超は二重価格リスクのため徐々に減点
  }
  if (discount > 0 && discount < 10) {
    return discount * 0.5;
  }
  return 0;
}

function calculateRatingScore(rating?: SaleCandidate['rating']): number {
  if (!rating) return 0;
  let score = 0;
  const { average, count } = rating;

  if (average >= 4.3) score += 20;
  else if (average >= 4.0) score += 15;
  else if (average >= 3.8) score += 8;

  if (count >= 500) score += 20;
  else if (count >= 100) score += 14;
  else if (count >= 30) score += 8;
  else if (count >= 10) score += 4;

  return score;
}

function calculateBrandScore(title: string, brandMatchers: RegExp[]): number {
  if (brandMatchers.length === 0) return 0;
  const isKnownBrand = brandMatchers.some((regex) => regex.test(title));
  return isKnownBrand ? 25 : 0;
}

/**
 * 候補商品の魅力度・信頼性スコアを計算
 */
export function calculateCandidateScore(candidate: SaleCandidate, brandMatchers: RegExp[] = []): number {
  return (
    calculateDealBadgeScore(candidate) +
    calculateDiscountScore(candidate.savingsPercentage) +
    calculateFreshnessScore(candidate.timestamp) +
    calculateArticleScoreBonus(candidate.articleScore) +
    calculateRatingScore(candidate.rating) +
    calculateBrandScore(candidate.title, brandMatchers)
  );
}

export function loadBrandMatchers(brandPath?: string): RegExp[] {
  try {
    const targetPath = brandPath || path.join(process.cwd(), 'data/brandgroups.json');
    if (!fs.existsSync(targetPath)) return [];
    const content = fs.readFileSync(targetPath, 'utf-8');
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

function isRatingAcceptable(rating?: ProductDetail['rating']): boolean {
  if (!rating || rating.average <= 0) return true;
  return rating.average >= 3.8;
}

function isDiscountAcceptable(discount?: number, rating?: ProductDetail['rating']): boolean {
  if (discount === undefined) return true;
  if (discount >= 70 || discount < 0) return false;
  if (discount > 50 && (!rating || rating.count < 30)) return false;
  return true;
}

function isUninvestigatedCandidateAcceptable(dealBadge?: string, rating?: ProductDetail['rating']): boolean {
  if (!dealBadge) return false;
  return Boolean(rating && rating.average >= 4.0 && rating.count >= 100);
}

function isCandidateEligible(
  product: ProductDetail,
  article: ArticleMetadata | undefined,
  dealBadge: string | undefined,
): boolean {
  if (!dealBadge) {
    return false;
  }

  if (article) {
    if (article.score < 75) return false;
  } else if (!isUninvestigatedCandidateAcceptable(dealBadge, product.rating)) {
    return false;
  }

  if (!isDiscountAcceptable(product.savingsPercentage, product.rating)) {
    return false;
  }

  if (!isRatingAcceptable(product.rating)) {
    return false;
  }

  return true;
}

function parseCandidateFromEntry(
  asin: string,
  entry: CacheEntry,
  articleScoreMap: Map<string, ArticleMetadata>,
): SaleCandidate | null {
  if (entry.status !== 'valid' || !entry.data) return null;

  const product = entry.data;
  if (!product.price || product.price.amount <= 0) return null;

  const article = articleScoreMap.get(asin);
  const dealBadge = product.dealBadge && product.dealBadge.trim() !== '' ? product.dealBadge.trim() : undefined;

  if (!isCandidateEligible(product, article, dealBadge)) {
    return null;
  }

  return {
    asin,
    title: product.title,
    category: article?.category || product.category || 'その他',
    price: product.price,
    savingsPercentage: product.savingsPercentage,
    dealBadge: product.dealBadge,
    isLimitedTimeSale: isLimitedTimeSaleBadge(dealBadge),
    rating: product.rating,
    articleScore: article?.score,
    brand: article?.brand,
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
  maxTotal: number = 30,
  maxPerCategory: number = 2,
  articlesDir?: string,
  brandPath?: string,
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

    const articleScoreMap = loadArticleScoreMap(articlesDir);
    const candidates: SaleCandidate[] = [];

    for (const [asin, entry] of Object.entries(cache)) {
      const candidate = parseCandidateFromEntry(asin, entry, articleScoreMap);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    const brandMatchers = loadBrandMatchers(brandPath);
    sortCandidates(candidates, brandMatchers);
    const filteredCandidates = filterByCategory(candidates, maxTotal, maxPerCategory);

    const result: SaleCandidatesFile = {
      extractedAt: new Date().toISOString(),
      totalCandidates: filteredCandidates.length,
      candidates: filteredCandidates,
    };

    ensureDirectory(outputPath);
    await fs.promises.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    logger.info(`Extracted ${filteredCandidates.length} high-quality sale candidates to ${outputPath}`);

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
