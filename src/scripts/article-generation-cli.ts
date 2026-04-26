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

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { CreatorsAPICache } from '../api/CreatorsAPICache';
import { CreatorsAPIClient } from '../api/CreatorsAPIClient';
import { ArticleGenerator } from '../article/ArticleGenerator';
import { GitHubPublisher } from '../github/GitHubPublisher';
import { InvestigationFileSchema } from '../schemas/InvestigationSchema';
import type { GeneratedArticle } from '../types/ArticleTypes';
import type { InvestigationResult } from '../types/JulesTypes';
import type { Product, ProductDetail } from '../types/Product';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';

const execFileAsync = promisify(execFile);

const logger = Logger.getInstance();

// Load environment variables
dotenv.config();

interface CLIOptions {
  partnerTag: string;
  applicationId: string;
  credentialId: string;
  credentialSecret: string;
  githubToken: string | undefined;
  githubRepository: string | undefined;
}

export interface InvestigationData {
  product: Product;
  investigation: InvestigationResult;
  timestamp: string;
}

function getOptions(): CLIOptions {
  const partnerTag = process.env.AMAZON_PARTNER_TAG || '';
  const applicationId = process.env.AMAZON_CREATORS_APPLICATION_ID || '';
  const credentialId = process.env.AMAZON_CREATORS_CREDENTIAL_ID || '';
  const credentialSecret = process.env.AMAZON_CREATORS_CREDENTIAL_SECRET || '';
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepository = process.env.GITHUB_REPOSITORY;

  if (!partnerTag) {
    logger.warn('AMAZON_PARTNER_TAG not set, affiliate links will be incomplete');
  }

  if (!applicationId || !credentialId || !credentialSecret) {
    logger.warn('Creators API credentials not set, live product data will not be fetched');
  }

  return {
    partnerTag,
    applicationId,
    credentialId,
    credentialSecret,
    githubToken,
    githubRepository,
  };
}

/**
 * ファイル名からASINを抽出し、JSON構造を変換してInvestigationDataを構築
 */
export async function loadInvestigationResults(targetFiles?: string[]): Promise<InvestigationData[]> {
  const investigationsDir = path.join(process.cwd(), 'data', 'investigations');
  let filesToProcess: string[];

  if (targetFiles && targetFiles.length > 0) {
    filesToProcess = targetFiles;
  } else {
    try {
      const files = await fs.readdir(investigationsDir);
      filesToProcess = files
        .filter((f) => f.endsWith('.json') && f !== 'latest-summary.json')
        .map((f) => path.join(investigationsDir, f));
    } catch (error) {
      logger.error('Failed to read investigations directory:', error);
      return [];
    }
  }

  const results: InvestigationData[] = [];
  const chunkSize = 50;

  for (let i = 0; i < filesToProcess.length; i += chunkSize) {
    const chunk = filesToProcess.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (filePath) => {
        try {
          const rawData = await fs.readFile(filePath, 'utf-8');
          const jsonParsed: unknown = JSON.parse(rawData);
          const validation = InvestigationFileSchema.safeParse(jsonParsed);

          if (!validation.success) {
            logger.warn(`Invalid investigation file format ${filePath}:`, validation.error);
            return null;
          }

          const parsed = validation.data;

          const fileName = path.basename(filePath);
          // Skip if not a JSON file or is summary
          if (!fileName.endsWith('.json') || fileName === 'latest-summary.json') {
            return null;
          }

          // ファイル名からASINを抽出 (e.g., "B07DZZJ2B9.json" -> "B07DZZJ2B9")
          const asin = path.basename(fileName, '.json');

          // 最小限のProduct情報を構築（ASINのみ必須、他はプレースホルダー）
          const product: Product = {
            asin,
            title: `Product ${asin}`, // タイトルは後で記事生成時に更新可能
            category: '',
            price: { amount: 0, currency: 'JPY', formatted: '' },
            images: { primary: '', thumbnails: [] },
            specifications: {},
            rating: { average: 0, count: 0 },
          };

          // lastInvestigatedがあればそれを優先、なければファイルの更新日時（fs.stat）を取得
          let generatedAt: Date | null = null;
          if (parsed.analysis.lastInvestigated) {
            const parsedDate = new Date(parsed.analysis.lastInvestigated);
            // Check if the date is valid
            if (!Number.isNaN(parsedDate.getTime())) {
              generatedAt = parsedDate;
            }
          }

          if (!generatedAt) {
            // ファイルの更新日時を取得（作成日時の代用）
            const stats = await fs.stat(filePath);
            generatedAt = stats.mtime;
          }

          // InvestigationResultを構築
          const investigation: InvestigationResult = {
            sessionId: `file-${asin}`,
            product,
            analysis: parsed.analysis as unknown as InvestigationResult['analysis'],
            generatedAt: generatedAt,
          };

          return {
            product,
            investigation,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          if ((error as { code?: string }).code === 'ENOENT') {
            logger.warn(`File not found: ${filePath}, skipping`);
            return null;
          }
          logger.warn(`Failed to load investigation file ${filePath}:`, error);
          return null;
        }
      }),
    );

    results.push(...chunkResults.filter((result): result is InvestigationData => result !== null));
  }

  return results;
}

