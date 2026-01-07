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
import { PAAPICache } from '../api/PAAPICache';
import { PAAPIClient } from '../api/PAAPIClient';
import { ArticleGenerator, GeneratedArticle } from '../article/ArticleGenerator';
import { GitHubPublisher } from '../github/GitHubPublisher';
import { InvestigationResult } from '../types/JulesTypes';
import { Product, ProductDetail } from '../types/Product';
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
            asin?: string;
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

        // Initialize PA-API Client & Cache
        const paapiClient = new PAAPIClient();
        const paapiCache = new PAAPICache();
        const usePaapi = options.accessKey && options.secretKey && options.partnerTag;

        if (usePaapi) {
            try {
                paapiClient.authenticate(options.accessKey, options.secretKey, options.partnerTag);
            } catch (error) {
                logger.error('Failed to authenticate with PA-API:', error);
                // Continue without PA-API
            }
        }

        // --- BATCH FETCHING STRATEGY START ---
        // 1. Collect all unique ASINs needed (Main products + Competitors)
        const allAsins = new Set<string>();
        for (const data of investigations) {
            allAsins.add(data.product.asin);
            for (const comp of data.investigation.analysis.competitiveAnalysis) {
                if (comp.asin) {
                    allAsins.add(comp.asin);
                }
            }
        }

        logger.info(`Total unique ASINs to process: ${allAsins.size}`);

        // 2. Identify missing ASINs (not in cache or expired, and NOT marked invalid)
        const asinsArray = Array.from(allAsins);
        const missingAsins = paapiCache.getMissingAsins(asinsArray);
        const invalidAsins = asinsArray.filter(asin => paapiCache.isInvalid(asin));

        logger.info(`ASINs stats: Total: ${asinsArray.length}, Cache Hit: ${asinsArray.length - missingAsins.length - invalidAsins.length}, Known Invalid: ${invalidAsins.length}, To Fetch: ${missingAsins.length}`);

        // 3. Fetch missing ASINs in batches if PA-API is enabled
        if (usePaapi && missingAsins.length > 0) {
            // Process in chunks of 10
            const chunkSize = 10;
            for (let i = 0; i < missingAsins.length; i += chunkSize) {
                const chunk = missingAsins.slice(i, i + chunkSize);
                try {
                    logger.info(`Fetching batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(missingAsins.length / chunkSize)} (${chunk.length} items)...`);
                    const results = await paapiClient.getMultipleProductDetails(chunk);

                    // Update cache for found items
                    for (const [asin, detail] of results.entries()) {
                        paapiCache.set(asin, detail);
                    }

                    // Identify ASINs that were requested but NOT returned => Invalid/Not Found
                    for (const asin of chunk) {
                        if (!results.has(asin)) {
                            logger.info(`Marking ASIN ${asin} as invalid (not found in PA-API)`);
                            paapiCache.markInvalid(asin);
                        }
                    }

                    // Save incrementally to prevent data loss on crash
                    paapiCache.save();

                    // Respect rate limits - wait a bit between batches if needed
                    if (i + chunkSize < missingAsins.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    logger.warn(`Failed to fetch batch starting with ${chunk[0]}:`, error);
                    // On batch error (e.g. network), we DO NOT mark as invalid, we just skip
                }
            }
        } else if (!usePaapi && missingAsins.length > 0) {
            logger.warn('PA-API credentials missing, skipping fetch for missing ASINs');
        }
        // --- BATCH FETCHING STRATEGY END ---

        // 各調査結果から記事を生成
        let generatedCount = 0;
        const generatedArticles: string[] = [];

        for (const data of investigations) {
            try {
                logger.info(`Processing article for: ${data.product.asin}`);

                // Get fresh product data from Cache (fallback to expired if fetch failed)
                const cachedProduct = paapiCache.get(data.product.asin, { ignoreExpiration: true });

                if (cachedProduct) {
                    // Merge live data into the product object
                    data.product = {
                        ...data.product,
                        ...cachedProduct,
                    };
                    data.investigation.product = data.product;
                    logger.info(`Used cached product data for ${data.product.asin}`);
                } else if (usePaapi) {
                    // Only warn if we sought it but failed to get it
                    logger.warn(`Product data not found for ${data.product.asin}, proceeding with basic info`);
                }

                // Get competitor details from Cache
                const competitorDetails = new Map<string, ProductDetail>();
                const competitorAsins = data.investigation.analysis.competitiveAnalysis
                    .filter(c => c.asin)
                    .map(c => c.asin!);

                if (competitorAsins.length > 0) {
                    const cachedCompetitors = paapiCache.getMultiple(competitorAsins, { ignoreExpiration: true });
                    for (const [asin, detail] of cachedCompetitors.entries()) {
                        competitorDetails.set(asin, detail);
                    }
                    logger.info(`Retrieved ${competitorDetails.size}/${competitorAsins.length} competitor details from cache`);
                }

                logger.info(`Generating article for: ${data.product.title}`);

                const article = await generator.generateArticle(
                    data.product,
                    data.investigation,
                    undefined,
                    undefined,
                    options.partnerTag,
                    competitorDetails
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
