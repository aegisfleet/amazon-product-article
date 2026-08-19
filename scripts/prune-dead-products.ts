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

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

interface CheckResult {
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

interface CliOptions {
  mode: 'audit' | 'prune';
  scope: 'perm-invalid' | 'all' | 'single';
  singleAsin: string | undefined;
  dryRun: boolean;
  concurrency: number;
  delayMs: number;
  skipPrebuild: boolean;
}

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTICLES_DIR = path.join(ROOT_DIR, 'content/articles');
const INVESTIGATIONS_DIR = path.join(ROOT_DIR, 'data/investigations');
const CACHE_PATH = path.join(ROOT_DIR, 'data/cache/paapi-product-cache.json');

// コマンドライン引数のパース
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    mode: 'audit',
    scope: 'perm-invalid',
    singleAsin: undefined,
    dryRun: false,
    concurrency: 3,
    delayMs: 300,
    skipPrebuild: false,
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
          const titleMatch = body.match(/<title>([^<]*)<\/title>/i);
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

// 削除実行
function executePruning(deadItems: CheckResult[], dryRun: boolean, cache: Record<string, any>): void {
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

  // キャッシュファイルの保存
  if (!dryRun && deletedCacheEntries > 0) {
    saveCache(cache);
    console.log(`[Updated Cache] Removed ${deletedCacheEntries} dead entries from paapi-product-cache.json`);
  }

  console.log('\n--- 削除サマリー ---');
  console.log(`記事ファイル (.md): ${deletedArticles} 件`);
  console.log(`調査データ (.json): ${deletedInvestigations} 件`);
  console.log(`キャッシュエントリ: ${deletedCacheEntries} 件`);
}

// サイトインデックス再構築
function rebuildSiteIndex(): void {
  console.log('\n=== サイトインデックス再構築 (prebuild:hugo) ===');
  try {
    execSync('pnpm run prebuild:hugo', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('prebuild:hugo 完了');
  } catch (err) {
    console.error('prebuild:hugo の実行に失敗しました:', err);
  }
}

// 調査結果レポート表示
function printAuditResults(results: CheckResult[]): { deadItems: CheckResult[] } {
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

  return { deadItems };
}

// Pruneモードの処理
function handlePruning(deadItems: CheckResult[], options: CliOptions, cache: Record<string, any>): void {
  if (deadItems.length === 0) {
    console.log('\n削除対象のデッド商品はありませんでした。');
    return;
  }

  executePruning(deadItems, options.dryRun, cache);

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
  const { deadItems } = printAuditResults(results);

  if (options.mode === 'prune') {
    handlePruning(deadItems, options, cache);
  } else {
    console.log('\n※ 実際に削除を実行する場合は `--prune` オプションを付与して実行してください。');
    console.log('  例: pnpm ts-node scripts/prune-dead-products.ts --prune');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
