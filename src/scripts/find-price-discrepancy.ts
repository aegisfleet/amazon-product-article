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
  lastInvestigatedTime: number;
  cacheTimestamp: number;
  detailPageUrl: string;
  investigatedPrice?: number;
  investigatedPriceDiffRate?: number;
}

export interface PriceDiscrepancyCandidatesFile {
  extractedAt: string;
  threshold: number;
  investigatedPriceThreshold?: number;
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

interface InvestigatedMeta {
  lastInvestigatedTime: number;
  investigatedPriceRaw?: number;
}

/**
 * 調査結果ファイルの内容から最終調査日時と調査時価格を抽出する
 */
function parseInvestigationMeta(content: string, statMtimeMs: number): InvestigatedMeta {
  let lastInvestigatedTime = 0;
  const matchDate = /"lastInvestigated"\s*:\s*"([^"]+)"/.exec(content);
  if (matchDate?.[1]) {
    const parsedTime = new Date(matchDate[1]).getTime();
    if (!Number.isNaN(parsedTime)) {
      lastInvestigatedTime = parsedTime;
    }
  }
  if (!lastInvestigatedTime) {
    lastInvestigatedTime = statMtimeMs;
  }

  let investigatedPriceRaw: number | undefined;
  const matchPrice = /"investigatedPrice"\s*:\s*"([^"]+)"/.exec(content);
  if (matchPrice?.[1]) {
    const digits = /\d+/.exec(matchPrice[1].replaceAll(',', ''));
    if (digits?.[0]) {
      const parsed = Number.parseInt(digits[0], 10);
      if (parsed > 0) {
        investigatedPriceRaw = parsed;
      }
    }
  }

  const meta: InvestigatedMeta = { lastInvestigatedTime };
  if (investigatedPriceRaw !== undefined) {
    meta.investigatedPriceRaw = investigatedPriceRaw;
  }
  return meta;
}

/**
 * data/investigations/ 配下に存在する調査済み ASIN とそのメタデータマップを取得する
 */
async function getInvestigatedAsinMap(investigationsDir: string): Promise<Map<string, InvestigatedMeta>> {
  const result = new Map<string, InvestigatedMeta>();

  if (!fs.existsSync(investigationsDir)) {
    logger.warn(`Investigations directory not found: ${investigationsDir}`);
    return result;
  }

  const files = await fs.promises.readdir(investigationsDir);
  const jsonFiles = files.filter((file) => file.endsWith('.json') && file !== 'latest-summary.json');
  const chunkSize = 50;

  for (let i = 0; i < jsonFiles.length; i += chunkSize) {
    const chunk = jsonFiles.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (file) => {
        const asin = path.basename(file, '.json').toUpperCase();
        if (!/^[A-Z0-9]{10}$/.test(asin)) return;

        const filePath = path.join(investigationsDir, file);
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const stat = await fs.promises.stat(filePath);
          result.set(asin, parseInvestigationMeta(content, stat.mtimeMs));
        } catch {
          result.set(asin, { lastInvestigatedTime: 0 });
        }
      }),
    );
  }

  return result;
}

/**
 * 候補商品の優先順位を決定する比較関数
 */
function compareCandidates(a: PriceDiscrepancyCandidate, b: PriceDiscrepancyCandidate): number {
  const aDiff = a.investigatedPriceDiffRate || 0;
  const bDiff = b.investigatedPriceDiffRate || 0;

  // 1. 調査時価格との大幅乖離があるものは最優先（乖離率が高い順）
  if (aDiff !== bDiff) {
    return bDiff - aDiff;
  }

  // 2. 最終調査日時が古い順（過去に調査されてから時間が経過しているセール品を優先）
  if (a.lastInvestigatedTime !== b.lastInvestigatedTime) {
    return a.lastInvestigatedTime - b.lastInvestigatedTime;
  }

  // 3. セールバッジあり優先
  if (Boolean(a.dealBadge) !== Boolean(b.dealBadge)) {
    return a.dealBadge ? -1 : 1;
  }

  // 4. 割引率が高い順
  return b.savingsPercentage - a.savingsPercentage;
}

interface DiscrepancyCriteria {
  threshold: number;
  investigatedPriceThreshold: number;
  cooldownDays: number;
  now: number;
}

/**
 * キャッシュエントリが価格乖離候補の条件を満たすか評価し、候補オブジェクトを生成する
 */
