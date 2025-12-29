#!/usr/bin/env ts-node
/**
 * Article Generation CLI Script
 * GitHub Actions から実行される記事生成・公開スクリプト
 * 
 * 環境変数:
 *   AMAZON_PARTNER_TAG - Amazon アソシエイトパートナータグ
 *   GITHUB_TOKEN - GitHub トークン（コミット用）
 *   GITHUB_REPOSITORY - GitHubリポジトリ（owner/repo形式）
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { PAAPIClient } from '../api/PAAPIClient';
import { ArticleGenerator, GeneratedArticle } from '../article/ArticleGenerator';
import { GitHubPublisher } from '../github/GitHubPublisher';
import { InvestigationResult } from '../types/JulesTypes';
import { Product } from '../types/Product';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

// Load environment variables
dotenv.config();

interface CLIOptions {
    partnerTag: string;
    accessKey: string;
    secretKey: string;
    githubToken: string | undefined;
    githubRepository: string | undefined;
}

/**
 * JSONファイルの実際の構造（analysisのみを含む）
 */
interface RawInvestigationFile {
    analysis: {
        positivePoints: string[];
        negativePoints: string[];
        useCases: string[];
        userStories: Array<{
            userType: string;
            scenario: string;
            experience: string;
            sentiment: 'positive' | 'negative' | 'mixed';
        }>;
        userImpression: string;
        sources: Array<{
            name: string;
            url?: string;
            credibility?: string;
        }>;
        competitiveAnalysis: Array<{
            name: string;
            priceComparison: string;
            featureComparison: string[];
            differentiators: string[];
        }>;
        recommendation: {
            targetUsers: string[];
            pros: string[];
            cons: string[];
            score: number;
        };
        lastInvestigated?: string;
    };
}

interface InvestigationData {
    product: Product;
    investigation: InvestigationResult;
    timestamp: string;
}

function getOptions(): CLIOptions {
    const partnerTag = process.env.AMAZON_PARTNER_TAG || '';
    const accessKey = process.env.AMAZON_ACCESS_KEY || '';
    const secretKey = process.env.AMAZON_SECRET_KEY || '';
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepository = process.env.GITHUB_REPOSITORY;

    if (!partnerTag) {
        logger.warn('AMAZON_PARTNER_TAG not set, affiliate links will be incomplete');
    }

    if (!accessKey || !secretKey) {
        logger.warn('AMAZON_ACCESS_KEY or AMAZON_SECRET_KEY not set, live product data will not be fetched');
    }

    return {
        partnerTag,
        accessKey,
        secretKey,
        githubToken,
        githubRepository,
    };
}

/**
 * ファイル名からASINを抽出し、JSON構造を変換してInvestigationDataを構築
 */
async function loadInvestigationResults(): Promise<InvestigationData[]> {
    const investigationsDir = path.join(process.cwd(), 'data', 'investigations');

    try {
        const files = await fs.readdir(investigationsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'latest-summary.json');

        const results: InvestigationData[] = [];
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(investigationsDir, file);
                const rawData = await fs.readFile(filePath, 'utf-8');
                const parsed: RawInvestigationFile = JSON.parse(rawData);

                // ファイル名からASINを抽出 (e.g., "B07DZZJ2B9.json" -> "B07DZZJ2B9")
                const asin = path.basename(file, '.json');

                // 最小限のProduct情報を構築（ASINのみ必須、他はプレースホルダー）
                const product: Product = {
                    asin,
                    title: `Product ${asin}`,  // タイトルは後で記事生成時に更新可能
                    category: '',
                    price: { amount: 0, currency: 'JPY', formatted: '' },
                    images: { primary: '', thumbnails: [] },
                    specifications: {},
                    rating: { average: 0, count: 0 },
                };

                // InvestigationResultを構築
                const investigation: InvestigationResult = {
                    sessionId: `file-${asin}`,
                    product,
                    analysis: parsed.analysis,
                    generatedAt: new Date(),
                };

                results.push({
                    product,
                    investigation,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                logger.warn(`Failed to load investigation file ${file}:`, error);
            }
        }

        return results;
    } catch (error) {
        logger.error('Failed to load investigation results:', error);
        return [];
    }
}

