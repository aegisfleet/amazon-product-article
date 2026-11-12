import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import { loadProductCategories, saveProductCategories } from '../../category/store/ProductCategoryStore';

/**
 * Synchronizes category mappings between content/articles/*.md and data/product-categories.json.
 *
 * Usage:
 *   pnpm ts-node src/scripts/maintenance/sync-product-categories.ts [--from-articles] [--to-articles]
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fromArticles = args.includes('--from-articles') || args.length === 0;
  const toArticles = args.includes('--to-articles');

  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const store = loadProductCategories();
  let extractedCount = 0;
  let updatedArticlesCount = 0;

  if (fromArticles) {
    console.log(`[sync] content/articles/*.md から分類結果を抽出中...`);
    if (fs.existsSync(articlesDir)) {
      const files = fs.readdirSync(articlesDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const asin = path.basename(file, '.md');
        const filePath = path.join(articlesDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const parsed = matter(raw);
          const d = parsed.data;

          if (d.taxonomy_version === 2 && d.category_parent && d.category_child) {
            store[asin] = {
              taxonomy_version: 2,
              category_parent: String(d.category_parent),
              category_child: String(d.category_child),
              amazon_category: d.amazon_category
                ? String(d.amazon_category)
                : Array.isArray(d.categories)
                  ? String(d.categories[0])
                  : typeof d.category === 'string'
                    ? d.category
                    : undefined,
              classification: d.classification
                ? {
                    source: String(d.classification.source || 'gemini-decision-1'),
                    parent_confidence: Number(d.classification.parent_confidence || 1.0),
                    child_confidence: Number(d.classification.child_confidence || 1.0),
                    classified_at: String(d.classification.classified_at || new Date().toISOString()),
                    input_hash: String(d.classification.input_hash || ''),
                    needs_review: Boolean(d.classification.needs_review),
                  }
                : undefined,
            };
            extractedCount++;
          }
        } catch (err) {
          console.error(`Error reading ${file}:`, err);
        }
      }
    }

    saveProductCategories(store);
    console.log(
      `[sync] ${extractedCount} 件の分類結果を data/product-categories.json に保存完了 (総登録件数: ${Object.keys(store).length})`,
    );
  }

  if (toArticles) {
    console.log(`[sync] data/product-categories.json から content/articles/*.md へ反映中...`);
    if (fs.existsSync(articlesDir)) {
      const files = fs.readdirSync(articlesDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const asin = path.basename(file, '.md');
        const stored = store[asin];
        if (!stored) continue;

        const filePath = path.join(articlesDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const parsed = matter(raw);
          const d = parsed.data;

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

          if (changed) {
            const updated = matter.stringify(parsed.content, d);
            fs.writeFileSync(filePath, updated, 'utf8');
            updatedArticlesCount++;
          }
        } catch (err) {
          console.error(`Error updating article ${file}:`, err);
        }
      }
      console.log(`[sync] ${updatedArticlesCount} 件の記事 frontmatter を更新完了`);
    }
  }
}

main().catch((err) => {
  console.error('[sync] 致命的エラー:', err);
  process.exit(1);
});
