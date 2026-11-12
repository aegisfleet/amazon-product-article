import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ProductCategoryMap, saveProductCategories } from '../../category/store/ProductCategoryStore';
import { readConflictStages } from './git-conflict-utils';

export const DEFAULT_CATEGORY_STORE_PATH = 'data/product-categories.json';

export interface CategoryMergeResult {
  merged: ProductCategoryMap;
  /** ours のみに存在したため採用した件数 */
  addedFromOurs: number;
  /** 双方に存在し、ours の分類日時が新しいため採用した件数 */
  updatedFromOurs: number;
  /** 双方に存在し、theirs の分類日時が新しいため採用した件数 */
  keptTheirs: number;
}

export function parseCategoryJSONSafe(raw: string): ProductCategoryMap {
  try {
    if (!raw?.trim()) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('⚠️ Category store content is not a JSON object. Treating as empty.');
      return {};
    }
    return parsed as ProductCategoryMap;
  } catch (error) {
    console.error('❌ Failed to parse category store JSON:', error);
    return {};
  }
}

/**
 * 分類日時 (classification.classified_at) を比較し、より新しい分類結果を優先して
 * 2つの商品カテゴリマップを統合する。日時が同一・欠損の場合は ours を優先する。
 */
export function mergeProductCategories(ours: ProductCategoryMap, theirs: ProductCategoryMap): CategoryMergeResult {
  const merged: ProductCategoryMap = { ...theirs };
  let addedFromOurs = 0;
  let updatedFromOurs = 0;
  let keptTheirs = 0;

  for (const asin of Object.keys(ours)) {
    const oursEntry = ours[asin];
    if (!oursEntry) continue;

    const theirsEntry = theirs[asin];
    if (!theirsEntry) {
      merged[asin] = oursEntry;
      addedFromOurs++;
      continue;
    }

    if (getClassifiedAt(oursEntry) >= getClassifiedAt(theirsEntry)) {
      merged[asin] = oursEntry;
      updatedFromOurs++;
    } else {
      keptTheirs++;
    }
  }

  return { merged, addedFromOurs, updatedFromOurs, keptTheirs };
}

function getClassifiedAt(entry: ProductCategoryMap[string]): number {
  const raw = entry.classification?.classified_at;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeCategoryContent(
  oursContent: string,
  theirsContent: string,
): { merged: ProductCategoryMap; result: CategoryMergeResult } {
  const ours = parseCategoryJSONSafe(oursContent);
  const theirs = parseCategoryJSONSafe(theirsContent);
  const result = mergeProductCategories(ours, theirs);
  return { merged: result.merged, result };
}

/**
 * 単一ファイルのコンフリクトを解決し、整形済み JSON を書き出して git add する。
 */
export function mergeCategoryConflictFile(filePath: string = DEFAULT_CATEGORY_STORE_PATH): boolean {
  try {
    const { ours, theirs } = readConflictStages(filePath);
    const { merged, result } = mergeCategoryContent(ours, theirs);

    // ステージ読み取りに失敗した場合に空のストアで上書きしてしまうのを防ぐ安全弁
    if (Object.keys(merged).length === 0) {
      console.error(`❌ Refusing to overwrite ${filePath}: both conflict stages are empty or unreadable.`);
      return false;
    }

    const dir = path.dirname(filePath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    saveProductCategories(merged, filePath);
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

export function mergeAllCategoryConflictFiles(filePaths: string[] = [DEFAULT_CATEGORY_STORE_PATH]): boolean {
  const targets = filePaths.filter((file) => !!file?.trim());
  if (targets.length === 0) {
    console.log('ℹ️ No category store files provided, nothing to merge.');
    return true;
  }

  console.log(`🔄 Merging ${targets.length} conflicted category store file(s)...`);
  let failedCount = 0;
  for (const file of targets) {
    if (!mergeCategoryConflictFile(file.trim())) {
      failedCount++;
    }
  }
  return failedCount === 0;
}

function runCLI() {
  const args = process.argv.slice(2);
  const targets = args[0] === '--batch' ? args.slice(1) : args;

  const success = mergeAllCategoryConflictFiles(targets.length > 0 ? targets : [DEFAULT_CATEGORY_STORE_PATH]);
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  runCLI();
}
