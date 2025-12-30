#!/usr/bin/env ts-node
/**
 * Maintenance Script: Clean Product Cache
 * data/cache/paapi-product-cache.json から "status": "valid" のデータを削除する
 */

import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

async function main(): Promise<void> {
    logger.info('Starting cache cleaning maintenance...');

    const cacheFile = path.join(process.cwd(), 'data', 'cache', 'paapi-product-cache.json');

    try {
        // キャッシュファイルを読み込み
        const data = await fs.readFile(cacheFile, 'utf-8');
        const cache = JSON.parse(data);

        // 削除前のエントリ数を記録
        const initialCount = Object.keys(cache).length;
        let removedCount = 0;

        // "status": "valid" のエントリをフィルタリング
        const newCache: Record<string, any> = {};
        
        for (const [asin, entry] of Object.entries(cache)) {
            const cacheEntry = entry as { status?: string };
            if (cacheEntry.status === 'valid') {
                removedCount++;
            } else {
                newCache[asin] = entry;
            }
        }

        // ファイルに書き戻し
        await fs.writeFile(cacheFile, JSON.stringify(newCache, null, 2));

        logger.info(`Cache cleaning completed.`);
        logger.info(`Total entries processed: ${initialCount}`);
        logger.info(`Entries removed (valid status): ${removedCount}`);
        logger.info(`Entries remaining: ${Object.keys(newCache).length}`);

    } catch (error) {
        logger.error('Failed to clean cache:', error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
