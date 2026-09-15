#!/usr/bin/env ts-node

/**
 * Sync Variations CLI Script
 * 指定された商品（親ASINまたは子ASIN）の全バリエーション子ASINをCreators APIから取得し、
 * 専用バリエーションキャッシュ (data/cache/variations-cache.json) および
 * 検索用逆引きマップ (static/data/asin-variations.json) に同期する。
 *
 * 使用例:
 *   pnpm ts-node src/scripts/maintenance/sync-variations.ts B0C7L74HJZ
 *   pnpm ts-node src/scripts/maintenance/sync-variations.ts B00GH7PGKE
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { CreatorsAPIClient } from '../../api/CreatorsAPIClient';
import { enhanceCategories } from '../enhance-categories';

dotenv.config();

interface SyncOptions {
  asins: string[];
  verbose: boolean;
}

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const asins: string[] = [];
  let verbose = false;

  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (/^[A-Z0-9]{10}$/i.test(arg)) {
      asins.push(arg.toUpperCase());
    }
  }

  return { asins, verbose };
}

/**
 * 調査データまたはキャッシュから指定ASINの親ASINを特定する
 */
function findParentAsinLocally(asin: string): string | null {
  // 1. data/investigations/<asin>.json
  const invPath = path.resolve(process.cwd(), `data/investigations/${asin}.json`);
  if (fs.existsSync(invPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(invPath, 'utf-8'));
      if (data?.analysis?.parentAsin) {
        return data.analysis.parentAsin.toUpperCase();
      }
    } catch {
      // ファイル解析エラー時は無視してフォールバック
    }
  }

  // 2. data/cache/paapi-product-cache.json
  const cachePath = path.resolve(process.cwd(), 'data/cache/paapi-product-cache.json');
  if (fs.existsSync(cachePath)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const p = cache[asin]?.data?.parentAsin;
      if (p) return p.toUpperCase();
    } catch {
      // キャッシュ解析エラー時は無視してフォールバック
    }
  }

  return null;
}

async function resolveParentAsin(client: CreatorsAPIClient, asin: string): Promise<string> {
  const localParent = findParentAsinLocally(asin);
  if (localParent) return localParent;

  // Creators APIで確認
  try {
    const details = await client.getMultipleProductDetails([asin]);
    const item = details.results.get(asin);
    if (item?.parentAsin) {
      return item.parentAsin.toUpperCase();
    }
  } catch {
    // APIエラー時は指定ASIN自体を親ASINとして試行
  }

  // 見つからなければ指定ASIN自体を親ASINとみなす
  return asin;
}

function loadVariationsCache(cachePath: string): Record<string, string[]> {
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (e) {
    console.warn('Failed to load existing variations cache, creating fresh:', e);
    return {};
  }
}

function saveVariationsCache(cachePath: string, cache: Record<string, string[]>): void {
  const cacheDir = path.dirname(cachePath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
  const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
  const jsonContent = sortedKeys.length > 0 ? `{\n${lines.join(',\n')}\n}\n` : '{}\n';
  fs.writeFileSync(cachePath, jsonContent, 'utf-8');
}

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return JSON.stringify(err);
}

async function syncSingleAsin(
  client: CreatorsAPIClient,
  inputAsin: string,
  verbose: boolean,
): Promise<{ parentAsin: string; variations: string[] }> {
  console.log(`\nProcessing ASIN: ${inputAsin}...`);
  const parentAsin = await resolveParentAsin(client, inputAsin);
  const logMsg =
    parentAsin !== inputAsin
      ? `Resolved parent ASIN: ${parentAsin} (from input child ASIN: ${inputAsin})`
      : `Using target ASIN as parent: ${parentAsin}`;
  console.log(logMsg);

  try {
    console.log(`Fetching variations for parent ${parentAsin} from Creators API...`);
    const childAsins = await client.getVariations(parentAsin);
    console.log(`Retrieved ${childAsins.length} variation(s) for ${parentAsin}`);

    const filtered = Array.from(new Set(childAsins.filter((c) => c !== parentAsin))).sort((a, b) => a.localeCompare(b));
    if (filtered.length > 0) {
      if (verbose) {
        console.log(`Variations: ${filtered.join(', ')}`);
      }
    } else {
      console.log(`No variations returned for ${parentAsin}.`);
    }
    return { parentAsin, variations: filtered };
  } catch (err: unknown) {
    const msg = formatErrorMessage(err);
    console.error(`Failed to fetch variations for ${parentAsin}:`, msg);
    return { parentAsin, variations: [] };
  }
}

async function main() {
  const options = parseArgs();
  if (options.asins.length === 0) {
    console.log('Usage: pnpm ts-node src/scripts/maintenance/sync-variations.ts <ASIN...>');
    console.log('Example: pnpm ts-node src/scripts/maintenance/sync-variations.ts B0C7L74HJZ');
    process.exit(1);
  }

  const client = new CreatorsAPIClient();
  client.authenticate(
    process.env.AMAZON_CREATORS_APPLICATION_ID || '',
    process.env.AMAZON_CREATORS_CREDENTIAL_ID || '',
    process.env.AMAZON_CREATORS_CREDENTIAL_SECRET || '',
    process.env.AMAZON_PARTNER_TAG || 'aegis-22',
  );

  const variationsCachePath = path.resolve(process.cwd(), 'data/cache/variations-cache.json');
  const variationsCache = loadVariationsCache(variationsCachePath);
  let totalAdded = 0;

  for (const inputAsin of options.asins) {
    const { parentAsin, variations } = await syncSingleAsin(client, inputAsin, options.verbose);
    if (variations.length > 0) {
      variationsCache[parentAsin] = variations;
      totalAdded += variations.length;
    }
  }

  saveVariationsCache(variationsCachePath, variationsCache);
  console.log(`\nUpdated variations cache: ${variationsCachePath}`);
  console.log(`Total parent groups cached: ${Object.keys(variationsCache).length}`);
  console.log(`Total child variations synchronized: ${totalAdded}`);

  console.log('\nRegenerating static/data/asin-variations.json...');
  enhanceCategories();
  console.log('Done!');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
