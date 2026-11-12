import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import * as dotenv from 'dotenv';
import { GeminiDecisionClassifier } from '../../category/classifier/GeminiDecisionClassifier';
import type { ClassificationResult } from '../../category/classifier/types';
import {
  loadProductCategories,
  type ProductCategoryMap,
  saveProductCategories,
} from '../../category/store/ProductCategoryStore';

dotenv.config();

/**
 * CLI Tool for Product Classification with Gemini Decision 1
 * Supports rate control, concurrency, checkpoint resumption, dry-run, batch reporting,
 * and direct persistence to data/product-categories.json.
 */

interface RunOptions {
  sampleSize?: number | undefined;
  limit?: number | undefined;
  delayMs?: number | undefined;
  concurrency: number;
  dryRun: boolean;
  asin?: string | undefined;
  resume: boolean;
  force: boolean;
}

interface CheckpointData {
  updatedAt: string;
  processedAsins: string[];
}

interface ProductInputData {
  asin: string;
  title: string;
  brand: string;
  oldCat: string;
  specsSummary?: string | undefined;
  description?: string | undefined;
  articlePath?: string | undefined;
}

interface RawFrontmatter {
  title?: unknown;
  item_name?: unknown;
  brand?: unknown;
  manufacturer?: unknown;
  categories?: unknown;
  category?: unknown;
  specs?: Record<string, unknown> | null;
  description?: unknown;
  taxonomy_version?: number;
  category_parent?: string;
  category_child?: string;
  amazon_category?: string;
  classification?: Record<string, unknown>;
}

interface RawInvestigation {
  analysis?: {
    productName?: string;
    productDescription?: string;
  };
}

interface RawShardItem {
  data?: {
    title?: string;
    brand?: string;
    manufacturer?: string;
    category?: string;
    categoryInfo?: {
      main?: string;
    };
  };
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {
    concurrency: 1,
    dryRun: false,
    resume: true,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--sample' && args[i + 1]) {
      options.sampleSize = Number.parseInt(args[++i] || '0', 10);
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = Number.parseInt(args[++i] || '0', 10);
    } else if (arg === '--delay' && args[i + 1]) {
      options.delayMs = Number.parseInt(args[++i] || '0', 10);
    } else if (arg === '--concurrency' && args[i + 1]) {
      options.concurrency = Math.max(1, Number.parseInt(args[++i] || '1', 10));
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--asin' && args[i + 1]) {
      options.asin = args[++i];
    } else if (arg === '--no-resume') {
      options.resume = false;
    } else if (arg === '--force') {
      options.force = true;
    }
  }

  return options;
}

function loadCheckpoint(checkpointPath: string): CheckpointData {
  if (fs.existsSync(checkpointPath)) {
    try {
      const raw = fs.readFileSync(checkpointPath, 'utf8');
      return JSON.parse(raw) as CheckpointData;
    } catch {
      // ignore
    }
  }
  return { updatedAt: new Date().toISOString(), processedAsins: [] };
}

