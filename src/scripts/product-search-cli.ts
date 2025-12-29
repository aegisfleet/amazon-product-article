#!/usr/bin/env ts-node
/**
 * Product Search CLI Script
 * GitHub Actions から実行される商品検索スクリプト
 * 
 * 環境変数:
 *   AMAZON_ACCESS_KEY - Amazon PA-API アクセスキー
 *   AMAZON_SECRET_KEY - Amazon PA-API シークレットキー
 *   AMAZON_PARTNER_TAG - Amazon アソシエイトパートナータグ
 *   PRODUCT_CATEGORIES - 検索カテゴリ（カンマ区切り、オプション）
 *   MAX_RESULTS_PER_CATEGORY - カテゴリあたりの最大結果数（オプション）
 *   INPUT_ASINS - 直接指定するASIN（カンマ区切り、オプション）
 */

import fs from 'fs/promises';
import path from 'path';
import { PAAPIClient } from '../api/PAAPIClient';
import { ProductSearcher, SearchSession } from '../search/ProductSearcher';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

interface CLIOptions {
    accessKey: string;
    secretKey: string;
    partnerTag: string;
    categories: string[];
    maxResults: number;
    asins?: string[];
}

function getOptions(): CLIOptions {
    const accessKey = process.env.AMAZON_ACCESS_KEY;
    const secretKey = process.env.AMAZON_SECRET_KEY;
    const partnerTag = process.env.AMAZON_PARTNER_TAG;

    if (!accessKey || !secretKey || !partnerTag) {
        throw new Error(
            'Missing required environment variables: AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG'
        );
    }

    const categoriesEnv = process.env.PRODUCT_CATEGORIES || '';
    const categories = categoriesEnv.split(',').map(c => c.trim());

    const maxResults = parseInt(process.env.MAX_RESULTS_PER_CATEGORY || '10', 10);

    // Manual ASIN input from GitHub Actions input or environment variable
    const inputAsinsEnv = process.env.INPUT_ASINS;
    const asins = inputAsinsEnv ? inputAsinsEnv.split(',').map(a => a.trim()).filter(Boolean) : undefined;

    const result: CLIOptions = {
        accessKey,
        secretKey,
        partnerTag,
        categories,
        maxResults
    };

    if (asins) {
        result.asins = asins;
    }

    return result;
}

async function ensureOutputDirectories(): Promise<void> {
    const dirs = [
        path.join(process.cwd(), 'data'),
        path.join(process.cwd(), 'data', 'products'),
        path.join(process.cwd(), 'data', 'products', 'sessions'),
        path.join(process.cwd(), 'data', 'products', 'categories'),
    ];

    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function setGitHubOutput(name: string, value: string): Promise<void> {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        await fs.appendFile(outputFile, `${name}=${value}\n`);
        logger.info(`Set GitHub output: ${name}=${value}`);
    } else {
        // ローカル実行時はコンソールに出力
        console.log(`::set-output name=${name}::${value}`);
    }
}

async function main(): Promise<void> {
    logger.info('Starting product search CLI...');

    try {
        const options = getOptions();
        logger.info(`Categories: ${options.categories.join(', ')}`);
        logger.info(`Max results per category: ${options.maxResults}`);

        if (options.asins && options.asins.length > 0) {
            logger.info(`Manual ASIN mode: investigating ${options.asins.length} products`);
            logger.info(`Target ASINs: ${options.asins.join(', ')}`);
        }

        await ensureOutputDirectories();

        // PA-API クライアントを初期化
        const papiClient = new PAAPIClient();
        papiClient.authenticate(
            options.accessKey,
            options.secretKey,
            options.partnerTag
        );
        logger.info('PA-API client authenticated');

        // 商品検索を実行
        const searcher = new ProductSearcher(papiClient);
        await searcher.initialize();

        let session: SearchSession;

        if (options.asins && options.asins.length > 0) {
            // Manual ASIN Search
            session = await searcher.searchByAsins(options.asins);
        } else {
            // Category Search (with randomization and exclusion)
            session = await searcher.searchAllCategories();
        }

        logger.info(`Search completed: ${session.totalProducts} products found`);

        // セッション情報を出力
        const sessionFile = path.join(
            process.cwd(),
            'data',
            'products',
            'latest-session.json'
        );
        await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
        logger.info(`Session saved to ${sessionFile}`);

        // GitHub Actions 出力を設定
        const productsFound = session.totalProducts > 0;
        await setGitHubOutput('products-found', productsFound.toString());
        await setGitHubOutput('session-id', session.id);
        await setGitHubOutput('total-products', session.totalProducts.toString());

        if (productsFound) {
            logger.info('Product search completed successfully');
            process.exit(0);
        } else {
            logger.warn('No products found');
            process.exit(0);
        }
    } catch (error) {
        logger.error('Product search failed:', error);
        await setGitHubOutput('products-found', 'false');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
