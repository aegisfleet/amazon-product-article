#!/usr/bin/env ts-node
/**
 * Jules Investigation CLI Script
 * GitHub Actions から実行されるJules調査スクリプト
 * 
 * Jules API ドキュメント: https://jules.google/docs/api/reference/
 * 
 * 環境変数:
 *   JULES_API_KEY - Jules API キー (https://jules.google.com/settings#api で取得)
 *   JULES_SOURCE - Jules ソース名 (例: sources/github/owner/repo)
 *   JULES_STARTING_BRANCH - 開始ブランチ (デフォルト: main)
 */

import fs from 'fs/promises';
import path from 'path';
import { JulesInvestigator } from '../jules/JulesInvestigator';
import { JulesCredentials, SourceContext } from '../types/JulesTypes';
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

async function saveSessionInfo(
    product: Product,
    sessionInfo: { sessionId: string; sessionName: string }
): Promise<void> {
    const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    const filename = `${product.asin}-${Date.now()}.json`;
    const filePath = path.join(sessionsDir, filename);

    await fs.writeFile(filePath, JSON.stringify({
        product,
        session: sessionInfo,
        status: 'started',
        timestamp: new Date().toISOString(),
    }, null, 2));

    logger.info(`Session info saved: ${filename}`);
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

        // 各商品のセッションを開始
        let startedSessions = 0;
        const sessionResults: Array<{
            product: Product;
            session: { sessionId: string; sessionName: string };
        }> = [];

        for (const product of productsToInvestigate) {
            try {
                logger.info(`Starting investigation for: ${product.title} (ASIN: ${product.asin})`);

                // 非同期でセッションを開始（Julesが非同期でPRを作成）
                const sessionInfo = await investigator.startInvestigation(product, sourceContext);

                await saveSessionInfo(product, sessionInfo);
                sessionResults.push({ product, session: sessionInfo });
                startedSessions++;

                logger.info(`Investigation session started for ${product.asin}: ${sessionInfo.sessionId}`);

                // レート制限対応
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                logger.error(`Failed to start investigation for ${product.asin}:`, error);
                // 個別の失敗は継続
            }
        }

        // 結果サマリーを保存
        const summaryFile = path.join(
            process.cwd(),
            'data',
            'sessions',
            'latest-summary.json'
        );
        await fs.mkdir(path.dirname(summaryFile), { recursive: true });
        await fs.writeFile(summaryFile, JSON.stringify({
            totalProducts: productsToInvestigate.length,
            startedSessions,
            sessions: sessionResults,
            timestamp: new Date().toISOString(),
        }, null, 2));

        // GitHub Actions 出力を設定
        await setGitHubOutput('sessions-started', startedSessions.toString());
        await setGitHubOutput('total-products', productsToInvestigate.length.toString());

        logger.info(`Jules sessions started: ${startedSessions}/${productsToInvestigate.length} products`);
        logger.info('Note: Jules will create PRs asynchronously. Check GitHub for PR creation.');
        process.exit(0);

    } catch (error) {
        logger.error('Jules investigation failed:', error);
        await setGitHubOutput('sessions-started', '0');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
