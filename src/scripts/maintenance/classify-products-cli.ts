import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import * as dotenv from 'dotenv';
import { GeminiDecisionClassifier } from '../../category/classifier/GeminiDecisionClassifier';
import type { ClassificationResult } from '../../category/classifier/types';

dotenv.config();

/**
 * CLI Tool for Product Classification with Gemini Decision 1
 */

interface RunOptions {
  sampleSize?: number | undefined;
  dryRun: boolean;
  asin?: string | undefined;
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  let sampleSize: number | undefined;
  let dryRun = true;
  let asin: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === '--sample' && nextArg !== undefined) {
      sampleSize = Number.parseInt(nextArg, 10);
      i++;
    } else if (arg === '--apply') {
      dryRun = false;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--asin' && nextArg !== undefined) {
      asin = nextArg.trim();
      i++;
    }
  }

  return { sampleSize, dryRun, asin };
}

async function run(): Promise<void> {
  const options = parseArgs();
  const articlesDir = path.resolve(process.cwd(), 'content/articles');

  console.log('\n======================================================');
  console.log(' Gemini Decision 1 商品カテゴリ分類・検証 CLI');
  console.log('======================================================');
  console.log(`モード: ${options.dryRun ? 'DRY-RUN (記事は更新されません)' : 'APPLY (記事frontmatterを更新します)'}`);
  if (options.asin) {
    console.log(`対象ASIN: ${options.asin}`);
  } else if (options.sampleSize) {
    console.log(`サンプル件数: ${options.sampleSize} 件`);
  } else {
    console.log('対象: 全記事');
  }
  console.log('------------------------------------------------------\n');

  let targetFiles: string[] = [];

  if (options.asin) {
    const filename = `${options.asin}.md`;
    if (fs.existsSync(path.join(articlesDir, filename))) {
      targetFiles = [filename];
    } else {
      console.error(`[ERROR] 指定されたASINの記事ファイルが見つかりません: ${filename}`);
      process.exit(1);
    }
  } else {
    const allFiles = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md'));
    if (options.sampleSize && options.sampleSize < allFiles.length) {
      // 均等にサンプリング（頭ばかりに偏らないよう等間隔ステップで抽出）
      const step = Math.max(1, Math.floor(allFiles.length / options.sampleSize));
      for (let i = 0; i < allFiles.length && targetFiles.length < options.sampleSize; i += step) {
        const file = allFiles[i];
        if (file) {
          targetFiles.push(file);
        }
      }
    } else {
      targetFiles = allFiles;
    }
  }

  console.log(`処理対象: ${targetFiles.length} 件の記事\n`);

  const classifier = new GeminiDecisionClassifier();
  const results: Array<{
    asin: string;
    title: string;
    oldCat: string;
    classification: ClassificationResult;
    durationMs: number;
  }> = [];

  let count = 0;
  const startTime = Date.now();

  for (const file of targetFiles) {
    count++;
    const asin = path.basename(file, '.md');
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    const data = parsed.data;

    const title = String(data.title || data.item_name || asin);
    const brand = String(data.brand || data.manufacturer || '');
    const oldCat = Array.isArray(data.categories) ? data.categories[0] : String(data.category || '');

    // specs や description の抽出
    let specsSummary = '';
    if (typeof data.specs === 'object' && data.specs !== null) {
      specsSummary = Object.entries(data.specs)
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(', ');
    }

    const itemStartTime = Date.now();
    try {
      const res = await classifier.classify(
        {
          title,
          brand,
          specsSummary,
          description: typeof data.description === 'string' ? data.description.slice(0, 200) : undefined,
        },
        oldCat,
      );

      const durationMs = Date.now() - itemStartTime;
      results.push({ asin, title, oldCat, classification: res, durationMs });

      const reviewMark = res.needsReview ? '⚠️ [要確認]' : '✅';
      console.log(
        `[${count}/${targetFiles.length}] ${asin} | ${reviewMark} ${res.parentSlug} › ${res.childSlug} | 親conf: ${(res.parentConfidence * 100).toFixed(0)}% 子conf: ${(res.childConfidence * 100).toFixed(0)}% (${durationMs}ms)`,
      );

      // Applyモードの場合はfrontmatterを更新
      if (!options.dryRun) {
        data.taxonomy_version = 2;
        data.category_parent = res.parentSlug;
        data.category_child = res.childSlug;
        data.classification = {
          source: res.source,
          parent_confidence: res.parentConfidence,
          child_confidence: res.childConfidence,
          classified_at: res.classifiedAt,
          input_hash: res.inputHash,
          needs_review: res.needsReview,
        };
        if (res.parentRunnerUp) {
          data.classification.parent_runner_up = res.parentRunnerUp;
        }
        if (res.childRunnerUp) {
          data.classification.child_runner_up = res.childRunnerUp;
        }

        const newContent = matter.stringify(parsed.content, data);
        fs.writeFileSync(filePath, newContent, 'utf8');
      }
    } catch (err) {
      console.error(`[${count}/${targetFiles.length}] ${asin} で分類エラー:`, err instanceof Error ? err.message : err);
    }
  }

  const totalDuration = Date.now() - startTime;
  const avgMs = results.length > 0 ? (totalDuration / results.length).toFixed(0) : '0';

  // ----------------------------------------------------
  // サマリー集計
  // ----------------------------------------------------
  const reviewCount = results.filter((r) => r.classification.needsReview).length;
  const othersCount = results.filter(
    (r) => r.classification.parentSlug === 'others' || r.classification.childSlug.startsWith('zz-'),
  ).length;

  const avgParentConf =
    results.length > 0
      ? (results.reduce((acc, r) => acc + r.classification.parentConfidence, 0) / results.length) * 100
      : 0;

  const avgChildConf =
    results.length > 0
      ? (results.reduce((acc, r) => acc + r.classification.childConfidence, 0) / results.length) * 100
      : 0;

  console.log('\n======================================================');
  console.log(' 検証集計レポート');
  console.log('======================================================');
  console.log(
    `総処理数: ${results.length} 件 (所要時間: ${(totalDuration / 1000).toFixed(1)} 秒 / 平均 ${avgMs} ms/件)`,
  );
  console.log(`平均 親確信度 (Parent Confidence): ${avgParentConf.toFixed(1)}%`);
  console.log(`平均 子確信度 (Child Confidence): ${avgChildConf.toFixed(1)}%`);
  console.log(
    `自動確定率 (確定 / 総数): ${(((results.length - reviewCount) / results.length) * 100).toFixed(1)}% (${results.length - reviewCount} 件)`,
  );
  console.log(`要確認 (needsReview) 率: ${((reviewCount / results.length) * 100).toFixed(1)}% (${reviewCount} 件)`);
  console.log(
    `「その他」滞留率: ${((othersCount / results.length) * 100).toFixed(1)}% (${othersCount} 件) (目標: 5%以下)`,
  );

  console.log('\n------------------------------------------------------');
  console.log(' 親カテゴリ別 振り分け件数TOP 10');
  console.log('------------------------------------------------------');
  const parentCounts = new Map<string, number>();
  for (const r of results) {
    const p = r.classification.parentSlug;
    parentCounts.set(p, (parentCounts.get(p) || 0) + 1);
  }
  const sortedParents = Array.from(parentCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [p, c] of sortedParents.slice(0, 10)) {
    console.log(`  - ${p.padEnd(28, ' ')}: ${c} 件`);
  }
  console.log('======================================================\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[FATAL ERROR]:', err);
    process.exit(1);
  });
}
