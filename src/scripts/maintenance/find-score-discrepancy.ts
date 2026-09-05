/**
 * バリエーション商品（同一親ASIN）間のスコア乖離監査スクリプト
 *
 * 使用例:
 *   pnpm ts-node src/scripts/maintenance/find-score-discrepancy.ts
 *   pnpm ts-node src/scripts/maintenance/find-score-discrepancy.ts --threshold 15
 *   pnpm ts-node src/scripts/maintenance/find-score-discrepancy.ts --parent B0H7RFY9BX
 *   pnpm ts-node src/scripts/maintenance/find-score-discrepancy.ts --verbose
 */

import fs from 'node:fs';
import path from 'node:path';

interface InvestigationItem {
  asin: string;
  parentAsin: string;
  productName: string;
  score: number;
  scoreRationale: string | undefined;
  cons: string[] | undefined;
  priceFormatted: string | undefined;
  savingsPercentage: number | undefined;
  dealBadge: string | undefined;
  filePath: string;
}

interface DiscrepancyGroup {
  parentAsin: string;
  maxDiff: number;
  minScore: number;
  maxScore: number;
  isLikelySameProduct: boolean;
  items: InvestigationItem[];
}

interface CliOptions {
  threshold: number;
  parentAsin: string | undefined;
  asin: string | undefined;
  verbose: boolean;
  json: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let threshold = 10;
  let parentAsin: string | undefined;
  let asin: string | undefined;
  let verbose = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--threshold' && i + 1 < args.length) {
      const next = args[++i];
      if (next !== undefined) {
        threshold = Number.parseInt(next, 10) || 10;
      }
    } else if (arg === '--parent' && i + 1 < args.length) {
      parentAsin = args[++i];
    } else if (arg === '--asin' && i + 1 < args.length) {
      asin = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--json') {
      json = true;
    }
  }

  return { threshold, parentAsin, asin, verbose, json };
}

function loadCacheMap(): Map<
  string,
  { price: string | undefined; savings: number | undefined; dealBadge: string | undefined }
> {
  const cachePath = path.join(process.cwd(), 'data', 'cache', 'paapi-product-cache.json');
  const map = new Map<
    string,
    { price: string | undefined; savings: number | undefined; dealBadge: string | undefined }
  >();
  if (!fs.existsSync(cachePath)) return map;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const data = JSON.parse(raw);
    for (const [asin, item] of Object.entries(data)) {
      const p = (item as any)?.data;
      if (p) {
        map.set(asin, {
          price: p.price?.formatted,
          savings: p.savingsPercentage,
          dealBadge: p.dealBadge,
        });
      }
    }
  } catch (_err) {
    // キャッシュファイルが存在しないか解析不能な場合は空マップを返す
  }
  return map;
}

function loadInvestigations(targetParent?: string, targetAsin?: string): InvestigationItem[] {
  const dir = path.join(process.cwd(), 'data', 'investigations');
  if (!fs.existsSync(dir)) {
    return [];
  }

  const cacheMap = loadCacheMap();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const results: InvestigationItem[] = [];

  for (const file of files) {
    const asin = path.basename(file, '.json');
    if (targetAsin && asin !== targetAsin) {
      continue;
    }

    try {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const analysis = data.analysis;
      if (!analysis) continue;

      const parentAsin = analysis.parentAsin || asin;
      const score = analysis.recommendation?.score;
      if (score === undefined || typeof score !== 'number') continue;

      if (targetParent && parentAsin !== targetParent) {
        continue;
      }

      const cacheInfo = cacheMap.get(asin);

      results.push({
        asin,
        parentAsin,
        productName: analysis.productName || asin,
        score,
        scoreRationale: analysis.recommendation?.scoreRationale,
        cons: analysis.recommendation?.cons,
        priceFormatted: cacheInfo?.price,
        savingsPercentage: cacheInfo?.savings,
        dealBadge: cacheInfo?.dealBadge,
        filePath,
      });
    } catch {
      // JSONパースエラー等はスキップ
    }
  }

  return results;
}

