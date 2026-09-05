#!/usr/bin/env ts-node
/**
 * prune-dead-products.ts
 *
 * Amazon上で商品ページが削除された（404 Not Found）商品を検出し、
 * 記事・調査データ・キャッシュの棚卸し（削除）を行うスクリプト。
 *
 * 使用例:
 *   # 1. 高速監査（permanent_invalid かつ記事が存在するものをチェック）
 *   pnpm ts-node scripts/prune-dead-products.ts
 *   pnpm ts-node scripts/prune-dead-products.ts --audit
 *
 *   # 2. 単一ASINの確認
 *   pnpm ts-node scripts/prune-dead-products.ts --asin B0H3HQ1ZG7
 *
 *   # 3. 全記事を監査（全5,700+件）
 *   pnpm ts-node scripts/prune-dead-products.ts --scope all --audit
 *
 *   # 4. ドライラン（削除対象の確認）
 *   pnpm ts-node scripts/prune-dead-products.ts --prune --dry-run
 *
 *   # 5. 棚卸し（削除）実行
 *   pnpm ts-node scripts/prune-dead-products.ts --prune
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { enhanceCategories } from '../src/scripts/enhance-categories';

export interface CheckResult {
  asin: string;
  isDead: boolean;
  statusCode: number;
  title: string | undefined;
  hasArticle: boolean;
  hasInvestigation: boolean;
  inCache: boolean;
  cacheStatus: string | undefined;
  error: string | undefined;
}

export interface CompetitorReference {
  investigationPath: string;
  sourceAsin: string;
  referencedDeadAsins: { asin: string; name: string }[];
}

export interface OrphanFilesResult {
  articlesWithoutInvest: string[];
  investsWithoutArticle: string[];
}

export interface CliOptions {
  mode: 'audit' | 'prune';
  scope: 'perm-invalid' | 'all' | 'single';
  singleAsin: string | undefined;
  dryRun: boolean;
  concurrency: number;
  delayMs: number;
  skipPrebuild: boolean;
  checkReferences: boolean;
  cleanReferences: boolean;
  checkOrphans: boolean;
}

export const ROOT_DIR = path.resolve(__dirname, '..');
export const ARTICLES_DIR = path.join(ROOT_DIR, 'content/articles');
export const INVESTIGATIONS_DIR = path.join(ROOT_DIR, 'data/investigations');
export const CACHE_PATH = path.join(ROOT_DIR, 'data/cache/paapi-product-cache.json');
const TITLE_REGEX = /<title>([^<]*)<\/title>/i;

// コマンドライン引数のパース
export function parseArgs(customArgs?: string[]): CliOptions {
  const args = customArgs || process.argv.slice(2);
  const options: CliOptions = {
    mode: 'audit',
    scope: 'perm-invalid',
    singleAsin: undefined,
    dryRun: false,
    concurrency: 3,
    delayMs: 300,
    skipPrebuild: false,
    checkReferences: true,
    cleanReferences: true,
    checkOrphans: true,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i++];
    switch (arg) {
      case '--prune':
      case '--delete':
        options.mode = 'prune';
        break;
      case '--audit':
        options.mode = 'audit';
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--scope': {
        const val = args[i++];
        if (val === 'all' || val === 'perm-invalid') {
          options.scope = val;
        }
        break;
      }
      case '--asin':
        options.scope = 'single';
        options.singleAsin = args[i++];
        break;
      case '--concurrency':
        options.concurrency = Number.parseInt(args[i++] || '3', 10) || 3;
        break;
      case '--delay':
        options.delayMs = Number.parseInt(args[i++] || '300', 10) || 300;
        break;
      case '--skip-prebuild':
        options.skipPrebuild = true;
        break;
      case '--skip-references':
        options.checkReferences = false;
        options.cleanReferences = false;
        break;
      case '--no-clean-references':
        options.cleanReferences = false;
        break;
      case '--skip-orphans':
        options.checkOrphans = false;
        break;
    }
  }

  return options;
}

// キャッシュデータの読み込み
function loadCache(): Record<string, any> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// 対象ASINの収集
function collectTargetAsins(options: CliOptions, cache: Record<string, any>): string[] {
  if (options.scope === 'single' && options.singleAsin) {
    return [options.singleAsin];
  }

  const articleAsins = fs.existsSync(ARTICLES_DIR)
    ? fs
        .readdirSync(ARTICLES_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace('.md', ''))
    : [];

  if (options.scope === 'all') {
    return articleAsins;
  }

  // perm-invalid (デフォルト): キャッシュが permanent_invalid かつ記事が存在するもの
  return Object.keys(cache).filter(
    (asin) => cache[asin]?.status === 'permanent_invalid' && articleAsins.includes(asin),
  );
}

// Amazon HTTP 404 チェック
function checkAmazonUrl(
  asin: string,
): Promise<{ statusCode: number; isDead: boolean; title: string | undefined; error: string | undefined }> {
  return new Promise((resolve) => {
    let isResolved = false;
    const safeResolve = (val: { statusCode: number; isDead: boolean; title: string | undefined; error: string | undefined }) => {
      if (!isResolved) {
        isResolved = true;
        resolve(val);
      }
    };

    const url = `https://www.amazon.co.jp/dp/${asin}`;
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          const titleMatch = TITLE_REGEX.exec(body);
          const title = titleMatch?.[1]?.trim();

          // 404判定基準:
          // 1. ステータスコードが404
          // 2. タイトルまたは本文に「ページが見つかりません」「ご指定のページが見つかりませんでした」
          const is404 =
            res.statusCode === 404 ||
            Boolean(title?.includes('ページが見つかりません')) ||
            body.includes('ご指定のページが見つかりませんでした') ||
            body.includes('お探しのページが見つかりませんでした');

          safeResolve({
            statusCode: res.statusCode || 200,
            isDead: is404,
            title,
            error: undefined,
          });
        });
      },
    );

    req.on('error', (err) => {
      safeResolve({
        statusCode: -1,
        isDead: false,
        title: undefined,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      safeResolve({
        statusCode: -1,
        isDead: false,
        title: undefined,
        error: 'timeout',
      });
    });
  });
}

// チャンクごとに並列実行
async function checkAsinsInBatches(
  asins: string[],
  concurrency: number,
  delayMs: number,
  cache: Record<string, any>,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const total = asins.length;

  for (let i = 0; i < total; i += concurrency) {
    const chunk = asins.slice(i, i + concurrency);
    const chunkPromises = chunk.map(async (asin) => {
      const check = await checkAmazonUrl(asin);
      const articlePath = path.join(ARTICLES_DIR, `${asin}.md`);
      const investPath = path.join(INVESTIGATIONS_DIR, `${asin}.json`);

      const originalTitle = cache[asin]?.data?.title;
      const displayTitle = check.isDead
        ? (originalTitle || check.title || undefined)
        : (check.title || originalTitle || undefined);

      return {
        asin,
        isDead: check.isDead,
        statusCode: check.statusCode,
        title: displayTitle,
        hasArticle: fs.existsSync(articlePath),
        hasInvestigation: fs.existsSync(investPath),
        inCache: Boolean(cache[asin]),
        cacheStatus: cache[asin]?.status || undefined,
        error: check.error,
      };
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    process.stdout.write(`\rProgress: ${Math.min(i + concurrency, total)} / ${total}`);
    if (i + concurrency < total && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  process.stdout.write('\n');

  return results;
}

// ファイル削除ヘルパー
function deleteFileIfExists(filePath: string, dryRun: boolean): boolean {
  if (!fs.existsSync(filePath)) return false;
  if (!dryRun) {
    fs.unlinkSync(filePath);
  }
  return true;
}

// キャッシュファイル保存ヘルパー
function saveCache(cache: Record<string, any>): void {
  const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
  const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
  const jsonContent = `{\n${lines.join(',\n')}\n}`;
  fs.writeFileSync(CACHE_PATH, jsonContent, 'utf8');
}

// 1商品分の棚卸し処理
function pruneSingleItem(
  item: CheckResult,
  dryRun: boolean,
  cache: Record<string, any>,
): { articleDeleted: boolean; investDeleted: boolean; cacheDeleted: boolean } {
  const articlePath = path.join(ARTICLES_DIR, `${item.asin}.md`);
  const investPath = path.join(INVESTIGATIONS_DIR, `${item.asin}.json`);

  const articleDeleted = deleteFileIfExists(articlePath, dryRun);
  if (articleDeleted) {
    console.log(`[Deleted Article] ${item.asin}.md (${item.title || 'No title'})`);
  }

  const investDeleted = deleteFileIfExists(investPath, dryRun);
  if (investDeleted) {
    console.log(`[Deleted Investigation] ${item.asin}.json`);
  }

  let cacheDeleted = false;
  if (cache[item.asin]) {
    if (!dryRun) {
      delete cache[item.asin];
    }
    cacheDeleted = true;
  }

  return { articleDeleted, investDeleted, cacheDeleted };
}

// 単一調査ファイルからの競合参照抽出ヘルパー
function extractFileReferences(
  filePath: string,
  file: string,
  deadAsinSet: Set<string>,
): CompetitorReference | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasTarget = Array.from(deadAsinSet).some((asin) => content.includes(asin));
    if (!hasTarget) return null;

    const data = JSON.parse(content);
    const competitors = data.analysis?.competitiveAnalysis;
    if (!Array.isArray(competitors)) return null;

    const matched = competitors
      .filter((comp: any) => comp?.asin && deadAsinSet.has(comp.asin))
      .map((comp: any) => ({ asin: comp.asin, name: comp.name || '名称不明' }));

    if (matched.length === 0) return null;

    return {
      investigationPath: filePath,
      sourceAsin: file.replace('.json', ''),
      referencedDeadAsins: matched,
    };
  } catch {
    return null;
  }
}

// 競合データ内の参照検出
export function findCompetitorReferences(
  deadAsins: string[],
  investigationsDir: string = INVESTIGATIONS_DIR,
): CompetitorReference[] {
  if (deadAsins.length === 0 || !fs.existsSync(investigationsDir)) return [];

  const deadAsinSet = new Set(deadAsins);
  const files = fs.readdirSync(investigationsDir).filter((f) => f.endsWith('.json'));
  const references: CompetitorReference[] = [];

  for (const file of files) {
    const filePath = path.join(investigationsDir, file);
    const ref = extractFileReferences(filePath, file, deadAsinSet);
    if (ref) {
      references.push(ref);
    }
  }

  return references;
}

// 競合データ内の参照クリーンアップ
export function cleanCompetitorReferences(
  references: CompetitorReference[],
  dryRun: boolean,
): { modifiedFilesCount: number; removedEntriesCount: number } {
  let modifiedFilesCount = 0;
  let removedEntriesCount = 0;

  for (const ref of references) {
    try {
      const content = fs.readFileSync(ref.investigationPath, 'utf8');
      const data = JSON.parse(content);
      const competitors = data.analysis?.competitiveAnalysis;
      if (!Array.isArray(competitors)) continue;

      const deadAsinSet = new Set(ref.referencedDeadAsins.map((r) => r.asin));
      const beforeCount = competitors.length;
      data.analysis.competitiveAnalysis = competitors.filter(
        (comp: any) => !comp?.asin || !deadAsinSet.has(comp.asin),
      );
      const removed = beforeCount - data.analysis.competitiveAnalysis.length;

      if (removed > 0) {
        if (!dryRun) {
          fs.writeFileSync(ref.investigationPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        }
        modifiedFilesCount++;
        removedEntriesCount += removed;
        const details = ref.referencedDeadAsins.map((r) => `${r.asin}(${r.name})`).join(', ');
        console.log(
          `  ${dryRun ? '[DRY RUN] ' : ''}[Cleaned Competitor Ref] ${ref.sourceAsin}.json から競合参照を削除: ${details}`,
        );
      }
    } catch (err) {
      console.error(`  [Error] 競合参照の更新に失敗しました: ${ref.investigationPath}`, err);
    }
  }

  return { modifiedFilesCount, removedEntriesCount };
}

// 孤立ファイル（記事のみ／調査データのみ）の検出
export function findOrphanedFiles(
  articlesDir: string = ARTICLES_DIR,
  investigationsDir: string = INVESTIGATIONS_DIR,
): OrphanFilesResult {
  const articles = fs.existsSync(articlesDir)
    ? new Set(fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', '')))
    : new Set<string>();

  const investigations = fs.existsSync(investigationsDir)
    ? new Set(fs.readdirSync(investigationsDir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')))
    : new Set<string>();

  const articlesWithoutInvest: string[] = [];
  for (const asin of articles) {
    if (!investigations.has(asin)) {
      articlesWithoutInvest.push(asin);
    }
  }

  const investsWithoutArticle: string[] = [];
  for (const asin of investigations) {
    if (!articles.has(asin)) {
      investsWithoutArticle.push(asin);
    }
  }

  return { articlesWithoutInvest, investsWithoutArticle };
}

// 参照整合性クリーンアップの実行ヘルパー
function performCompetitorCleanup(
  deadItems: CheckResult[],
  dryRun: boolean,
): { cleanedFiles: number; cleanedEntries: number } {
  if (deadItems.length === 0) {
    return { cleanedFiles: 0, cleanedEntries: 0 };
  }
  console.log('\n--- 参照整合性のクリーンアップ ---');
  const deadAsins = deadItems.map((d) => d.asin);
  const references = findCompetitorReferences(deadAsins);
  if (references.length === 0) {
    console.log('他商品の競合データ内への参照は見つかりませんでした。');
    return { cleanedFiles: 0, cleanedEntries: 0 };
  }
  console.log(`他商品の競合データ内で検出された参照: ${references.length} 件`);
  const cleanResult = cleanCompetitorReferences(references, dryRun);
  return {
    cleanedFiles: cleanResult.modifiedFilesCount,
    cleanedEntries: cleanResult.removedEntriesCount,
  };
}

// 削除実行
export function executePruning(
  deadItems: CheckResult[],
  dryRun: boolean,
  cache: Record<string, any>,
  cleanReferences: boolean = true,
): void {
  console.log(`\n=== ${dryRun ? '[DRY RUN] ' : ''}棚卸し（削除）実行 ===`);

  let deletedArticles = 0;
  let deletedInvestigations = 0;
  let deletedCacheEntries = 0;

  for (const item of deadItems) {
    const result = pruneSingleItem(item, dryRun, cache);
    if (result.articleDeleted) deletedArticles++;
    if (result.investDeleted) deletedInvestigations++;
    if (result.cacheDeleted) deletedCacheEntries++;
  }

  if (!dryRun && deletedCacheEntries > 0) {
    saveCache(cache);
    console.log(`[Updated Cache] Removed ${deletedCacheEntries} dead entries from paapi-product-cache.json`);
  }

  const { cleanedFiles, cleanedEntries } = cleanReferences
    ? performCompetitorCleanup(deadItems, dryRun)
    : { cleanedFiles: 0, cleanedEntries: 0 };

  console.log('\n--- 削除サマリー ---');
  console.log(`記事ファイル (.md): ${deletedArticles} 件`);
  console.log(`調査データ (.json): ${deletedInvestigations} 件`);
  console.log(`キャッシュエントリ: ${deletedCacheEntries} 件`);
  if (cleanReferences) {
    console.log(`競合参照をクリーンアップした調査データ: ${cleanedFiles} 件 (${cleanedEntries} エントリ)`);
  }
}

// サイトインデックス再構築
function rebuildSiteIndex(): void {
  console.log('\n=== サイトインデックス再構築 (enhanceCategories) ===');
  try {
    enhanceCategories();
    console.log('サイトインデックス再構築完了');
  } catch (err) {
    console.error('サイトインデックス再構築に失敗しました:', err);
  }
}

// 孤立ファイル一覧の表示ヘルパー
function printOrphanFileList(title: string, list: string[], ext: string): void {
  if (list.length === 0) return;
  console.log(`${title}: ${list.length} 件`);
  for (const asin of list.slice(0, 5)) {
    console.log(`  - ${asin}${ext}`);
  }
  if (list.length > 5) {
    console.log(`    ... 他 ${list.length - 5} 件`);
  }
}

// 参照整合性レポート表示ヘルパー
function printReferencesAudit(deadItems: CheckResult[]): CompetitorReference[] {
  if (deadItems.length === 0) return [];
  console.log('\n--- 参照整合性チェック（他商品の競合リスト） ---');
  const references = findCompetitorReferences(deadItems.map((d) => d.asin));
  if (references.length === 0) {
    console.log('✅ 他商品の競合データからの参照はありません');
    return [];
  }
  console.log(`⚠️ デッド商品を参照している他商品の調査データ: ${references.length} 件`);
  for (const ref of references) {
    const details = ref.referencedDeadAsins.map((r) => `${r.asin}(${r.name})`).join(', ');
    console.log(`  - [${ref.sourceAsin}.json] が参照中: ${details}`);
  }
  return references;
}

// 孤立ファイルレポート表示ヘルパー
function printOrphansAudit(): OrphanFilesResult {
  const orphans = findOrphanedFiles();
  const hasOrphans = orphans.articlesWithoutInvest.length > 0 || orphans.investsWithoutArticle.length > 0;
  if (!hasOrphans) return orphans;

  console.log('\n--- 孤立ファイルチェック ---');
  printOrphanFileList('⚠️ 調査データのない記事 (.mdのみ)', orphans.articlesWithoutInvest, '.md');
  printOrphanFileList('⚠️ 記事のない調査データ (.jsonのみ)', orphans.investsWithoutArticle, '.json');
  return orphans;
}

// 調査結果レポート表示
export function printAuditResults(
  results: CheckResult[],
  options: CliOptions,
): { deadItems: CheckResult[]; references: CompetitorReference[]; orphans: OrphanFilesResult } {
  const deadItems = results.filter((r) => r.isDead);
  const aliveItems = results.filter((r) => !r.isDead && r.statusCode === 200);
  const errorItems = results.filter((r) => !r.isDead && r.statusCode !== 200);

  console.log('\n=== 調査結果 ===');
  console.log(`チェック総数: ${results.length} 件`);
  console.log(`❌ デッド商品 (404 Not Found): ${deadItems.length} 件`);
  console.log(`✅ 正常商品 (200 OK): ${aliveItems.length} 件`);
  if (errorItems.length > 0) {
    console.log(`⚠️ その他/エラー: ${errorItems.length} 件`);
  }

  if (deadItems.length > 0) {
    console.log('\n--- 検出されたデッド商品一覧 ---');
    for (const item of deadItems) {
      console.log(`- [${item.asin}] ${item.title || 'タイトルなし'}`);
    }
  }

  const references = options.checkReferences ? printReferencesAudit(deadItems) : [];
  const orphans = options.checkOrphans
    ? printOrphansAudit()
    : { articlesWithoutInvest: [], investsWithoutArticle: [] };

  return { deadItems, references, orphans };
}

// Pruneモードの処理
function handlePruning(deadItems: CheckResult[], options: CliOptions, cache: Record<string, any>): void {
  if (deadItems.length === 0) {
    console.log('\n削除対象のデッド商品はありませんでした。');
    return;
  }

  executePruning(deadItems, options.dryRun, cache, options.cleanReferences);

  if (!options.dryRun && !options.skipPrebuild) {
    rebuildSiteIndex();
  }
}

async function main() {
  const options = parseArgs();
  console.log('=== Amazon デッド商品 調査・棚卸しツール ===');
  console.log(`Mode: ${options.mode.toUpperCase()}${options.dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Scope: ${options.scope}`);

  const cache = loadCache();
  const targetAsins = collectTargetAsins(options, cache);

  console.log(`対象件数: ${targetAsins.length} 件`);
  if (targetAsins.length === 0) {
    console.log('対象となる商品が見つかりませんでした。');
    return;
  }

  console.log('\nAmazon ページ疎通確認中...');
  const results = await checkAsinsInBatches(targetAsins, options.concurrency, options.delayMs, cache);
  const { deadItems } = printAuditResults(results, options);

  if (options.mode === 'prune') {
    handlePruning(deadItems, options, cache);
  } else {
    console.log('\n※ 実際に削除を実行する場合は `--prune` オプションを付与して実行してください。');
    console.log('  例: pnpm ts-node scripts/prune-dead-products.ts --prune');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