function evaluateCandidate(
  asin: string,
  entry: CacheEntry,
  meta: InvestigatedMeta | undefined,
  criteria: DiscrepancyCriteria,
): PriceDiscrepancyCandidate | null {
  if (entry.status !== 'valid' || !entry.data?.price || entry.data.price.amount <= 0) {
    return null;
  }
  if (!meta) {
    return null;
  }

  const lastInvestigatedTime = meta.lastInvestigatedTime || 0;
  const cooldownMs = criteria.cooldownDays * 24 * 60 * 60 * 1000;
  if (criteria.cooldownDays > 0 && lastInvestigatedTime > 0 && criteria.now - lastInvestigatedTime < cooldownMs) {
    return null;
  }

  const savingsPercentage = entry.data.savingsPercentage || 0;
  const dealBadge = entry.data.dealBadge?.trim() || '';

  // 調査時価格との乖離率を算出
  let investigatedPriceDiffRate = 0;
  if (meta.investigatedPriceRaw && meta.investigatedPriceRaw > 0) {
    const diffAbs = Math.abs(entry.data.price.amount - meta.investigatedPriceRaw);
    investigatedPriceDiffRate = Math.round((diffAbs / meta.investigatedPriceRaw) * 100);
  }

  const isAmazonSale = savingsPercentage >= criteria.threshold || Boolean(dealBadge);
  const isInvestigatedPriceDiscrepancy = investigatedPriceDiffRate >= criteria.investigatedPriceThreshold;

  // Amazonセール、または調査時価格との大幅乖離がある場合に抽出
  if (!isAmazonSale && !isInvestigatedPriceDiscrepancy) {
    return null;
  }

  const candidate: PriceDiscrepancyCandidate = {
    asin,
    title: entry.data.title,
    category: entry.data.category || 'その他',
    price: entry.data.price,
    savingsPercentage,
    dealBadge,
    lastInvestigatedTime,
    cacheTimestamp: entry.timestamp,
    detailPageUrl: entry.data.detailPageUrl || `https://www.amazon.co.jp/dp/${asin}`,
  };

  if (meta.investigatedPriceRaw) {
    candidate.investigatedPrice = meta.investigatedPriceRaw;
    candidate.investigatedPriceDiffRate = investigatedPriceDiffRate;
  }

  return candidate;
}

export async function findPriceDiscrepancy(
  cacheFilePath?: string,
  investigationsDir?: string,
  outputFilePath?: string,
  threshold = 15,
  maxResults = 20,
  cooldownDays = 30,
  investigatedPriceThreshold = 30,
): Promise<PriceDiscrepancyCandidatesFile> {
  const cachePath = cacheFilePath || path.join(process.cwd(), 'data/cache/paapi-product-cache.json');
  const investigations = investigationsDir || path.join(process.cwd(), 'data/investigations');
  const outputPath = outputFilePath || path.join(process.cwd(), 'tmp/price_discrepancy_candidates.json');

  if (!fs.existsSync(cachePath)) {
    logger.warn(`Cache file not found: ${cachePath}`);
    const empty: PriceDiscrepancyCandidatesFile = {
      extractedAt: new Date().toISOString(),
      threshold,
      investigatedPriceThreshold,
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

  logger.info('Loading investigated ASIN map...');
  const investigatedAsinMap = await getInvestigatedAsinMap(investigations);
  logger.info(`Found ${investigatedAsinMap.size} investigated products`);

  const candidates: PriceDiscrepancyCandidate[] = [];
  const criteria: DiscrepancyCriteria = {
    threshold,
    investigatedPriceThreshold,
    cooldownDays,
    now: Date.now(),
  };

  for (const [asin, entry] of Object.entries(cache)) {
    const meta = investigatedAsinMap.get(asin.toUpperCase());
    const candidate = evaluateCandidate(asin, entry, meta, criteria);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  candidates.sort(compareCandidates);

  const topCandidates = candidates.slice(0, maxResults);

  const result: PriceDiscrepancyCandidatesFile = {
    extractedAt: new Date().toISOString(),
    threshold,
    investigatedPriceThreshold,
    totalCandidates: topCandidates.length,
    candidates: topCandidates,
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  logger.info(
    `Found ${candidates.length} total price discrepancy candidates, extracted top ${topCandidates.length} (threshold: ${threshold}%, investigatedThreshold: ${investigatedPriceThreshold}%, cooldown: ${cooldownDays}d)`,
  );

  return result;
}

// CLIとして直接実行された場合
if (require.main === module) {
  const threshold = Number.parseInt(process.env.PRICE_DISCREPANCY_THRESHOLD || '15', 10);
  const maxResults = Number.parseInt(process.env.PRICE_DISCREPANCY_MAX_RESULTS || '20', 10);
  const cooldownDays = Number.parseInt(process.env.PRICE_DISCREPANCY_COOLDOWN_DAYS || '30', 10);
  const investigatedThreshold = Number.parseInt(process.env.INVESTIGATED_PRICE_DISCREPANCY_THRESHOLD || '30', 10);

  findPriceDiscrepancy(undefined, undefined, undefined, threshold, maxResults, cooldownDays, investigatedThreshold)
    .then((result) => {
      console.log(
        `Successfully found ${result.totalCandidates} price discrepancy candidates (threshold: ${result.threshold}%, investigatedThreshold: ${result.investigatedPriceThreshold}%, cooldown: ${cooldownDays}d)`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to find price discrepancies:', err);
      process.exit(1);
    });
}