async function ensureOutputDirectories(): Promise<void> {
    const dirs = [
        path.join(process.cwd(), 'content', 'articles'),
    ];

    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function saveArticle(
    article: GeneratedArticle,
    asin: string
): Promise<string> {
    const articlesDir = path.join(process.cwd(), 'content', 'articles');
    const filename = `${asin}.md`;
    const filePath = path.join(articlesDir, filename);

    await fs.writeFile(filePath, article.content);
    logger.info(`Article saved: ${filename}`);

    return filePath;
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
    logger.info('Starting article generation CLI...');

    try {
        const options = getOptions();
        logger.info(`Partner tag: ${options.partnerTag || '(not set)'}`);

        await ensureOutputDirectories();

        // 調査結果を読み込み
        const investigations = await loadInvestigationResults();
        if (investigations.length === 0) {
            logger.warn('No investigation results found');
            await setGitHubOutput('articles-generated', '0');
            process.exit(0);
        }

        logger.info(`Loaded ${investigations.length} investigation results`);

        // Article Generator を初期化
        const generator = new ArticleGenerator();

        // GitHub Publisher を初期化（オプション）
        let publisher: GitHubPublisher | undefined;
        if (options.githubToken && options.githubRepository) {
            const [owner, repo] = options.githubRepository.split('/');
            publisher = new GitHubPublisher({
                token: options.githubToken,
                owner: owner || '',
                repo: repo || '',
                branch: 'main',
            });
        }

        // 各調査結果から記事を生成
        let generatedCount = 0;
        const generatedArticles: string[] = [];

        // Initialize PA-API Client
        const paapiClient = new PAAPIClient();
        if (options.accessKey && options.secretKey && options.partnerTag) {
            try {
                paapiClient.authenticate(options.accessKey, options.secretKey, options.partnerTag);
            } catch (error) {
                logger.error('Failed to authenticate with PA-API:', error);
                // Continue? Or exit? If we demand prices, we should probably warn strongly or fail.
                // For now, let's proceed but we won't get live data.
            }
        }

        for (const data of investigations) {
            try {
                logger.info(`Processing article for: ${data.product.asin}`);

                // Fetch live product data if possible
                if (options.accessKey && options.secretKey && options.partnerTag) {
                    try {
                        logger.info(`Fetching live data from PA-API for ${data.product.asin}...`);
                        const liveProduct = await paapiClient.getProductDetails(data.product.asin);
                        // Merge live data into the product object
                        data.product = {
                            ...data.product,
                            ...liveProduct,
                            // Preserve fields that might not be in PA-API detail if needed, but getProductDetails returns a full ProductDetail which extends Product
                        };
                        // Update investigation product reference as well
                        data.investigation.product = data.product;
                        logger.info(`Successfully updated product data for ${data.product.asin}`);
                    } catch (error) {
                        // PA-APIで商品が見つからない = amazon.co.jpで販売されていない可能性
                        logger.warn(`商品 ${data.product.asin} はamazon.co.jpで取得できませんでした。記事生成をスキップします:`, error);
                        continue; // この商品の記事生成をスキップ
                    }
                }

                logger.info(`Generating article for: ${data.product.title}`);

                const article = await generator.generateArticle(
                    data.product,
                    data.investigation,
                    undefined,
                    undefined,
                    options.partnerTag
                );

                const articlePath = await saveArticle(article, data.product.asin);
                generatedArticles.push(articlePath);

                // GitHub Publisher でコミット（利用可能な場合）
                if (publisher) {
                    await publisher.commitArticle(article.content, article.metadata);
                    logger.info(`Article committed for ${data.product.asin}`);
                }

                generatedCount++;
                logger.info(`Article generated for ${data.product.asin}`);

            } catch (error) {
                logger.error(`Failed to generate article for ${data.product.asin}:`, error);
                // 個別の失敗は継続
            }
        }

        // サマリー保存
        const summaryFile = path.join(
            process.cwd(),
            'content',
            'articles',
            'generation-summary.json'
        );
        await fs.writeFile(summaryFile, JSON.stringify({
            totalInvestigations: investigations.length,
            generatedArticles: generatedCount,
            articlePaths: generatedArticles,
            timestamp: new Date().toISOString(),
        }, null, 2));

        // GitHub Actions 出力を設定
        await setGitHubOutput('articles-generated', generatedCount.toString());
        await setGitHubOutput('total-investigations', investigations.length.toString());

        logger.info(`Article generation completed: ${generatedCount}/${investigations.length} articles`);
        process.exit(0);

    } catch (error) {
        logger.error('Article generation failed:', error);
        await setGitHubOutput('articles-generated', '0');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