function saveCheckpoint(checkpointPath: string, processedSet: Set<string>): void {
  const dir = path.dirname(checkpointPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const data: CheckpointData = {
    updatedAt: new Date().toISOString(),
    processedAsins: Array.from(processedSet),
  };
  fs.writeFileSync(checkpointPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function ensureString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return fallback;
}

function extractFromArticle(articlePath: string, asin: string): ProductInputData | undefined {
  try {
    const content = fs.readFileSync(articlePath, 'utf8');
    const parsed = matter(content);
    const data = parsed.data as RawFrontmatter;

    const title = ensureString(data.title) || ensureString(data.item_name) || asin;
    const brand = ensureString(data.brand) || ensureString(data.manufacturer);
    const oldCat =
      Array.isArray(data.categories) && data.categories.length > 0
        ? ensureString(data.categories[0])
        : ensureString(data.category);

    let specsSummary = '';
    if (data.specs && typeof data.specs === 'object') {
      specsSummary = Object.entries(data.specs)
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(', ');
    }

    return {
      asin,
      title,
      brand,
      oldCat,
      specsSummary: specsSummary || undefined,
      description: typeof data.description === 'string' ? data.description.slice(0, 200) : undefined,
      articlePath,
    };
  } catch (err) {
    console.warn(`[WARN] Failed to parse article for ${asin}:`, err);
    return undefined;
  }
}

function extractFromCache(asin: string): ProductInputData | undefined {
  const invPath = path.resolve(process.cwd(), `data/investigations/${asin}.json`);
  let invTitle = '';
  let invDesc = '';
  if (fs.existsSync(invPath)) {
    try {
      const invRaw = JSON.parse(fs.readFileSync(invPath, 'utf8')) as RawInvestigation;
      invTitle = invRaw.analysis?.productName || '';
      invDesc = invRaw.analysis?.productDescription || '';
    } catch {
      // ignore
    }
  }

  let cacheTitle = '';
  let cacheBrand = '';
  let cacheCategory = '';
  const shard = asin.slice(-2);
  const cachePath = path.resolve(process.cwd(), `data/cache/paapi/${shard}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const shardData = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, RawShardItem>;
      const cached = shardData[asin]?.data;
      if (cached) {
        cacheTitle = cached.title || '';
        cacheBrand = cached.brand || cached.manufacturer || '';
        cacheCategory = cached.categoryInfo?.main || cached.category || '';
      }
    } catch {
      // ignore
    }
  }

  const finalTitle = invTitle || cacheTitle || asin;
  if (!finalTitle && !cacheCategory) {
    return undefined;
  }

  return {
    asin,
    title: finalTitle,
    brand: cacheBrand,
    oldCat: cacheCategory,
    description: invDesc ? invDesc.slice(0, 200) : undefined,
  };
}

/**
 * Loads product details from article file, or fallback to investigation file + PA-API cache.
 */
function loadProductInput(asin: string, articlesDir: string): ProductInputData | undefined {
  const articlePath = path.join(articlesDir, `${asin}.md`);
  if (fs.existsSync(articlePath)) {
    const input = extractFromArticle(articlePath, asin);
    if (input) return input;
  }
  return extractFromCache(asin);
}

function updateArticleFrontmatter(articlePath: string, res: ClassificationResult, oldCat: string): void {
  try {
    const rawArticle = fs.readFileSync(articlePath, 'utf8');
    const parsed = matter(rawArticle);
    const data = parsed.data as RawFrontmatter;
    data.taxonomy_version = 2;
    data.category_parent = res.parentSlug;
    data.category_child = res.childSlug;
    const fallbackCategory =
      Array.isArray(data.categories) && data.categories.length > 0
        ? ensureString(data.categories[0])
        : ensureString(data.category);
    data.amazon_category = oldCat || fallbackCategory;
    data.classification = {
      source: res.source,
      parent_confidence: res.parentConfidence,
      child_confidence: res.childConfidence,
      classified_at: res.classifiedAt,
      input_hash: res.inputHash,
      needs_review: res.needsReview,
      ...(res.parentRunnerUp ? { parent_runner_up: res.parentRunnerUp } : {}),
      ...(res.childRunnerUp ? { child_runner_up: res.childRunnerUp } : {}),
    };
    fs.writeFileSync(articlePath, matter.stringify(parsed.content, data), 'utf8');
  } catch (err) {
    console.warn(`[WARN] 記事ファイルの更新に失敗しました (${articlePath}):`, err);
  }
}

function collectTargetAsins(
  options: RunOptions,
  articlesDir: string,
  investigationsDir: string,
  categoryStore: ProductCategoryMap,
  processedSet: Set<string>,
): { allAsins: string[]; asinsToProcess: string[] } {
  const allAsinsSet = new Set<string>();

  if (options.asin) {
    allAsinsSet.add(options.asin);
  } else {
    if (fs.existsSync(investigationsDir)) {
      for (const f of fs.readdirSync(investigationsDir)) {
        if (f.endsWith('.json')) allAsinsSet.add(path.basename(f, '.json'));
      }
    }
    if (fs.existsSync(articlesDir)) {
      for (const f of fs.readdirSync(articlesDir)) {
        if (f.endsWith('.md')) allAsinsSet.add(path.basename(f, '.md'));
      }
    }
  }

  const allAsins = Array.from(allAsinsSet).sort();
  let toProcess = allAsins;

  if (!options.force) {
    toProcess = allAsins.filter((asin) => {
      const stored = categoryStore[asin];
      if (stored && stored.taxonomy_version === 2) return false;
      if (options.resume && processedSet.has(asin)) return false;
      return true;
    });
  }

  if (options.sampleSize && options.sampleSize < toProcess.length) {
    const step = Math.max(1, Math.floor(toProcess.length / options.sampleSize));
    const sampled: string[] = [];
    for (let i = 0; i < toProcess.length && sampled.length < options.sampleSize; i += step) {
      const a = toProcess[i];
      if (a) sampled.push(a);
    }
    toProcess = sampled;
  }

  if (options.limit && options.limit < toProcess.length) {
    toProcess = toProcess.slice(0, options.limit);
  }

  return { allAsins, asinsToProcess: toProcess };
}

async function run(): Promise<void> {
  const options = parseArgs();
  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const investigationsDir = path.resolve(process.cwd(), 'data/investigations');
  const checkpointPath = path.resolve(process.cwd(), 'tmp/classification-checkpoint.json');
  const reportPath = path.resolve(process.cwd(), 'tmp/classification-report.json');

  const categoryStore = loadProductCategories();

  console.log('\n======================================================');
  console.log(' Gemini Decision 1 商品カテゴリ分類・永続化 CLI');
  console.log('======================================================');
  console.log(
    `モード: ${options.dryRun ? 'DRY-RUN (保存されません)' : 'APPLY (data/product-categories.json を更新します)'}`,
  );
  console.log(`並行数: ${options.concurrency} | インターバル: ${options.delayMs || 0}ms`);
  console.log(`現在の登録済み分類件数: ${Object.keys(categoryStore).length} 件`);
  console.log('------------------------------------------------------\n');

  const checkpoint = options.resume ? loadCheckpoint(checkpointPath) : { updatedAt: '', processedAsins: [] };
  const processedSet = new Set<string>(checkpoint.processedAsins);

  const { allAsins, asinsToProcess } = collectTargetAsins(
    options,
    articlesDir,
    investigationsDir,
    categoryStore,
    processedSet,
  );

  console.log(
    `全商品: ${allAsins.length} 件 | 今回処理対象: ${asinsToProcess.length} 件 (既登録スキップ: ${allAsins.length - asinsToProcess.length} 件)\n`,
  );

  if (asinsToProcess.length === 0) {
    console.log('すべての対象商品が既に分類・登録済みです。\n');
    return;
  }

  const classifier = new GeminiDecisionClassifier();
  const results: Array<{
    asin: string;
    title: string;
    oldCat: string;
    classification: ClassificationResult;
    durationMs: number;
  }> = [];

  const startTime = Date.now();
  let completedCount = 0;
  const totalCount = asinsToProcess.length;
  let queueIndex = 0;

  async function worker(): Promise<void> {
    while (queueIndex < asinsToProcess.length) {
      const currentIndex = queueIndex++;
      const asin = asinsToProcess[currentIndex];
      if (!asin) break;

      const input = loadProductInput(asin, articlesDir);
      if (!input) {
        console.warn(`[WARN] ASIN ${asin} の商品データが取得できないためスキップします`);
        continue;
      }

      const itemStartTime = Date.now();
      try {
        const res = await classifier.classify(
          {
            title: input.title,
            brand: input.brand,
            specsSummary: input.specsSummary,
            description: input.description,
          },
          input.oldCat,
        );

        const durationMs = Date.now() - itemStartTime;
        results.push({ asin, title: input.title, oldCat: input.oldCat, classification: res, durationMs });
        processedSet.add(asin);
        completedCount++;

        const reviewMark = res.needsReview ? '⚠️ [要確認]' : '✅';
        const sourceTag = res.source === 'fallback-map' ? '[FB]' : '';
        console.log(
          `[${completedCount}/${totalCount}] ${asin} | ${reviewMark} ${sourceTag} ${res.parentSlug} › ${res.childSlug} | 親: ${(res.parentConfidence * 100).toFixed(0)}% 子: ${(res.childConfidence * 100).toFixed(0)}% (${durationMs}ms)`,
        );

        if (!options.dryRun) {
          categoryStore[asin] = {
            taxonomy_version: 2,
            category_parent: res.parentSlug,
            category_child: res.childSlug,
            amazon_category: input.oldCat || undefined,
            classification: {
              source: res.source,
              parent_confidence: res.parentConfidence,
              child_confidence: res.childConfidence,
              classified_at: res.classifiedAt,
              input_hash: res.inputHash,
              needs_review: res.needsReview,
              ...(res.parentRunnerUp ? { parent_runner_up: res.parentRunnerUp } : {}),
              ...(res.childRunnerUp ? { child_runner_up: res.childRunnerUp } : {}),
            },
          };

          if (input.articlePath && fs.existsSync(input.articlePath)) {
            updateArticleFrontmatter(input.articlePath, res, input.oldCat);
          }
        }

        if (completedCount % 20 === 0) {
          saveCheckpoint(checkpointPath, processedSet);
          if (!options.dryRun) {
            saveProductCategories(categoryStore);
          }
        }

        if (options.delayMs && options.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
      } catch (err) {
        console.error(`[${completedCount}/${totalCount}] ${asin} でエラー:`, err instanceof Error ? err.message : err);
      }
    }
  }

  const workerPromises = Array.from({ length: options.concurrency }, () => worker());
  await Promise.all(workerPromises);

  saveCheckpoint(checkpointPath, processedSet);
  if (!options.dryRun) {
    saveProductCategories(categoryStore);
    console.log(
      `\n[SAVE] data/product-categories.json を更新・保存しました (総件数: ${Object.keys(categoryStore).length})`,
    );
  }

  const totalDuration = Date.now() - startTime;
  const avgMs = results.length > 0 ? (totalDuration / results.length).toFixed(0) : '0';
  const reviewCount = results.filter((r) => r.classification.needsReview).length;
  const othersCount = results.filter(
    (r) => r.classification.parentSlug === 'others' || r.classification.childSlug.startsWith('zz-'),
  ).length;

  console.log('\n======================================================');
  console.log(' 処理完了集計レポート');
  console.log('======================================================');
  console.log(
    `処理数: ${results.length} 件 (総所要時間: ${(totalDuration / 1000).toFixed(1)} 秒 / 平均: ${avgMs} ms/件)`,
  );
  if (results.length > 0) {
    const avgParentConf =
      (results.reduce((acc, r) => acc + r.classification.parentConfidence, 0) / results.length) * 100;
    const avgChildConf = (results.reduce((acc, r) => acc + r.classification.childConfidence, 0) / results.length) * 100;
    console.log(`平均 親確信度: ${avgParentConf.toFixed(1)}% | 平均 子確信度: ${avgChildConf.toFixed(1)}%`);
    console.log(
      `自動確定率: ${(((results.length - reviewCount) / results.length) * 100).toFixed(1)}% (${results.length - reviewCount} 件)`,
    );
    console.log(`要確認率: ${((reviewCount / results.length) * 100).toFixed(1)}% (${reviewCount} 件)`);
    console.log(`「その他」滞留率: ${((othersCount / results.length) * 100).toFixed(1)}% (${othersCount} 件)`);
  }

  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({ total: results.length, needsReview: reviewCount, othersCount }, null, 2)}\n`,
    'utf8',
  );
  console.log(`レポートを保存しました: ${reportPath}\n`);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[FATAL ERROR]:', err);
    process.exit(1);
  });
}
