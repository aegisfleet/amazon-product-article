import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CacheEntry {
  data: unknown;
  timestamp: number;
  status: string;
}

export interface CacheFile {
  [asin: string]: CacheEntry;
}

export function parseJSONSafe(raw: string): CacheFile {
  try {
    if (!raw?.trim()) {
      return {};
    }
    return JSON.parse(raw) as CacheFile;
  } catch (error) {
    console.error('❌ Failed to parse JSON content:', error);
    return {};
  }
}

export function loadJSON(filePath: string): CacheFile {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`ℹ️ File not found, treating as empty: ${filePath}`);
      return {};
    }
    const rawData = fs.readFileSync(filePath, 'utf-8');
    return parseJSONSafe(rawData);
  } catch (error) {
    console.error(`❌ Failed to read JSON from ${filePath}:`, error);
    return {};
  }
}

export interface MergeResult {
  merged: CacheFile;
  addedFromOurs: number;
  updatedFromOurs: number;
  keptTheirs: number;
}

export function mergeCacheObjects(ours: CacheFile, theirs: CacheFile): MergeResult {
  const merged: CacheFile = { ...theirs };
  let addedFromOurs = 0;
  let updatedFromOurs = 0;
  let keptTheirs = 0;

  for (const key in ours) {
    if (Object.hasOwn(ours, key)) {
      const oursEntry = ours[key];
      if (!oursEntry) continue;

      const theirsEntry = theirs[key];

      if (!theirsEntry) {
        // Only exists in ours
        merged[key] = oursEntry;
        addedFromOurs++;
      } else {
        // Exists in both, compare timestamps
        const oursTime = oursEntry.timestamp || 0;
        const theirsTime = theirsEntry.timestamp || 0;

        if (oursTime > theirsTime) {
          merged[key] = oursEntry;
          updatedFromOurs++;
        } else {
          keptTheirs++;
        }
      }
    }
  }

  return {
    merged,
    addedFromOurs,
    updatedFromOurs,
    keptTheirs,
  };
}

export function formatCacheJSON(merged: CacheFile): string {
  const sortedKeys = Object.keys(merged).sort((a, b) => a.localeCompare(b));
  const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(merged[key])}`);
  return `{\n${lines.join(',\n')}\n}`;
}

export function mergeContent(
  oursContent: string,
  theirsContent: string,
): { merged: CacheFile; result: MergeResult; json: string } {
  const ours = parseJSONSafe(oursContent);
  const theirs = parseJSONSafe(theirsContent);
  const result = mergeCacheObjects(ours, theirs);
  const json = formatCacheJSON(result.merged);
  return { merged: result.merged, result, json };
}

/**
 * Gitのコンフリクトステージ (:2: ours, :3: theirs) から内容を取得してマージし、直接ファイルに書き込んで git add する
 */
export function mergeGitConflictFile(filePath: string): boolean {
  try {
    let oursContent = '';
    let theirsContent = '';

    try {
      oursContent = execSync(`git show :2:"${filePath}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      // ステージ2が存在しない場合は空
    }

    try {
      theirsContent = execSync(`git show :3:"${filePath}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      // ステージ3が存在しない場合は空
    }

    const { json, result } = mergeContent(oursContent, theirsContent);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, json, 'utf-8');
    execSync(`git add "${filePath}"`, { stdio: 'ignore' });

    console.log(
      `✅ Merged ${filePath} (added: ${result.addedFromOurs}, updated: ${result.updatedFromOurs}, kept: ${result.keptTheirs})`,
    );
    return true;
  } catch (error) {
    console.error(`❌ Failed to merge git conflict in ${filePath}:`, error);
    return false;
  }
}

/**
 * 複数のコンフリクトファイルを一括マージする
 */
export function mergeAllConflictFiles(filePaths: string[]): boolean {
  console.log(`🔄 Batch merging ${filePaths.length} conflicted cache files...`);
  const startTime = Date.now();
  let successCount = 0;
  let failedCount = 0;

  for (const file of filePaths) {
    if (!file?.trim()) continue;
    const ok = mergeGitConflictFile(file.trim());
    if (ok) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`📊 Batch merge finished in ${duration}s: ${successCount} succeeded, ${failedCount} failed.`);
  return failedCount === 0;
}

function runCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Usage:');
    console.error('   1. Single merge:  node merge-product-cache.js <ours.json> <theirs.json> <output.json>');
    console.error('   2. Batch merge:   node merge-product-cache.js --batch <file1> [file2 ...]');
    process.exit(1);
  }

  if (args[0] === '--batch') {
    const files = args.slice(1);
    if (files.length === 0) {
      console.log('ℹ️ No files provided to --batch, nothing to merge.');
      process.exit(0);
    }
    const success = mergeAllConflictFiles(files);
    process.exit(success ? 0 : 1);
  }

  // 従来の 3 引数モード
  const [oursPath, theirsPath, outputPath] = args;
  if (!oursPath || !theirsPath || !outputPath) {
    console.error('❌ Invalid arguments for 3-argument mode.');
    process.exit(1);
  }

  console.log(`📦 Loading ours: ${oursPath}`);
  const ours = loadJSON(oursPath);

  console.log(`📦 Loading theirs: ${theirsPath}`);
  const theirs = loadJSON(theirsPath);

  console.log('🔄 Merging cache entries...');
  const { merged, addedFromOurs, updatedFromOurs, keptTheirs } = mergeCacheObjects(ours, theirs);

  console.log('📊 Merge summary:');
  console.log(`   - Added from ours (new entries): ${addedFromOurs}`);
  console.log(`   - Updated from ours (newer timestamp): ${updatedFromOurs}`);
  console.log(`   - Kept from theirs (newer/same timestamp): ${keptTheirs}`);
  console.log(`   - Total merged entries: ${Object.keys(merged).length}`);

  try {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const jsonContent = formatCacheJSON(merged);
    fs.writeFileSync(outputPath, jsonContent, 'utf-8');
    console.log(`✅ Successfully wrote merged cache to ${outputPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Failed to write merged cache to ${outputPath}:`, error);
    process.exit(1);
  }
}

if (require.main === module) {
  runCLI();
}
