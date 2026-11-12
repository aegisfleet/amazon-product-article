import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import {
  loadProductCategories,
  type StoredProductCategory,
  saveProductCategories,
} from '../../category/store/ProductCategoryStore';

interface RawClassification {
  source?: unknown;
  parent_confidence?: unknown;
  child_confidence?: unknown;
  classified_at?: unknown;
  input_hash?: unknown;
  needs_review?: unknown;
}

interface RawArticleFrontmatter {
  taxonomy_version?: unknown;
  category_parent?: unknown;
  category_child?: unknown;
  amazon_category?: unknown;
  categories?: unknown;
  category?: unknown;
  classification?: RawClassification;
}

function ensureString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return fallback;
}

function parseClassification(raw: RawClassification | undefined): StoredProductCategory['classification'] {
  if (!raw) return undefined;
  return {
    source: ensureString(raw.source, 'gemini-decision-1'),
    parent_confidence: typeof raw.parent_confidence === 'number' ? raw.parent_confidence : 1.0,
    child_confidence: typeof raw.child_confidence === 'number' ? raw.child_confidence : 1.0,
    classified_at: ensureString(raw.classified_at, new Date().toISOString()),
    input_hash: ensureString(raw.input_hash, ''),
    needs_review: Boolean(raw.needs_review),
  };
}

function resolveAmazonCategory(d: RawArticleFrontmatter): string | undefined {
  if (typeof d.amazon_category === 'string') {
    return d.amazon_category;
  }
  if (Array.isArray(d.categories) && d.categories.length > 0) {
    return String(d.categories[0]);
  }
  if (typeof d.category === 'string') {
    return d.category;
  }
  return undefined;
}

/**
 * 記事 frontmatter から分類情報を抽出する
 */
function extractCategoryFromArticle(filePath: string): StoredProductCategory | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const d = parsed.data as RawArticleFrontmatter;

    if (d.taxonomy_version !== 2 || !d.category_parent || !d.category_child) {
      return null;
    }

    return {
      taxonomy_version: 2,
      category_parent: ensureString(d.category_parent),
      category_child: ensureString(d.category_child),
      amazon_category: resolveAmazonCategory(d),
      classification: parseClassification(d.classification),
    };
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return null;
  }
}

/**
 * frontmatter のフィールドを比較・更新し、変更があったかを判定する
 */
function updateFrontmatterValues(d: RawArticleFrontmatter, stored: StoredProductCategory): boolean {
  let changed = false;

  if (d.taxonomy_version !== stored.taxonomy_version) {
    d.taxonomy_version = stored.taxonomy_version;
    changed = true;
  }
  if (d.category_parent !== stored.category_parent) {
    d.category_parent = stored.category_parent;
    changed = true;
  }
  if (d.category_child !== stored.category_child) {
    d.category_child = stored.category_child;
    changed = true;
  }
  if (stored.amazon_category && d.amazon_category !== stored.amazon_category) {
    d.amazon_category = stored.amazon_category;
    changed = true;
  }
  if (stored.classification && JSON.stringify(d.classification) !== JSON.stringify(stored.classification)) {
    d.classification = stored.classification;
    changed = true;
  }

  return changed;
}

/**
 * 記事ファイルを読み込み、ストアのカテゴリ情報で更新する
 */
function applyCategoryToArticle(filePath: string, stored: StoredProductCategory): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const d = parsed.data as RawArticleFrontmatter;

    const changed = updateFrontmatterValues(d, stored);
    if (!changed) {
      return false;
    }

    const updated = matter.stringify(parsed.content, d);
    fs.writeFileSync(filePath, updated, 'utf8');
    return true;
  } catch (err) {
    console.error(`Error updating article ${filePath}:`, err);
    return false;
  }
}

/**
 * content/articles/*.md から分類結果を抽出してストアに保存する
 */
function syncFromArticles(articlesDir: string, store: Record<string, StoredProductCategory>): void {
  console.log('[sync] content/articles/*.md から分類結果を抽出中...');
  if (!fs.existsSync(articlesDir)) {
    return;
  }

  let extractedCount = 0;
  const files = fs.readdirSync(articlesDir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const asin = path.basename(file, '.md');
    const filePath = path.join(articlesDir, file);

    const extracted = extractCategoryFromArticle(filePath);
    if (extracted) {
      store[asin] = extracted;
      extractedCount++;
    }
  }

  saveProductCategories(store);
  console.log(
    `[sync] ${extractedCount} 件の分類結果を data/product-categories.json に保存完了 (総登録件数: ${Object.keys(store).length})`,
  );
}

/**
 * data/product-categories.json の内容を content/articles/*.md に反映する
 */
function syncToArticles(articlesDir: string, store: Record<string, StoredProductCategory>): void {
  console.log('[sync] data/product-categories.json から content/articles/*.md へ反映中...');
  if (!fs.existsSync(articlesDir)) {
    return;
  }

  let updatedArticlesCount = 0;
  const files = fs.readdirSync(articlesDir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const asin = path.basename(file, '.md');
    const stored = store[asin];
    if (!stored) continue;

    const filePath = path.join(articlesDir, file);
    if (applyCategoryToArticle(filePath, stored)) {
      updatedArticlesCount++;
    }
  }

  console.log(`[sync] ${updatedArticlesCount} 件の記事 frontmatter を更新完了`);
}

/**
 * Synchronizes category mappings between content/articles/*.md and data/product-categories.json.
 *
 * Usage:
 *   pnpm ts-node src/scripts/maintenance/sync-product-categories.ts [--from-articles] [--to-articles]
 */
function syncCategories(): void {
  const args = process.argv.slice(2);
  const fromArticles = args.includes('--from-articles') || args.length === 0;
  const toArticles = args.includes('--to-articles');

  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const store = loadProductCategories();

  if (fromArticles) {
    syncFromArticles(articlesDir, store);
  }

  if (toArticles) {
    syncToArticles(articlesDir, store);
  }
}

try {
  syncCategories();
} catch (err) {
  console.error('[sync] 致命的エラー:', err);
  process.exit(1);
}
