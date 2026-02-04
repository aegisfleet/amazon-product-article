#!/usr/bin/env ts-node
/**
 * Product Search CLI Script
 * GitHub Actions から実行される商品検索スクリプト
 * 
 * 環境変数:
 *   AMAZON_CREATORS_APPLICATION_ID - Amazon Creators API アプリケーションID
 *   AMAZON_CREATORS_CREDENTIAL_ID - Amazon Creators API クレデンシャルID
 *   AMAZON_CREATORS_CREDENTIAL_SECRET - Amazon Creators API クレデンシャルシークレット
 *   AMAZON_PARTNER_TAG - Amazon アソシエイトパートナータグ
 *   PRODUCT_CATEGORIES - 検索カテゴリ（カンマ区切り、オプション）
 *   MAX_RESULTS_PER_CATEGORY - カテゴリあたりの最大結果数（オプション）
 *   INPUT_ASINS - 直接指定するASIN（カンマ区切り、オプション）
 */

import fs from 'fs/promises';
import path from 'path';
import { CreatorsAPIClient } from '../api/CreatorsAPIClient';
import { ProductSearcher, SearchSession } from '../search/ProductSearcher';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

interface CLIOptions {
    applicationId: string;
    credentialId: string;
    credentialSecret: string;
    partnerTag: string;
    categories: string[];
    maxResults: number;
    asins?: string[];
}

function getOptions(): CLIOptions {
    const applicationId = process.env.AMAZON_CREATORS_APPLICATION_ID;
    const credentialId = process.env.AMAZON_CREATORS_CREDENTIAL_ID;
    const credentialSecret = process.env.AMAZON_CREATORS_CREDENTIAL_SECRET;
    const partnerTag = process.env.AMAZON_PARTNER_TAG;

    if (!applicationId || !credentialId || !credentialSecret || !partnerTag) {
        throw new Error(
            'Missing required environment variables: AMAZON_CREATORS_APPLICATION_ID, AMAZON_CREATORS_CREDENTIAL_ID, AMAZON_CREATORS_CREDENTIAL_SECRET, AMAZON_PARTNER_TAG'
        );
    }

    const categoriesEnv = process.env.PRODUCT_CATEGORIES || '';
    const categories = (categoriesEnv === 'all' || categoriesEnv === '')
        ? []
        : categoriesEnv.split(',').map(c => c.trim());

    const maxResults = parseInt(process.env.MAX_RESULTS_PER_CATEGORY || '10', 10);

    // Manual ASIN input from GitHub Actions input or environment variable
    const inputAsinsEnv = process.env.INPUT_ASINS;
    const asins = inputAsinsEnv ? inputAsinsEnv.split(',').map(a => a.trim()).filter(Boolean) : undefined;

    const result: CLIOptions = {
        applicationId,
        credentialId,
        credentialSecret,
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

        // Initialize client and searcher
        const client = new CreatorsAPIClient();
        client.authenticate(
            options.applicationId,
            options.credentialId,
            options.credentialSecret,
            options.partnerTag
        );
        logger.info('Creators API client authenticated');

        // 商品検索を実行
        const searcher = new ProductSearcher(client);
        await searcher.initialize();

        let session: SearchSession;

        if (options.asins && options.asins.length > 0) {
            // Manual ASIN Search
            session = await searcher.searchByAsins(options.asins);
        } else {
            // Category Search (with randomization and exclusion)
            session = await searcher.searchAllCategories(options.categories, options.maxResults);
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
