#!/usr/bin/env ts-node
/**
 * Refresh No-Price Cache Entries Script
 * 
 * キャッシュから「価格情報なし」のエントリを特定し、timestampを古くして
 * 次回のPA-API取得で再取得させるスクリプト
 * 
 * 使用方法:
 *   npx ts-node src/scripts/refresh-no-price-cache.ts
 *   npx ts-node src/scripts/refresh-no-price-cache.ts --dry-run  # 確認のみ
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';

dotenv.config();

const logger = Logger.getInstance();

interface CacheEntry {
    data: ProductDetail | null;
    timestamp: number;
    status: 'valid' | 'invalid' | 'permanent_invalid';
}

interface CacheStore {
    [asin: string]: CacheEntry;
}

/**
 * Check if product data has no price information
 */
function isNoPriceData(data: ProductDetail | null): boolean {
    if (!data) return false;
    return data.price.amount === 0 && data.price.formatted === '価格情報なし';
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    if (dryRun) {
        logger.info('Running in dry-run mode (no changes will be made)');
    }

    const cachePath = path.join(process.cwd(), 'data', 'cache', 'paapi-product-cache.json');

    if (!fs.existsSync(cachePath)) {
        logger.error(`Cache file not found: ${cachePath}`);
        process.exit(1);
    }

    logger.info(`Loading cache from: ${cachePath}`);
    const rawData = fs.readFileSync(cachePath, 'utf-8');
    const cache: CacheStore = JSON.parse(rawData);

    const totalEntries = Object.keys(cache).length;
    logger.info(`Total cache entries: ${totalEntries}`);

    // Find entries with no price info
    const noPriceAsins: string[] = [];
    for (const [asin, entry] of Object.entries(cache)) {
        if (entry.status === 'valid' && isNoPriceData(entry.data)) {
            noPriceAsins.push(asin);
        }
    }

    logger.info(`Found ${noPriceAsins.length} entries with "価格情報なし"`);

    if (noPriceAsins.length === 0) {
        logger.info('No entries to refresh');
        process.exit(0);
    }

    // Log sample of ASINs
    const sampleSize = Math.min(10, noPriceAsins.length);
    logger.info(`Sample ASINs: ${noPriceAsins.slice(0, sampleSize).join(', ')}${noPriceAsins.length > sampleSize ? '...' : ''}`);

    if (dryRun) {
        logger.info('Dry-run complete. No changes made.');
        process.exit(0);
    }

    // Update timestamps to force re-fetch
    // Set timestamp to 25 hours ago (just past TTL)
    const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000);

    for (const asin of noPriceAsins) {
        const entry = cache[asin];
        if (entry) {
            entry.timestamp = oldTimestamp;
        }
    }

    // Save updated cache
    logger.info('Saving updated cache...');
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');

    logger.info(`Successfully refreshed ${noPriceAsins.length} entries`);
    logger.info('These entries will be re-fetched on next PA-API update');

    process.exit(0);
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