function groupAndFindDiscrepancies(items: InvestigationItem[], threshold: number): DiscrepancyGroup[] {
  const parentMap = new Map<string, InvestigationItem[]>();

  for (const item of items) {
    if (!parentMap.has(item.parentAsin)) {
      parentMap.set(item.parentAsin, []);
    }
    parentMap.get(item.parentAsin)?.push(item);
  }

  const discrepancies: DiscrepancyGroup[] = [];

  for (const [parentAsin, groupItems] of parentMap.entries()) {
    if (groupItems.length < 2) continue;

    const scores = groupItems.map((i) => i.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const maxDiff = maxScore - minScore;

    if (maxDiff >= threshold) {
      // 商品名の共通部分をチェック（同一製品判定の参考）
      const names = groupItems.map((i) => i.productName.toLowerCase());
      const firstWord = names[0]?.split(' ')[0] || '';
      const isLikelySameProduct = firstWord.length > 2 && names.every((n) => n.startsWith(firstWord));

      const sortedGroupItems = [...groupItems].sort((a, b) => b.score - a.score);

      discrepancies.push({
        parentAsin,
        maxDiff,
        minScore,
        maxScore,
        isLikelySameProduct,
        items: sortedGroupItems,
      });
    }
  }

  discrepancies.sort((a, b) => b.maxDiff - a.maxDiff);
  return discrepancies;
}

function formatItemLine(item: InvestigationItem): string {
  const pricePart = item.priceFormatted ? ` | ${item.priceFormatted}` : '';
  let dealPart = '';
  if (item.savingsPercentage) {
    const badge = item.dealBadge ? ` ${item.dealBadge}` : '';
    dealPart = ` (${item.savingsPercentage}% OFF${badge})`;
  }
  return `    - [${item.score}点] ASIN: ${item.asin}${pricePart}${dealPart} | ${item.productName}`;
}

function printGroup(index: number, group: DiscrepancyGroup, verbose: boolean): void {
  const productTag = group.isLikelySameProduct ? '【同一モデル/シリーズの可能性高】' : '【別モデル/別セットの可能性】';
  console.log(`[${index + 1}] 親ASIN: ${group.parentAsin} (最大スコア差: ${group.maxDiff}点) ${productTag}`);
  console.log(`    スコア範囲: ${group.minScore}点 ～ ${group.maxScore}点 / バリエーション数: ${group.items.length}`);

  for (const item of group.items) {
    console.log(formatItemLine(item));
    if (verbose && item.scoreRationale) {
      const lines = item.scoreRationale
        .split('\n')
        .map((l) => `        ${l}`)
        .join('\n');
      console.log(`      【採点根拠】:\n${lines}`);
    }
  }
  console.log('');
}

function main(): void {
  const options = parseArgs();
  const items = loadInvestigations(options.parentAsin, options.asin);
  const discrepancies = groupAndFindDiscrepancies(items, options.threshold);

  if (options.json) {
    console.log(JSON.stringify(discrepancies, null, 2));
    return;
  }

  console.log('================================================================');
  console.log(`🔍 同一親ASINスコア乖離監査レポート (閾値: ${options.threshold}点以上)`);
  console.log('================================================================\n');

  if (discrepancies.length === 0) {
    console.log('✅ スコア乖離のあるグループは見つかりませんでした。');
    return;
  }

  console.log(`⚠️  検出されたスコア乖離グループ数: ${discrepancies.length} 件\n`);

  for (const [index, group] of discrepancies.entries()) {
    printGroup(index, group, options.verbose);
  }

  console.log('----------------------------------------------------------------');
  console.log('💡 詳細確認・是正手順:');
  console.log('  1. 詳細表示: pnpm ts-node src/scripts/maintenance/find-score-discrepancy.ts --parent <親ASIN> -v');
  console.log('  2. 実態検証: 同一製品のバリエーション（色違い等）か、別製品（別モデル/セット）かを確認');
  console.log('  3. 是正対応: 同一製品の場合は妥当な採点基準に合わせて修正、または過大/過小データを削除');
  console.log('----------------------------------------------------------------');
}

main();
