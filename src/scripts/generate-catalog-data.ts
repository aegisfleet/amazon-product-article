#!/usr/bin/env ts-node
/**
 * Generate Catalog Data Script
 * data/cache/paapi/*.json（Creators API キャッシュ）と content/articles/*.md（公開用記事）を走査し、
 * 未調査商品カタログページ（/catalog/?asin=）およびリモートMCPサーバー向けの
 * シャーディング済みカタログJSON（static/catalog-data/<ASIN末尾2文字>.json）を生成する。
 */

import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../utils/Logger';
import { mapInChunks } from './generate-mcp-products';

const logger = Logger.getInstance();

const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const ARTICLE_FILENAME_REGEX = /^([A-Z0-9]{10})\.md$/i;
const READ_CHUNK_SIZE = 256;

export interface CatalogProductRecord {
  asin: string;
  title: string;
  brand: string;
  price: number | null;
  previous_price?: number;
  price_changed_at?: string;
  availability: string;
  image: string;
  amazon_category: string;
  release_date: string | null;
  detail_page_url: string;
  price_as_of: string;
  investigated: boolean;
}

export interface PaapiCacheEntry {
  status?: unknown;
  timestamp?: unknown;
  priceTimestamp?: unknown;
  previousPrice?: unknown;
  priceChangedAt?: unknown;
  data?: {
    asin?: unknown;
    title?: unknown;
    brand?: unknown;
    category?: unknown;
    detailPageUrl?: unknown;
    availability?: unknown;
    releaseDate?: unknown;
    price?: {
      amount?: unknown;
    };
    images?: {
      primary?: unknown;
    };
  };
}

export interface GenerateCatalogDataOptions {
  cacheDir?: string;
  articlesDir?: string;
  outputDir?: string;
}

export interface GenerateCatalogDataResult {
  totalRecords: number;
  investigatedCount: number;
  uninvestigatedCount: number;
  shardCount: number;
}

export function getShardKey(asin: string): string {
  return asin.toUpperCase().slice(-2);
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toIsoStringOrNull(epochMs: unknown): string | null {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs <= 0) {
    return null;
  }
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function convertCacheEntryToCatalogRecord(
  rawAsin: string,
  entry: PaapiCacheEntry | undefined,
  investigated: boolean,
): CatalogProductRecord | null {
  const asin = rawAsin.trim().toUpperCase();
  if (!ASIN_REGEX.test(asin)) return null;
  if (entry?.status !== 'valid' || !entry.data) return null;

  const data = entry.data;
  const rawAmount = data.price?.amount;
  const price = typeof rawAmount === 'number' && Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;

  const priceAsOf = toIsoStringOrNull(entry.priceTimestamp) ?? toIsoStringOrNull(entry.timestamp);
  if (!priceAsOf) return null;

  const detailPageUrl = toTrimmedString(data.detailPageUrl) || `https://www.amazon.co.jp/dp/${asin}`;
  const releaseDate = toTrimmedString(data.releaseDate) || null;

  const record: CatalogProductRecord = {
    asin,
    title: toTrimmedString(data.title),
    brand: toTrimmedString(data.brand),
    price,
    availability: toTrimmedString(data.availability),
    image: toTrimmedString(data.images?.primary),
    amazon_category: toTrimmedString(data.category),
    release_date: releaseDate,
    detail_page_url: detailPageUrl,
    price_as_of: priceAsOf,
    investigated,
  };

  if (typeof entry.previousPrice === 'number' && Number.isFinite(entry.previousPrice) && entry.previousPrice > 0) {
    record.previous_price = entry.previousPrice;
  }

  const priceChangedAt = toIsoStringOrNull(entry.priceChangedAt);
  if (priceChangedAt) {
    record.price_changed_at = priceChangedAt;
  }

  return record;
}

export async function loadInvestigatedAsinSet(articlesDir: string): Promise<Set<string>> {
  const asins = new Set<string>();

  // 公開用のビルドでは、記事生成後の Markdown ファイルを正本とする。
  const entries = await fs.promises
    .readdir(articlesDir, { withFileTypes: true })
    .catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
      logger.warn(`Articles directory not found: ${articlesDir}`);
      return [];
    });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = ARTICLE_FILENAME_REGEX.exec(entry.name);
    if (match?.[1]) {
      asins.add(match[1].toUpperCase());
    }
  }
  return asins;
}

