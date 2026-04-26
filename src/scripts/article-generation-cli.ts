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
  // Validate ASIN format to prevent path traversal
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

export async function main(): Promise<void> {
  logger.info('Starting article generation CLI...');

  try {
    const options = getOptions();
    logger.info(`Partner tag: ${options.partnerTag || '(not set)'}`);

    // Parse arguments
    const args = process.argv.slice(2);
    const skipCreatorsApi = args.includes('--skip-creators-api') || args.includes('--skip-paapi');
    const targetFiles = args.filter((arg) => arg.endsWith('.json'));

    // Handle --asin flag
    const asinIndex = args.indexOf('--asin');
    if (asinIndex !== -1 && asinIndex + 1 < args.length) {
      const asin = args[asinIndex + 1];
      if (asin && !asin.startsWith('-')) {
        const asinFile = path.join(process.cwd(), 'data', 'investigations', `${asin}.json`);
        targetFiles.push(asinFile);
        logger.info(`Targeting ASIN via flag: ${asin}`);
      }
    }

    if (skipCreatorsApi) {
      logger.info('--skip-creators-api flag detected, will skip Creators API calls and use cache only');
    }
    if (targetFiles.length > 0) {
      logger.info(`Targeting ${targetFiles.length} specific files.`);
    }

    await ensureOutputDirectories();

    // 調査結果を読み込み
    const investigations = await loadInvestigationResults(targetFiles);
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

    // Initialize Creators API Client & Cache
    const creatorsClient = new CreatorsAPIClient();
    const creatorsCache = new CreatorsAPICache();
    const useCreatorsApi =
      !skipCreatorsApi &&
      options.applicationId &&
      options.credentialId &&
      options.credentialSecret &&
      options.partnerTag;

    if (useCreatorsApi) {
      try {
        creatorsClient.authenticate(
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

    // Split ASINs into categories for better control
    const validMissingAsins: string[] = [];
    const expiredPermanentInvalidAsins: string[] = [];
    const ignoredAsins: string[] = []; // Valid (cached) or Invalid (not expired)

    for (const asin of asinsArray) {
      if (creatorsCache.get(asin)) {
        // Valid cache hit
        ignoredAsins.push(asin);
        continue;
      }

      if (creatorsCache.isExpiredPermanentInvalid(asin)) {
        // Permanent invalid but expired - candidate for retry
        expiredPermanentInvalidAsins.push(asin);
        continue;
      }

      if (creatorsCache.isInvalid(asin)) {
        // Invalid but NOT expired (standard invalid or permanent invalid within TTL)
        ignoredAsins.push(asin);
        continue;
      }

      // Normal missing (never fetched or expired valid/invalid)
      validMissingAsins.push(asin);
    }

    // Limit the number of expired permanent invalid ASINs to retry
    // This prevents the job from timing out if there are thousands of permanent invalid items
    const PERMANENT_INVALID_RETRY_LIMIT = 100;
    let asinsToFetch = [...validMissingAsins];

    if (expiredPermanentInvalidAsins.length > 0) {
      logger.info(
        `Found ${expiredPermanentInvalidAsins.length} expired permanent_invalid ASINs. Limiting retry to ${PERMANENT_INVALID_RETRY_LIMIT}.`,
      );

      // Take the first N
      const retries = expiredPermanentInvalidAsins.slice(0, PERMANENT_INVALID_RETRY_LIMIT);
      asinsToFetch = asinsToFetch.concat(retries);

      if (expiredPermanentInvalidAsins.length > PERMANENT_INVALID_RETRY_LIMIT) {
        logger.info(
          `Skipping ${expiredPermanentInvalidAsins.length - PERMANENT_INVALID_RETRY_LIMIT} expired permanent_invalid ASINs in this run.`,
        );
      }
    }

    const missingAsins = asinsToFetch;
    // invalidAsins for stats (approximate, excluding the ones we decided to fetch)
    const invalidAsins = ignoredAsins.filter(
      (asin) =>
        creatorsCache.isInvalid(asin) &&
        !expiredPermanentInvalidAsins.slice(0, PERMANENT_INVALID_RETRY_LIMIT).includes(asin),
    );

    logger.info(
      `ASINs stats: Total: ${asinsArray.length}, Cache Hit: ${ignoredAsins.length - invalidAsins.length}, Known Invalid (Skipped): ${invalidAsins.length}, To Fetch: ${missingAsins.length} (New/Expired: ${validMissingAsins.length}, Retry Perm: ${Math.min(expiredPermanentInvalidAsins.length, PERMANENT_INVALID_RETRY_LIMIT)})`,
    );

    // 3. Fetch missing ASINs in batches if Creators API is enabled
    if (useCreatorsApi && missingAsins.length > 0) {
      // Process in chunks of 10
      const chunkSize = 10;
      for (let i = 0; i < missingAsins.length; i += chunkSize) {
        const chunk = missingAsins.slice(i, i + chunkSize);
        try {
          logger.info(
            `Fetching batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(missingAsins.length / chunkSize)} (${chunk.length} items)...`,
          );
          const { results, permanentFailures } = await creatorsClient.getMultipleProductDetails(chunk);

          // Update cache for found items
          for (const [asin, detail] of results.entries()) {
            creatorsCache.set(asin, detail);
          }

          // Identify ASINs that were requested but NOT returned
          for (const asin of chunk) {
            if (!results.has(asin)) {
              if (permanentFailures.has(asin)) {
                logger.info(`Marking ASIN ${asin} as permanent_invalid (not found in Creators API)`);
                creatorsCache.markPermanentInvalid(asin);
              } else {
                logger.info(`Marking ASIN ${asin} as invalid (temporary failure)`);
                creatorsCache.markInvalid(asin);
              }
            }
          }

          // Save incrementally to prevent data loss on crash
          await creatorsCache.save();

          // Respect rate limits - wait a bit between batches if needed
          if (i + chunkSize < missingAsins.length) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (error) {
          logger.warn(`Failed to fetch batch starting with ${chunk[0]}:`, error);
          // On batch error (e.g. network), we DO NOT mark as invalid, we just skip
        }
      }
    } else if (!useCreatorsApi && missingAsins.length > 0) {
      logger.warn('Creators API credentials missing, skipping fetch for missing ASINs');
    }
    // --- BATCH FETCHING STRATEGY END ---

    // 各調査結果から記事を生成
    let generatedCount = 0;
    const generatedArticles: string[] = [];

    // 並列処理のためのチャンク分割 (サイズ: 10)
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < investigations.length; i += chunkSize) {
      chunks.push(investigations.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      // Step 1: Generate articles in parallel
      const chunkResults = await Promise.all(
        chunk.map(async (data) => {
          try {
            logger.info(`Processing article for: ${data.product.asin}`);

            // Get fresh product data from Cache (fallback to expired if fetch failed, or invalid if exists)
            const cachedProduct = creatorsCache.get(data.product.asin, {
              ignoreExpiration: true,
              allowInvalid: true,
            });

            if (cachedProduct) {
              // Merge live data into the product object
              data.product = {
                ...data.product,
                ...cachedProduct,
              };
              data.investigation.product = data.product;
              logger.info(`Used cached product data for ${data.product.asin}`);
            } else if (skipCreatorsApi) {
              // Skip Creators API mode: Insert dummy data for Hugo build validation
              logger.info(`Using dummy data for ${data.product.asin} (skip-creators-api mode)`);
              data.product = {
                ...data.product,
                title: `商品調査中 (${data.product.asin})`,
                category: 'その他',
                price: { amount: 9999, currency: 'JPY', formatted: '¥9,999' },
                images: {
                  primary: 'https://via.placeholder.com/500x500.png?text=No+Image',
                  thumbnails: [],
                },
                specifications: {},
                rating: { average: 4.0, count: 100 },
              };
              data.investigation.product = data.product;
            } else if (useCreatorsApi) {
              // Only warn if we sought it but failed to get it
              logger.warn(`Product data not found for ${data.product.asin}, proceeding with basic info`);
            }

            // Get competitor details from Cache
            const competitorDetails = new Map<string, ProductDetail>();
            const competitorAsins = data.investigation.analysis.competitiveAnalysis
              .filter((c) => c.asin)
              .map((c) => c.asin!);

            if (competitorAsins.length > 0) {
              const cachedCompetitors = creatorsCache.getMultiple(competitorAsins, {
                ignoreExpiration: true,
                allowInvalid: true,
              });
              for (const [asin, detail] of cachedCompetitors.entries()) {
                competitorDetails.set(asin, detail);
              }
              logger.info(
                `Retrieved ${competitorDetails.size}/${competitorAsins.length} competitor details from cache`,
              );
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

          // GitHub Publisher でコミット（利用可能な場合）
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

    // サマリー保存
    const summaryFile = path.join(process.cwd(), 'content', 'articles', 'generation-summary.json');
    await fs.writeFile(
      summaryFile,
      JSON.stringify(
        {
          totalInvestigations: investigations.length,
          generatedArticles: generatedCount,
          articlePaths: generatedArticles,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    // GitHub Actions 出力を設定
    await setGitHubOutput('articles-generated', generatedCount.toString());
    await setGitHubOutput('total-investigations', investigations.length.toString());

    // Sanitize Frontmatter
    try {
      logger.info('Running frontmatter sanitization...');
      const { stdout, stderr } = await execFileAsync('npm', ['run', 'sanitize:frontmatter']);
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
    } catch (error) {
      logger.warn('Frontmatter sanitization failed:', error);
      // Don't fail the build, just warn
    }

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
