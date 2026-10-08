#!/usr/bin/env ts-node
/**
 * Generate Pickup Pool Script
 * content/articles/*.md を走査し、全親カテゴリグループから均等に高評価商品（スコア80点以上）を抽出して
 * data/recommendations/pickup-pool.json を生成する。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface PickupPoolItem {
  title: string;
  url: string;
  score: number;
  price: string;
  asin: string;
  category: string;
  group: string;
  priceBucket: string;
  image: string;
  specs?: Record<string, unknown> | undefined;
}

export interface InternalPickupItem extends PickupPoolItem {
  compositeScore: bigint;
}

export interface GeneratePickupPoolOptions {
  articlesDir?: string;
  categoryGroupsPath?: string;
  outputPath?: string;
  maxPerGroup?: number;
  topOverallCount?: number;
}

export function parsePriceNumber(rawPrice: string | number | undefined): number {
  if (rawPrice == null) return 0;
  const normalized = String(rawPrice).replaceAll(',', '');
  const matched = /\d+/.exec(normalized);
  if (!matched) return 0;
  const num = Number(matched[0]);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export function derivePriceBucket(rawPrice: string | number | undefined): string {
  const price = parsePriceNumber(rawPrice);
  if (!price) return 'unknown';
  if (price < 3000) return 'under-3000';
  if (price < 7000) return '3000-6999';
  if (price < 15000) return '7000-14999';
  if (price < 30000) return '15000-29999';
  return '30000-plus';
}

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

interface ArticleFrontMatter {
  title?: string;
  asin?: string;
  score?: number;
  price?: string;
  categories?: string[];
  category?: string;
  last_investigated?: string;
  images?: string[];
  specs?: Record<string, unknown>;
}

export function parseFrontMatter(content: string): ArticleFrontMatter | null {
  const match = FRONT_MATTER_REGEX.exec(content);
  if (!match?.[1]) return null;

  try {
    const loaded = yaml.load(match[1]) as ArticleFrontMatter | null;
    if (loaded && typeof loaded === 'object') {
      return loaded;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractCategory(fm: ArticleFrontMatter): string {
  if (Array.isArray(fm.categories) && fm.categories.length > 0 && typeof fm.categories[0] === 'string') {
    return fm.categories[0].trim();
  }
  if (typeof fm.category === 'string') {
    return fm.category.trim();
  }
  return 'unknown';
}

export function extractFirstImage(fm: ArticleFrontMatter): string {
  if (Array.isArray(fm.images) && fm.images.length > 0 && typeof fm.images[0] === 'string') {
    return fm.images[0].trim();
  }
  return '';
}

export function extractInvestigatedUnix(dateStr?: string): number {
  if (!dateStr) return 0;
  const ts = new Date(dateStr).getTime();
  return Number.isNaN(ts) ? 0 : Math.floor(ts / 1000);
}

export function calculateCompositeScore(score: number, unix: number, hasPrice: boolean, hasImage: boolean): bigint {
  const priceBonus = hasPrice ? 70 : 0;
  const imageBonus = hasImage ? 30 : 0;
  return BigInt(score) * 1000000000000n + BigInt(unix) * 100n + BigInt(priceBonus + imageBonus);
}

export function parsePickupItem(
  content: string,
  filename: string,
  catToGroup: Record<string, string>,
): InternalPickupItem | null {
  const fm = parseFrontMatter(content);
  if (!fm) return null;

  const score = typeof fm.score === 'number' ? fm.score : 0;
  if (score < 80) return null;

  const asin = typeof fm.asin === 'string' ? fm.asin.trim() : path.basename(filename, '.md');
  const title = typeof fm.title === 'string' ? fm.title.trim() : '';
  const category = extractCategory(fm);
  const group = catToGroup[category.toLowerCase()] || 'その他／全般';
  const price = typeof fm.price === 'string' ? fm.price.trim() : '';
  const priceBucket = derivePriceBucket(price);
  const image = extractFirstImage(fm);
  const unix = extractInvestigatedUnix(fm.last_investigated);
  const compositeScore = calculateCompositeScore(score, unix, Boolean(price), Boolean(image));
  const specs = fm.specs && typeof fm.specs === 'object' ? fm.specs : undefined;

  return {
    title,
    url: `/articles/${asin}/`,
    score,
    price,
    asin,
    category,
    group,
    priceBucket,
    image,
    specs,
    compositeScore,
  };
}

export function buildCategoryToGroupMap(categoryGroupsPath: string): Record<string, string> {
  const catToGroup: Record<string, string> = {};
  if (!fs.existsSync(categoryGroupsPath)) {
    return catToGroup;
  }

  try {
    const raw = fs.readFileSync(categoryGroupsPath, 'utf8');
    const data = JSON.parse(raw) as Record<string, { categories?: string[] }>;
    for (const [groupName, groupData] of Object.entries(data)) {
      if (groupData?.categories && Array.isArray(groupData.categories)) {
        for (const cat of groupData.categories) {
          if (typeof cat === 'string') {
            catToGroup[cat.toLowerCase()] = groupName;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`Failed to read categorygroups.json: ${String(err)}`);
  }

  return catToGroup;
}

export function loadCandidateArticles(articlesDir: string, catToGroup: Record<string, string>): InternalPickupItem[] {
  const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md'));
  const candidateItems: InternalPickupItem[] = [];

  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const item = parsePickupItem(content, file, catToGroup);
      if (item) {
        candidateItems.push(item);
      }
    } catch (err) {
      logger.warn(`Failed to process article ${file}: ${String(err)}`);
    }
  }

  // 総合スコア（compositeScore）順にソート
  candidateItems.sort((a, b) => {
    if (b.compositeScore > a.compositeScore) return 1;
    if (b.compositeScore < a.compositeScore) return -1;
    return 0;
  });

  return candidateItems;
}

export function selectPickupPool(
  candidateItems: InternalPickupItem[],
  topOverallCount: number,
  maxPerGroup: number,
): PickupPoolItem[] {
  const selectedAsins = new Set<string>();
  const finalPool: PickupPoolItem[] = [];
  const groupCounts: Record<string, number> = {};

  const addItem = (item: InternalPickupItem): void => {
    if (selectedAsins.has(item.asin)) return;
    selectedAsins.add(item.asin);
    const { compositeScore: _compositeScore, ...poolItem } = item;
    finalPool.push(poolItem);
    groupCounts[item.group] = (groupCounts[item.group] || 0) + 1;
  };

  // 1. 全体上位（殿堂入り）商品を確保
  for (const item of candidateItems.slice(0, topOverallCount)) {
    addItem(item);
  }

  // 2. 各親グループごとに上位商品を確保
  for (const item of candidateItems) {
    const currentCount = groupCounts[item.group] || 0;
    if (currentCount < maxPerGroup) {
      addItem(item);
    }
  }

  return finalPool;
}

export function generatePickupPool(options: GeneratePickupPoolOptions = {}): PickupPoolItem[] {
  const articlesDir = options.articlesDir || path.resolve(process.cwd(), 'content/articles');
  const categoryGroupsPath = options.categoryGroupsPath || path.resolve(process.cwd(), 'data/categorygroups.json');
  const outputPath = options.outputPath || path.resolve(process.cwd(), 'data/recommendations/pickup-pool.json');
  const maxPerGroup = options.maxPerGroup ?? 10;
  const topOverallCount = options.topOverallCount ?? 30;

  if (!fs.existsSync(articlesDir)) {
    logger.warn(`Articles dir not found: ${articlesDir}`);
    return [];
  }

  const catToGroup = buildCategoryToGroupMap(categoryGroupsPath);
  const candidateItems = loadCandidateArticles(articlesDir, catToGroup);
  const finalPool = selectPickupPool(candidateItems, topOverallCount, maxPerGroup);

  // 出力ディレクトリの作成とファイル保存
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(finalPool), 'utf8');
  logger.info(`Generated pickup pool with ${finalPool.length} items to ${outputPath}`);

  return finalPool;
}

if (require.main === module) {
  try {
    const items = generatePickupPool();
    console.log(`Successfully generated pickup-pool.json with ${items.length} items.`);
  } catch (err) {
    console.error('Failed to generate pickup-pool.json:', err);
    process.exit(1);
  }
}
