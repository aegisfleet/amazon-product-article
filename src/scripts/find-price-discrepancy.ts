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
 * data/investigations/ 配下に存在する調査済み ASIN とその最終調査タイムスタンプのマップを取得する
 * JSONファイル内の analysis.lastInvestigated を優先し、存在しない場合は mtime を使用する
 */
async function getInvestigatedAsinMap(investigationsDir: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();

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
          // 高速化のため正規表現で lastInvestigated を抽出
          const match = /"lastInvestigated"\s*:\s*"([^"]+)"/.exec(content);
          if (match?.[1]) {
            const parsedTime = new Date(match[1]).getTime();
            if (!Number.isNaN(parsedTime)) {
              result.set(asin, parsedTime);
              return;
            }
          }
          const stat = await fs.promises.stat(filePath);
          result.set(asin, stat.mtimeMs);
        } catch {
          result.set(asin, 0);
        }
      }),
    );
  }

  return result;
}

export async function findPriceDiscrepancy(
  cacheFilePath?: string,
  investigationsDir?: string,
  outputFilePath?: string,
  threshold = 15,
  maxResults = 20,
  cooldownDays = 30,
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

  logger.info('Loading investigated ASIN map...');
  const investigatedAsinMap = await getInvestigatedAsinMap(investigations);
  logger.info(`Found ${investigatedAsinMap.size} investigated products`);

  const candidates: PriceDiscrepancyCandidate[] = [];
  const now = Date.now();
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

  for (const [asin, entry] of Object.entries(cache)) {
    if (entry.status !== 'valid' || !entry.data) continue;
    if (!entry.data.price || entry.data.price.amount <= 0) continue;

    const asinUpper = asin.toUpperCase();

    // 調査済みの商品のみ対象
    if (!investigatedAsinMap.has(asinUpper)) continue;

    const lastInvestigatedTime = investigatedAsinMap.get(asinUpper) || 0;

    // クールダウン期間判定: 直近（cooldownDays以内）に調査済みの商品は再調査対象から除外
    if (cooldownDays > 0 && lastInvestigatedTime > 0 && now - lastInvestigatedTime < cooldownMs) {
      continue;
    }

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
      lastInvestigatedTime,
      cacheTimestamp: entry.timestamp,
      detailPageUrl: entry.data.detailPageUrl || `https://www.amazon.co.jp/dp/${asin}`,
    });
  }

  // ソート順:
  // 1. 最終調査日時（lastInvestigatedTime）が古い順（過去に調査されてから時間が経過しているセール品を優先）
  // 2. セールバッジあり優先
  // 3. 割引率が高い順
  candidates.sort((a, b) => {
    if (a.lastInvestigatedTime !== b.lastInvestigatedTime) {
      return a.lastInvestigatedTime - b.lastInvestigatedTime;
    }
    if (Boolean(a.dealBadge) !== Boolean(b.dealBadge)) return a.dealBadge ? -1 : 1;
    return b.savingsPercentage - a.savingsPercentage;
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
    `Found ${candidates.length} total price discrepancy candidates, extracted top ${topCandidates.length} (threshold: ${threshold}%, cooldown: ${cooldownDays}d)`,
  );

  return result;
}

// CLIとして直接実行された場合
if (require.main === module) {
  const threshold = Number.parseInt(process.env.PRICE_DISCREPANCY_THRESHOLD || '15', 10);
  const maxResults = Number.parseInt(process.env.PRICE_DISCREPANCY_MAX_RESULTS || '20', 10);
  const cooldownDays = Number.parseInt(process.env.PRICE_DISCREPANCY_COOLDOWN_DAYS || '30', 10);

  findPriceDiscrepancy(undefined, undefined, undefined, threshold, maxResults, cooldownDays)
    .then((result) => {
      console.log(
        `Successfully found ${result.totalCandidates} price discrepancy candidates (threshold: ${result.threshold}%, cooldown: ${cooldownDays}d)`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to find price discrepancies:', err);
      process.exit(1);
    });
}
