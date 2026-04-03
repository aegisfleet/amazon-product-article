import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { CategoryManager } from '../category/CategoryManager';
import { ProductCounter } from '../category/ProductCounter';

const categoryGroupsPath = path.resolve(process.cwd(), 'data/categorygroups.json');
const contentPath = path.resolve(process.cwd(), 'content');
const outJsonPath = path.resolve(process.cwd(), 'static/data/categorygroups.json');
const outYamlPath = path.resolve(process.cwd(), 'data/categories.yml');

const brandGroupsSourcePath = path.resolve(process.cwd(), 'data/brandgroups.json');
const brandGroupsStaticPath = path.resolve(process.cwd(), 'static/data/brandgroups.json');
const brandContentDir = path.resolve(contentPath, 'brand');

interface BrandMatcher {
  type: string;
  value: string;
}

interface BrandEntry {
  slug: string;
  icon?: string;
  description?: string;
  matcher?: BrandMatcher;
}

/**
 * ブランドデータの同期処理:
 * 1. data/brandgroups.json → static/data/brandgroups.json へコピー
 * 2. content/brand/*.md の自動生成・削除
 */
function syncBrandData(): void {
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
  const brandData: Record<string, BrandEntry> = JSON.parse(rawData);

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

function main(): void {
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

    // ブランドデータの同期
    syncBrandData();
  } catch (e) {
    console.error('Error during category enhancement:', e);
    process.exit(1);
  }
}

main();

