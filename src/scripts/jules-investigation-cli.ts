#!/usr/bin/env ts-node
/**
 * Jules Investigation CLI Script
 * GitHub Actions から実行されるJules調査スクリプト
 * 
 * 環境変数:
 *   JULES_API_KEY - Jules API キー (https://jules.google.com/settings#api で取得)
 *   JULES_SOURCE - Jules ソース名 (例: sources/github/owner/repo)
 *   JULES_STARTING_BRANCH - 開始ブランチ (デフォルト: main)
 */

import fs from 'fs/promises';
import path from 'path';
import { JulesInvestigator } from '../jules/JulesInvestigator';
import { InvestigationResult, JulesCredentials, SourceContext } from '../types/JulesTypes';
import { Product } from '../types/Product';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

interface CLIOptions {
    apiKey: string;
    source: string;
    startingBranch: string;
    maxProducts: number;
}

function getOptions(): CLIOptions {
    const apiKey = process.env.JULES_API_KEY;
    const source = process.env.JULES_SOURCE;
    const startingBranch = process.env.JULES_STARTING_BRANCH || 'main';

    if (!apiKey) {
        throw new Error('Missing required environment variable: JULES_API_KEY');
    }

    if (!source) {
        throw new Error('Missing required environment variable: JULES_SOURCE (e.g., sources/github/owner/repo)');
    }

    const maxProducts = parseInt(process.env.MAX_INVESTIGATION_PRODUCTS || '5', 10);

    return {
        apiKey,
        source,
        startingBranch,
        maxProducts,
    };
}

async function loadProducts(): Promise<Product[]> {
    const sessionFile = path.join(
        process.cwd(),
        'data',
        'products',
        'latest-session.json'
    );

    try {
        const data = await fs.readFile(sessionFile, 'utf-8');
        const session = JSON.parse(data) as { results?: Array<{ products?: Product[] }> };

        // すべてのカテゴリから商品を収集
        const products: Product[] = [];
        for (const result of session.results || []) {
            products.push(...(result.products || []));
        }

        return products;
    } catch (error) {
        logger.error('Failed to load products:', error);
        return [];
    }
}

async function ensureOutputDirectories(): Promise<void> {
    const dirs = [
        path.join(process.cwd(), 'data'),
        path.join(process.cwd(), 'data', 'investigations'),
    ];

    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function saveInvestigationResult(
    product: Product,
    result: InvestigationResult
): Promise<void> {
    const investigationsDir = path.join(process.cwd(), 'data', 'investigations');
    const filename = `${product.asin}-${Date.now()}.json`;
    const filePath = path.join(investigationsDir, filename);

    await fs.writeFile(filePath, JSON.stringify({
        product,
        investigation: result,
        timestamp: new Date().toISOString(),
    }, null, 2));

    logger.info(`Investigation result saved: ${filename}`);
}

async function setGitHubOutput(name: string, value: string): Promise<void> {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        await fs.appendFile(outputFile, `${name}=${value}\n`);
        logger.info(`Set GitHub output: ${name}=${value}`);
    } else {
        console.log(`::set-output name=${name}::${value}`);
    }
}

async function main(): Promise<void> {
    logger.info('Starting Jules investigation CLI...');

    try {
        const options = getOptions();
        logger.info(`Source: ${options.source}`);
        logger.info(`Starting Branch: ${options.startingBranch}`);
        logger.info(`Max products to investigate: ${options.maxProducts}`);

        await ensureOutputDirectories();

        // 商品データを読み込み
        const products = await loadProducts();
        if (products.length === 0) {
            logger.warn('No products to investigate');
            await setGitHubOutput('investigations-completed', '0');
            process.exit(0);
        }

        logger.info(`Loaded ${products.length} products`);

        // 調査対象を制限
        const productsToInvestigate = products.slice(0, options.maxProducts);
        logger.info(`Investigating ${productsToInvestigate.length} products`);

        // Jules Investigator を初期化
        const credentials: JulesCredentials = {
            apiKey: options.apiKey,
        };
        const investigator = new JulesInvestigator(credentials);

        // ソースコンテキストを作成
        const sourceContext: SourceContext = {
            source: options.source,
            githubRepoContext: {
                startingBranch: options.startingBranch,
            },
        };

        // 各商品を調査
        let completedInvestigations = 0;
        const investigationResults: Array<{
            product: Product;
            result: InvestigationResult;
        }> = [];

        for (const product of productsToInvestigate) {
            try {
                logger.info(`Investigating product: ${product.title} (ASIN: ${product.asin})`);

                const result = await investigator.conductInvestigation(product, sourceContext);

                await saveInvestigationResult(product, result);
                investigationResults.push({ product, result });
                completedInvestigations++;

                logger.info(`Investigation completed for ${product.asin}`);

                // レート制限対応
                await new Promise(resolve => setTimeout(resolve, 5000));

            } catch (error) {
                logger.error(`Failed to investigate product ${product.asin}:`, error);
                // 個別の失敗は継続
            }
        }

        // 結果サマリーを保存
        const summaryFile = path.join(
            process.cwd(),
            'data',
            'investigations',
            'latest-summary.json'
        );
        await fs.writeFile(summaryFile, JSON.stringify({
            totalProducts: productsToInvestigate.length,
            completedInvestigations,
            results: investigationResults,
            timestamp: new Date().toISOString(),
        }, null, 2));

        // GitHub Actions 出力を設定
        await setGitHubOutput('investigations-completed', completedInvestigations.toString());
        await setGitHubOutput('total-products', productsToInvestigate.length.toString());

        logger.info(`Jules investigation completed: ${completedInvestigations}/${productsToInvestigate.length} products`);
        process.exit(0);

    } catch (error) {
        logger.error('Jules investigation failed:', error);
        await setGitHubOutput('investigations-completed', '0');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
