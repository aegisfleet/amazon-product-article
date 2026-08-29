import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { CategoryManager } from '../category/CategoryManager';
import { ProductCounter } from '../category/ProductCounter';
import { BrandCounter } from '../navigation/BrandCounter';
import { type BrandEntry, BrandManager } from '../navigation/BrandManager';

const categoryGroupsPath = path.resolve(process.cwd(), 'data/categorygroups.json');
const contentPath = path.resolve(process.cwd(), 'content');
const outJsonPath = path.resolve(process.cwd(), 'static/data/categorygroups.json');
const outYamlPath = path.resolve(process.cwd(), 'data/categories.yml');

const brandGroupsSourcePath = path.resolve(process.cwd(), 'data/brandgroups.json');
const brandGroupsStaticPath = path.resolve(process.cwd(), 'static/data/brandgroups.json');
const brandContentDir = path.resolve(contentPath, 'brand');

/**
 * ブランドの自動抽出とデータの同期
 * 1. 記事から10個以上の商品を持つブランドを自動抽出
 * 2. data/brandgroups.json を更新
 */
function updateBrandGroups(): void {
  console.log('--- Brand Auto-Extraction ---');
  const articlesPath = path.resolve(process.cwd(), 'content/articles');
  const counter = new BrandCounter(articlesPath, 5, brandGroupsSourcePath);
  const topBrands = counter.getTopBrands();
  console.log(`Found ${topBrands.length} brands with 5+ products.`);

  const manager = new BrandManager(brandGroupsSourcePath);
  manager.load();
  manager.mergeTopBrands(topBrands);
  manager.save();
  console.log('Updated brandgroups.json with newly discovered brands.');
}

/**
 * ブランドデータの同期処理:
 * 1. data/brandgroups.json → static/data/brandgroups.json へコピー
 * 2. content/brand/*.md の自動生成・削除
 */
function syncBrandData(): void {
  console.log('--- Brand Data Sync ---');
  if (!fs.existsSync(brandGroupsSourcePath)) {
    console.log('No brandgroups.json found, skipping brand sync.');
    return;
  }

  // static/data/ にコピー
  const staticDir = path.dirname(brandGroupsStaticPath);
  if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir, { recursive: true });
  }
  fs.copyFileSync(brandGroupsSourcePath, brandGroupsStaticPath);
  console.log(`Copied brand data to ${brandGroupsStaticPath}`);

  // ブランドデータを読み込み
  const rawData = fs.readFileSync(brandGroupsSourcePath, 'utf-8');
  const brandData = JSON.parse(rawData) as Record<string, BrandEntry>;

  // content/brand/ ディレクトリの準備
  if (!fs.existsSync(brandContentDir)) {
    fs.mkdirSync(brandContentDir, { recursive: true });
  }

  const activeSlugs = new Set<string>();

  for (const [brandName, brand] of Object.entries(brandData)) {
    const fileName = `${brand.slug}.md`;
    activeSlugs.add(fileName);

    const filePath = path.join(brandContentDir, fileName);
    const matcherType = brand.matcher?.type || 'title_prefix';

    const frontMatter = {
      title: brandName,
      description: brand.description || `${brandName}ブランドの商品一覧`,
      layout: 'brand-list',
      brand_name: brandName,
      brand_matcher_type: matcherType,
      brand_matcher_value: brand.matcher?.value || brandName,
    };

    const content = `---\n${yaml.dump(frontMatter)}---\n`;

    let shouldWrite = true;
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf-8');
      if (existing === content) {
        shouldWrite = false;
      }
    }

    if (shouldWrite) {
      fs.writeFileSync(filePath, content);
      console.log(`Generated brand page: ${filePath}`);
    }
  }

  // 不要なファイルの削除
  const files = fs.readdirSync(brandContentDir);
  for (const file of files) {
    if (file.endsWith('.md') && !activeSlugs.has(file)) {
      const surplusPath = path.join(brandContentDir, file);
      fs.unlinkSync(surplusPath);
      console.log(`Deleted surplus brand file: ${surplusPath}`);
    }
  }

  console.log(`Successfully synced ${Object.keys(brandData).length} brand(s).`);
}

/**
 * PAAPIキャッシュから親ASIN・バリエーションASINの逆引きマップを生成
 */
function generateAsinVariationsMap(): void {
  console.log('--- ASIN Variations Map Generation ---');
  const cachePath = path.resolve(process.cwd(), 'data/cache/paapi-product-cache.json');
  const outPath = path.resolve(process.cwd(), 'static/data/asin-variations.json');

  if (!fs.existsSync(cachePath)) {
    console.log('No PAAPI cache found, skipping variations map.');
    return;
  }

  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(raw) as Record<string, { data?: { parentAsin?: string; asin?: string } }>;
    const childToParent: Record<string, string> = {};

    for (const [asin, item] of Object.entries(cache)) {
      const parentAsin = item?.data?.parentAsin;
      if (parentAsin && parentAsin !== asin) {
        childToParent[asin] = parentAsin;
      }
    }

    const staticDir = path.dirname(outPath);
    if (!fs.existsSync(staticDir)) {
      fs.mkdirSync(staticDir, { recursive: true });
    }
    fs.writeFileSync(outPath, JSON.stringify(childToParent), 'utf-8');
    console.log(`Generated ASIN variations map (${Object.keys(childToParent).length} mapped items) to ${outPath}`);
  } catch (err) {
    console.warn('Failed to generate ASIN variations map:', err);
  }
}

export function enhanceCategories(): void {
  try {
    console.log('Starting category enhancement...');
    const manager = new CategoryManager(categoryGroupsPath);
    manager.loadCategoryGroups();

    const counter = new ProductCounter(contentPath);
    counter.countProductsByCategory();
    const enhanced = manager.enhanceCategoryGroups(counter);

    manager.exportToJSON(outJsonPath);
    manager.exportToYAML(outYamlPath);

    const parentCategoryDir = path.join(contentPath, 'parent-category');
    manager.syncParentCategoryMarkdown(parentCategoryDir);

    console.log(`Successfully enhanced ${enhanced.length} parent categories and synced markdown files.`);

    // ブランド定義の更新
    updateBrandGroups();
    // ブランドデータの同期
    syncBrandData();
    // ASINバリエーションマップの生成
    generateAsinVariationsMap();
  } catch (e) {
    console.error('Error during category enhancement:', e);
    throw e;
  }
}

if (require.main === module) {
  enhanceCategories();
}
