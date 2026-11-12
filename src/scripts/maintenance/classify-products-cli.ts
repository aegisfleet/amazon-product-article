import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import * as dotenv from 'dotenv';
import { GeminiDecisionClassifier } from '../../category/classifier/GeminiDecisionClassifier';
import type { ClassificationResult } from '../../category/classifier/types';

dotenv.config();

/**
 * CLI Tool for Product Classification with Gemini Decision 1
 * Supports rate control, checkpoint resumption, dry-run, and batch reporting.
 */

interface RunOptions {
  sampleSize?: number | undefined;
  limit?: number | undefined;
  delayMs?: number | undefined;
  dryRun: boolean;
  asin?: string | undefined;
  resume: boolean;
  force: boolean;
}

interface CheckpointData {
  updatedAt: string;
  processedAsins: string[];
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  let sampleSize: number | undefined;
  let limit: number | undefined;
  let delayMs: number | undefined;
  let dryRun = true;
  let asin: string | undefined;
  let resume = true;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === '--sample' && nextArg !== undefined) {
      sampleSize = Number.parseInt(nextArg, 10);
      i++;
    } else if (arg === '--limit' && nextArg !== undefined) {
      limit = Number.parseInt(nextArg, 10);
      i++;
    } else if (arg === '--delay' && nextArg !== undefined) {
      delayMs = Number.parseInt(nextArg, 10);
      i++;
    } else if (arg === '--apply') {
      dryRun = false;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--asin' && nextArg !== undefined) {
      asin = nextArg.trim();
      i++;
    } else if (arg === '--no-resume') {
      resume = false;
    } else if (arg === '--force') {
      force = true;
    }
  }

  return { sampleSize, limit, delayMs, dryRun, asin, resume, force };
}

function loadCheckpoint(checkpointPath: string): CheckpointData {
  if (fs.existsSync(checkpointPath)) {
    try {
      return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
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

async function run(): Promise<void> {
  const options = parseArgs();
  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const checkpointPath = path.resolve(process.cwd(), 'tmp/classification-checkpoint.json');
  const reportPath = path.resolve(process.cwd(), 'tmp/classification-report.json');

  console.log('\n======================================================');
  console.log(' Gemini Decision 1 商品カテゴリ分類・検証 CLI');
  console.log('======================================================');
  console.log(`モード: ${options.dryRun ? 'DRY-RUN (記事は更新されません)' : 'APPLY (記事frontmatterを更新します)'}`);
  if (options.asin) {
    console.log(`対象ASIN: ${options.asin}`);
  } else if (options.sampleSize) {
    console.log(`サンプル件数: ${options.sampleSize} 件`);
  } else if (options.limit) {
    console.log(`処理件数上限: ${options.limit} 件`);
  } else {
    console.log('対象: 全記事');
  }
  if (options.delayMs) {
    console.log(`リクエスト間インターバル: ${options.delayMs} ms`);
  }
  console.log(`チェックポイント再開: ${options.resume ? '有効' : '無効'}`);
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

  const checkpoint = options.resume ? loadCheckpoint(checkpointPath) : { updatedAt: '', processedAsins: [] };
  const processedSet = new Set<string>(checkpoint.processedAsins);

  // 既に分類済みの記事をスキップ（--force 指定時はスキップしない）
  let filesToProcess = targetFiles;
  if (!options.force && options.resume) {
    filesToProcess = targetFiles.filter((f) => {
      const asin = path.basename(f, '.md');
      if (processedSet.has(asin)) {
        return false;
      }
      // frontmatter に既に taxonomy_version: 2 が入っているかも確認
      const filePath = path.join(articlesDir, f);
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = matter(content);
      return parsed.data.taxonomy_version !== 2;
    });
  }

  if (options.limit && options.limit < filesToProcess.length) {
    filesToProcess = filesToProcess.slice(0, options.limit);
  }

  console.log(
    `全対象: ${targetFiles.length} 件 | 今回処理対象: ${filesToProcess.length} 件 (既処理スキップ: ${targetFiles.length - filesToProcess.length} 件)\n`,
  );

  if (filesToProcess.length === 0) {
    console.log('すべての対象が既に処理済みです。再処理する場合は --force を指定してください。\n');
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

  let count = 0;
  const startTime = Date.now();

  for (const file of filesToProcess) {
    count++;
    const asin = path.basename(file, '.md');
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    const data = parsed.data;

    const title = String(data.title || data.item_name || asin);
    const brand = String(data.brand || data.manufacturer || '');
    const oldCat = Array.isArray(data.categories) ? data.categories[0] : String(data.category || '');

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
      processedSet.add(asin);

      const reviewMark = res.needsReview ? '⚠️ [要確認]' : '✅';
      const sourceTag = res.source === 'fallback-map' ? '[FB]' : '';
      console.log(
        `[${count}/${filesToProcess.length}] ${asin} | ${reviewMark} ${sourceTag} ${res.parentSlug} › ${res.childSlug} | 親: ${(res.parentConfidence * 100).toFixed(0)}% 子: ${(res.childConfidence * 100).toFixed(0)}% (${durationMs}ms)`,
      );

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

      // 10件ごとにチェックポイント保存
      if (count % 10 === 0) {
        saveCheckpoint(checkpointPath, processedSet);
      }

      // インターバル待機（レート制御）
      if (options.delayMs && options.delayMs > 0 && count < filesToProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
    } catch (err) {
      console.error(`[${count}/${filesToProcess.length}] ${asin} でエラー:`, err instanceof Error ? err.message : err);
    }
  }

  // 終了時チェックポイント保存
  saveCheckpoint(checkpointPath, processedSet);

  const totalDuration = Date.now() - startTime;
  const avgMs = results.length > 0 ? (totalDuration / results.length).toFixed(0) : '0';

  // サマリー集計
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
  console.log(`処理数: ${results.length} 件 (所要時間: ${(totalDuration / 1000).toFixed(1)} 秒 / 平均 ${avgMs} ms/件)`);
  console.log(`平均 親確信度 (Parent Confidence): ${avgParentConf.toFixed(1)}%`);
  console.log(`平均 子確信度 (Child Confidence): ${avgChildConf.toFixed(1)}%`);
  console.log(
    `自動確定率 (確定 / 総数): ${(((results.length - reviewCount) / results.length) * 100).toFixed(1)}% (${results.length - reviewCount} 件)`,
  );
  console.log(`要確認 (needsReview) 率: ${((reviewCount / results.length) * 100).toFixed(1)}% (${reviewCount} 件)`);
  console.log(
    `「その他」滞留率: ${((othersCount / results.length) * 100).toFixed(1)}% (${othersCount} 件) (目標: 5%以下)`,
  );

  // レポートファイル書き出し
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        total: results.length,
        durationSeconds: Number((totalDuration / 1000).toFixed(1)),
        avgParentConfidence: Number(avgParentConf.toFixed(1)),
        avgChildConfidence: Number(avgChildConf.toFixed(1)),
        autoConfirmed: results.length - reviewCount,
        needsReview: reviewCount,
        othersCount,
        results,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`\nレポートを保存しました: ${reportPath}`);
  console.log('======================================================\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[FATAL ERROR]:', err);
    process.exit(1);
  });
}