async function cleanExistingShards(outputDir: string): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir, { recursive: true });
    return;
  }
  const existingFiles = (await fs.promises.readdir(outputDir)).filter((file) => file.endsWith('.json'));
  await mapInChunks(existingFiles, READ_CHUNK_SIZE, async (file) => {
    await fs.promises.unlink(path.join(outputDir, file));
  });
}

export async function generateCatalogData(
  options: GenerateCatalogDataOptions = {},
): Promise<GenerateCatalogDataResult> {
  const cacheDir = options.cacheDir || path.join(process.cwd(), 'data/cache/paapi');
  const articlesDir = options.articlesDir || path.join(process.cwd(), 'content/articles');
  const outputDir = options.outputDir || path.join(process.cwd(), 'static/catalog-data');

  if (!fs.existsSync(cacheDir)) {
    logger.warn(`PAAPI cache directory not found: ${cacheDir}`);
    return { totalRecords: 0, investigatedCount: 0, uninvestigatedCount: 0, shardCount: 0 };
  }

  const investigatedAsins = await loadInvestigatedAsinSet(articlesDir);
  const shardFiles = (await fs.promises.readdir(cacheDir)).filter((file) => file.endsWith('.json'));
  const shards = new Map<string, Record<string, CatalogProductRecord>>();

  let totalRecords = 0;
  let investigatedCount = 0;
  let uninvestigatedCount = 0;

  await mapInChunks(shardFiles, READ_CHUNK_SIZE, async (file) => {
    try {
      const content = await fs.promises.readFile(path.join(cacheDir, file), 'utf-8');
      const parsed = JSON.parse(content) as Record<string, PaapiCacheEntry>;
      for (const [rawAsin, entry] of Object.entries(parsed)) {
        const asin = rawAsin.trim().toUpperCase();
        const investigated = investigatedAsins.has(asin);
        const record = convertCacheEntryToCatalogRecord(asin, entry, investigated);
        if (!record) continue;

        const shardKey = getShardKey(record.asin);
        let shardBucket = shards.get(shardKey);
        if (!shardBucket) {
          shardBucket = {};
          shards.set(shardKey, shardBucket);
        }
        shardBucket[record.asin] = record;

        totalRecords += 1;
        if (record.investigated) {
          investigatedCount += 1;
        } else {
          uninvestigatedCount += 1;
        }
      }
    } catch (err) {
      logger.error(`Failed to parse PAAPI cache shard: ${file}`, err);
      throw err;
    }
  });

  await cleanExistingShards(outputDir);

  const shardEntries = Array.from(shards.entries());
  await mapInChunks(shardEntries, READ_CHUNK_SIZE, async ([shardKey, shardMap]) => {
    const sortedEntries = Object.keys(shardMap)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, CatalogProductRecord>>((acc, key) => {
        const item = shardMap[key];
        if (item) {
          acc[key] = item;
        }
        return acc;
      }, {});
    await fs.promises.writeFile(path.join(outputDir, `${shardKey}.json`), JSON.stringify(sortedEntries), 'utf-8');
  });

  logger.info(
    `Generated catalog data: ${totalRecords} records (${investigatedCount} investigated, ${uninvestigatedCount} uninvestigated) across ${shardEntries.length} shards at ${outputDir}`,
  );

  return {
    totalRecords,
    investigatedCount,
    uninvestigatedCount,
    shardCount: shardEntries.length,
  };
}

if (require.main === module) {
  generateCatalogData()
    .then((result) => {
      console.log(
        `Successfully generated catalog-data: ${result.totalRecords} records across ${result.shardCount} shards.`,
      );
    })
    .catch((err) => {
      console.error('Failed to generate catalog-data:', err);
      process.exit(1);
    });
}
