import fs from 'node:fs';
import path from 'node:path';

/**
 * 期限切れセールバッジ（プライム感謝祭等）のキャッシュ一括クリア・リセットスクリプト
 *
 * 使用例:
 *   # ドライラン（確認のみ）
 *   pnpm ts-node src/scripts/maintenance/clear-outdated-deal-badges.ts --dry-run
 *
 *   # 実行（プライム感謝祭関連のセールバッジを削除し、記事保有ASINのタイムスタンプを0にリセット）
 *   pnpm ts-node src/scripts/maintenance/clear-outdated-deal-badges.ts --execute
 *
 *   # プライムデー等の過去イベントも含めて全クリア
 *   pnpm ts-node src/scripts/maintenance/clear-outdated-deal-badges.ts --execute --include-all-events
 */

const cacheDir = path.resolve(__dirname, '../../../data/cache');
const shardsDir = path.join(cacheDir, 'paapi');
const investigationsDir = path.resolve(__dirname, '../../../data/investigations');

const isExecute = process.argv.includes('--execute');
const includeAllEvents = process.argv.includes('--include-all-events');
const isForce = process.argv.includes('--force');

// セール開催中の誤削除を防ぐため、デフォルトで取得から48時間以上経過した古いキャッシュのみを対象とする
const MIN_AGE_MS = isForce ? 0 : 48 * 60 * 60 * 1000;

// 対象とするセールバッジの判定ロジック
function isTargetBadge(badge: string): boolean {
  if (badge.includes('感謝祭')) {
    return true;
  }
  if (includeAllEvents && badge.includes('プライムデー')) {
    return true;
  }
  return false;
}

try {
  if (!fs.existsSync(shardsDir)) {
    console.error(`Shards directory not found: ${shardsDir}`);
    process.exit(1);
  }

  const shardFiles = fs.readdirSync(shardsDir).filter((f) => f.endsWith('.json'));
  let totalProcessed = 0;
  let articlesResetCount = 0;
  let nonArticlesCleanedCount = 0;
  let updatedShards = 0;
  let skippedFreshCount = 0;

  console.log(`Mode: ${isExecute ? 'EXECUTE (Modifying files)' : 'DRY RUN (Preview only)'}`);
  console.log(`Target: ${includeAllEvents ? 'Thanksgiving & Prime Day' : 'Thanksgiving only'}`);
  console.log(`Safety: ${isForce ? 'Force all (no age check)' : 'Targeting entries older than 48 hours'}\n`);

  const now = Date.now();

  for (const shardFile of shardFiles) {
    const filePath = path.join(shardsDir, shardFile);
    const rawData = fs.readFileSync(filePath, 'utf8');
    const cache = JSON.parse(rawData);
    let shardDirty = false;

    for (const [asin, entry] of Object.entries<any>(cache)) {
      const dealBadge = entry.data?.dealBadge;
      if (typeof dealBadge === 'string' && isTargetBadge(dealBadge)) {
        // セール開催中の最新キャッシュを保護するセーフティガード
        const ageMs = now - (entry.timestamp || 0);
        if (ageMs < MIN_AGE_MS) {
          skippedFreshCount++;
          continue;
        }

        totalProcessed++;
        const invPath = path.join(investigationsDir, `${asin}.json`);
        const hasInvestigation = fs.existsSync(invPath);

        console.log(
          `[${hasInvestigation ? 'ARTICLE' : 'CACHE-ONLY'}] ASIN: ${asin} | Shard: ${shardFile} | Badge: "${dealBadge}" | Status: ${entry.status} -> ${hasInvestigation ? 'Reset to valid(ts=0)' : 'Badge cleared'}`,
        );

        if (hasInvestigation) {
          articlesResetCount++;
        } else {
          nonArticlesCleanedCount++;
        }

        if (isExecute) {
          // セール関連フィールドのクリア
          delete entry.data.dealBadge;
          delete entry.data.dealAccessType;
          delete entry.data.savingsPercentage;

          if (hasInvestigation) {
            // 記事が存在する商品は、次回のパイプラインでCreators APIから最新データを再取得できるよう
            // statusをvalidにし、timestampを0にリセットする
            entry.status = 'valid';
            entry.timestamp = 0;
          }

          shardDirty = true;
        }
      }
    }

    if (isExecute && shardDirty) {
      const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
      const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}\n`;
      fs.writeFileSync(filePath, jsonContent, 'utf8');
      updatedShards++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total target entries found: ${totalProcessed}`);
  console.log(`Article-linked entries (reset to valid, ts=0): ${articlesResetCount}`);
  console.log(`Cache-only entries (badges cleared): ${nonArticlesCleanedCount}`);
  if (skippedFreshCount > 0) {
    console.log(`Skipped fresh entries (< 48h): ${skippedFreshCount}`);
  }
  if (isExecute) {
    console.log(`Updated shards: ${updatedShards} files.`);
    console.log('\nComplete. Run "pnpm run prebuild:hugo" to reflect changes locally if needed.');
  } else {
    console.log('\nDry run completed. To apply changes, add "--execute".');
  }
} catch (error) {
  console.error('Error during execution:', error);
  process.exit(1);
}
