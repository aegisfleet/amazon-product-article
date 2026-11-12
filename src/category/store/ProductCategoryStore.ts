import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StoredProductCategory {
  taxonomy_version: number;
  category_parent: string;
  category_child: string;
  amazon_category?: string | undefined;
  classification?:
    | {
        source: string;
        parent_confidence: number;
        child_confidence: number;
        classified_at: string;
        input_hash: string;
        needs_review: boolean;
        parent_runner_up?: { slug: string; probability: number } | undefined;
        child_runner_up?: { slug: string; probability: number } | undefined;
      }
    | undefined;
}

export type ProductCategoryMap = Record<string, StoredProductCategory>;

const STORE_PATH = path.resolve(process.cwd(), 'data/product-categories.json');

/**
 * Loads the product category mapping store from data/product-categories.json.
 * Returns an empty object if the file does not exist.
 */
export function loadProductCategories(storePath: string = STORE_PATH): ProductCategoryMap {
  if (!fs.existsSync(storePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    return JSON.parse(raw) as ProductCategoryMap;
  } catch (error) {
    console.error(`Failed to parse ${storePath}:`, error);
    return {};
  }
}

/**
 * Saves the product category mapping store to data/product-categories.json.
 * Each product entry is formatted as a single compact JSON line within the outer JSON object,
 * significantly compressing file size while preserving valid JSON and clean 1-line-per-entry Git diffs.
 */
export function saveProductCategories(
  map: ProductCategoryMap,
  storePath: string = STORE_PATH,
): void {
  const asins = Object.keys(map).sort();
  const lines: string[] = ['{'];
  for (let i = 0; i < asins.length; i++) {
    const asin = asins[i];
    if (!asin) continue;
    const item = map[asin];
    if (!item) continue;
    const isLast = i === asins.length - 1;
    const comma = isLast ? '' : ',';
    lines.push(`  ${JSON.stringify(asin)}: ${JSON.stringify(item)}${comma}`);
  }
  lines.push('}\n');
  fs.writeFileSync(storePath, lines.join('\n'), 'utf8');
}

/**
 * Retrieves the category mapping for a specific ASIN.
 */
export function getProductCategory(
  asin: string,
  map?: ProductCategoryMap,
): StoredProductCategory | undefined {
  const store = map || loadProductCategories();
  return store[asin];
}

/**
 * Sets or updates the category mapping for an ASIN in-memory or persisted.
 */
export function setProductCategory(
  asin: string,
  data: StoredProductCategory,
  map?: ProductCategoryMap,
  persist = false,
): ProductCategoryMap {
  const store = map || loadProductCategories();
  store[asin] = data;
  if (persist) {
    saveProductCategories(store);
  }
  return store;
}