async function ensureOutputDirectories(): Promise<void> {
  const dirs = [path.join(process.cwd(), 'content', 'articles')];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function saveArticle(article: GeneratedArticle, asin: string): Promise<string> {
  if (!/^[A-Z0-9]{10}$/i.test(asin)) {
    throw new Error(`Invalid ASIN format: ${asin}`);
  }

  const articlesDir = path.join(process.cwd(), 'content', 'articles');
  const filename = `${asin}.md`;
  const filePath = path.join(articlesDir, filename);

  await fs.writeFile(filePath, article.content);
  logger.info(`Article saved: ${filename}`);

  return filePath;
}

/**
 * CLI引数を解析する
 */
function parseArguments(): { skipCreatorsApi: boolean; targetFiles: string[] } {
  const args = process.argv.slice(2);
  const skipCreatorsApi = args.includes('--skip-creators-api') || args.includes('--skip-paapi');
  const targetFiles = args.filter((arg) => arg.endsWith('.json'));

  const asinIndex = args.indexOf('--asin');
  if (asinIndex !== -1 && asinIndex + 1 < args.length) {
    const asin = args[asinIndex + 1];
    if (asin && !asin.startsWith('-')) {
      const asinFile = path.join(process.cwd(), 'data', 'investigations', `${asin}.json`);
      targetFiles.push(asinFile);
      logger.info(`Targeting ASIN via flag: ${asin}`);
    }
  }

  return { skipCreatorsApi, targetFiles };
}

/**
 * GitHubPublisher を初期化する
 */
function initializePublisher(options: CLIOptions): GitHubPublisher | undefined {
  if (options.githubToken && options.githubRepository) {
    const [owner, repo] = options.githubRepository.split('/');
    return new GitHubPublisher({
      token: options.githubToken,
      owner: owner || '',
      repo: repo || '',
      branch: 'main',
    });
  }
  return undefined;
}

/**
 * Creators API クライアントとキャッシュを初期化・認証する
 */
function initializeCreatorsAPI(
  options: CLIOptions,
  skipCreatorsApi: boolean,
): { client: CreatorsAPIClient; cache: CreatorsAPICache; useApi: boolean } {
  const client = new CreatorsAPIClient();
  const cache = new CreatorsAPICache();
  const useApi =
    !skipCreatorsApi &&
    !!(options.applicationId && options.credentialId && options.credentialSecret && options.partnerTag);

  if (useApi) {
    try {
      client.authenticate(
        options.applicationId,
        options.credentialId,
        options.credentialSecret,
        options.partnerTag,
      );
      logger.info('Creators API client authenticated');
    } catch (error) {
      logger.error('Failed to authenticate Creators API client:', error);
      throw error;
    }
  }

  return { client, cache, useApi };
}

/**
 * 商品情報のバッチ取得を実行する
 */
/**
 * 調査結果から全ての ASIN を収集する
 */
function collectAsinsFromInvestigations(investigations: InvestigationData[]): Set<string> {
  const asins = new Set<string>();
  for (const data of investigations) {
    asins.add(data.product.asin);
    for (const comp of data.investigation.analysis.competitiveAnalysis) {
      if (comp.asin) asins.add(comp.asin);
    }
  }
  return asins;
}

/**
 * キャッシュの状態に基づいて ASIN をカテゴリ分けする
 */
function categorizeAsins(
  asins: Set<string>,
  cache: CreatorsAPICache,
): {
  missingAsins: string[];
  stats: { total: number; cacheHit: number; invalid: number; validMissing: number; retryPerm: number };
} {
  const asinsArray = Array.from(asins);
  const validMissing: string[] = [];
  const expiredPerm: string[] = [];
  const ignored: string[] = [];

  for (const asin of asinsArray) {
    if (cache.get(asin)) {
      ignored.push(asin);
    } else if (cache.isExpiredPermanentInvalid(asin)) {
      expiredPerm.push(asin);
    } else if (cache.isInvalid(asin)) {
      ignored.push(asin);
    } else {
      validMissing.push(asin);
    }
  }

  const PERMANENT_INVALID_RETRY_LIMIT = 100;
  const retries = expiredPerm.slice(0, PERMANENT_INVALID_RETRY_LIMIT);
  const missingAsins = [...validMissing, ...retries];
  const invalidCount = ignored.filter((asin) => cache.isInvalid(asin)).length;

  return {
    missingAsins,
    stats: {
      total: asinsArray.length,
      cacheHit: ignored.length - invalidCount,
      invalid: invalidCount,
      validMissing: validMissing.length,
      retryPerm: retries.length,
    },
  };
}

/**
 * 個別のバッチ結果をキャッシュに反映する
 */
async function handleBatchResults(
  cache: CreatorsAPICache,
  chunk: string[],
  results: Map<string, ProductDetail>,
  permanentFailures: Set<string>,
): Promise<void> {
  for (const [asin, detail] of results.entries()) {
    cache.set(asin, detail);
  }

  for (const asin of chunk) {
    if (!results.has(asin)) {
      if (permanentFailures.has(asin)) {
        logger.info(`Marking ASIN ${asin} as permanent_invalid (not found in Creators API)`);
        cache.markPermanentInvalid(asin);
      } else {
        logger.info(`Marking ASIN ${asin} as invalid (temporary failure)`);
        cache.markInvalid(asin);
      }
    }
  }
  await cache.save();
}

/**
 * チャンク単位で商品情報を取得する
 */
async function fetchAsinsInBatches(
  client: CreatorsAPIClient,
  cache: CreatorsAPICache,
  missingAsins: string[],
): Promise<void> {
  const chunkSize = 10;
  for (let i = 0; i < missingAsins.length; i += chunkSize) {
    const chunk = missingAsins.slice(i, i + chunkSize);
    try {
      logger.info(
        `Fetching batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(missingAsins.length / chunkSize)} (${chunk.length} items)...`,
      );
      const { results, permanentFailures } = await client.getMultipleProductDetails(chunk);

      await handleBatchResults(cache, chunk, results, permanentFailures);

      if (i + chunkSize < missingAsins.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.warn(`Failed to fetch batch starting with ${chunk[0]}:`, error);
    }
  }
}

/**
 * 商品情報のバッチ取得を実行する
 */
async function performBatchFetching(
  investigations: InvestigationData[],
  client: CreatorsAPIClient,
  cache: CreatorsAPICache,
): Promise<void> {
  const asins = collectAsinsFromInvestigations(investigations);
  const { missingAsins, stats } = categorizeAsins(asins, cache);

  logger.info(
    `ASINs stats: Total: ${stats.total}, Cache Hit: ${stats.cacheHit}, Known Invalid (Skipped): ${stats.invalid}, To Fetch: ${missingAsins.length} (New/Expired: ${stats.validMissing}, Retry Perm: ${stats.retryPerm})`,
  );

  if (missingAsins.length > 0) {
    await fetchAsinsInBatches(client, cache, missingAsins);
  }
}

/**
 * 記事の生成と公開を処理する
 */
async function processArticles(
  investigations: InvestigationData[],
  generator: ArticleGenerator,
  cache: CreatorsAPICache,
  publisher: GitHubPublisher | undefined,
  options: CLIOptions,
  skipApi: boolean,
  useApi: boolean,
): Promise<{ count: number; paths: string[] }> {
  let generatedCount = 0;
  const generatedArticles: string[] = [];
  const chunkSize = 10;

  for (let i = 0; i < investigations.length; i += chunkSize) {
    const chunk = investigations.slice(i, i + chunkSize);

    // Step 1: Generate articles in parallel
    const chunkResults = await Promise.all(
      chunk.map(async (data) => {
        try {
          const cachedProduct = cache.get(data.product.asin, { ignoreExpiration: true, allowInvalid: true });
          if (cachedProduct) {
            data.product = { ...data.product, ...cachedProduct };
            data.investigation.product = data.product;
            logger.info(`Used cached product data for ${data.product.asin}`);
          } else if (skipApi) {
            logger.info(`Using dummy data for ${data.product.asin} (skip-creators-api mode)`);
            data.product = {
              ...data.product,
              title: `商品調査中 (${data.product.asin})`,
              category: 'その他',
              price: { amount: 9999, currency: 'JPY', formatted: '¥9,999' },
              images: { primary: 'https://via.placeholder.com/500x500.png?text=No+Image', thumbnails: [] },
              specifications: {},
              rating: { average: 4, count: 100 },
            };
            data.investigation.product = data.product;
          } else if (useApi) {
            logger.warn(`Product data not found for ${data.product.asin}, proceeding with basic info`);
          }

          const competitorDetails = new Map<string, ProductDetail>();
          const competitorAsins = data.investigation.analysis.competitiveAnalysis
            .filter((c) => c.asin)
            .map((c) => c.asin!);

          if (competitorAsins.length > 0) {
            const cachedCompetitors = cache.getMultiple(competitorAsins, { ignoreExpiration: true, allowInvalid: true });
            for (const [asin, detail] of cachedCompetitors.entries()) {
              competitorDetails.set(asin, detail);
            }
          }

          logger.info(`Generating article for: ${data.product.title}`);
          const article = await generator.generateArticle(
            data.product,
            data.investigation,
            undefined,
            undefined,
            options.partnerTag,
            competitorDetails,
          );

          const articlePath = await saveArticle(article, data.product.asin);
          return { data, article, articlePath };
        } catch (error) {
          logger.error(`Failed to generate article for ${data.product.asin}:`, error);
          return null;
        }
      }),
    );

    // Step 2: Commit sequentially to avoid race conditions
    for (const result of chunkResults) {
      if (!result) continue;
      const { data, article, articlePath } = result;
      try {
        generatedArticles.push(articlePath);
        if (publisher) {
          await publisher.commitArticle(article.content, article.metadata);
          logger.info(`Article committed for ${data.product.asin}`);
        }
        generatedCount++;
        logger.info(`Article generated for ${data.product.asin}`);
      } catch (error) {
        logger.error(`Failed to commit article for ${data.product.asin}:`, error);
      }
    }
  }

  return { count: generatedCount, paths: generatedArticles };
}

/**
 * 生成サマリーを保存し、GitHub Actions 出力を設定する
 */
async function finalizeGeneration(
  totalInvestigations: number,
  generatedCount: number,
  generatedArticles: string[],
): Promise<void> {
  const summaryFile = path.join(process.cwd(), 'content', 'articles', 'generation-summary.json');
  await fs.writeFile(
    summaryFile,
    JSON.stringify(
      {
        totalInvestigations,
        generatedArticles: generatedCount,
        articlePaths: generatedArticles,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  await setGitHubOutput('articles-generated', generatedCount.toString());
  await setGitHubOutput('total-investigations', totalInvestigations.toString());
}

/**
 * 後処理（Frontmatter のサニタイズ等）を実行する
 */
async function runPostProcessing(): Promise<void> {
  try {
    logger.info('Running frontmatter sanitization...');
    const { stdout, stderr } = await execFileAsync('npm', ['run', 'sanitize:frontmatter']);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    logger.warn('Frontmatter sanitization failed:', error);
  }
}

export async function main(): Promise<void> {
  logger.info('Starting article generation CLI...');

  try {
    const options = getOptions();
    const { skipCreatorsApi, targetFiles } = parseArguments();

    if (skipCreatorsApi) {
      logger.info('--skip-creators-api flag detected, will skip Creators API calls and use cache only');
    }
    if (targetFiles.length > 0) {
      logger.info(`Targeting ${targetFiles.length} specific files.`);
    }

    await ensureOutputDirectories();

    const investigations = await loadInvestigationResults(targetFiles);
    if (investigations.length === 0) {
      logger.warn('No investigation results found');
      await setGitHubOutput('articles-generated', '0');
      process.exit(0);
    }

    logger.info(`Loaded ${investigations.length} investigation results`);

    const publisher = initializePublisher(options);
    const { client: creatorsClient, cache: creatorsCache, useApi: useCreatorsApi } = initializeCreatorsAPI(
      options,
      skipCreatorsApi,
    );

    if (useCreatorsApi) {
      await performBatchFetching(investigations, creatorsClient, creatorsCache);
    } else {
      logger.warn('Creators API credentials missing or skipped, skipping fetch for missing ASINs');
    }

    const generator = new ArticleGenerator();
    const { count: generatedCount, paths: generatedArticles } = await processArticles(
      investigations,
      generator,
      creatorsCache,
      publisher,
      options,
      skipCreatorsApi,
      useCreatorsApi,
    );

    await finalizeGeneration(investigations.length, generatedCount, generatedArticles);
    await runPostProcessing();

    logger.info(`Article generation completed: ${generatedCount}/${investigations.length} articles`);
    process.exit(0);
  } catch (error) {
    logger.error('Article generation failed:', error);
    await setGitHubOutput('articles-generated', '0');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
