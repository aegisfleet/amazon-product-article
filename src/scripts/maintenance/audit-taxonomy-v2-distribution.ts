import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import {
  loadProductCategories,
  type ProductCategoryMap,
  type StoredProductCategory,
} from '../../category/store/ProductCategoryStore';
import type { TaxonomyV2 } from '../../category/taxonomy/types';

interface AuditClassification {
  needs_review?: boolean;
  parent_confidence?: number;
}

interface AuditFrontmatter {
  taxonomy_version?: number;
  category_parent?: string;
  category_child?: string;
  amazon_category?: string;
  classification?: AuditClassification;
  asin?: string;
  title?: string;
}

interface AuditStats {
  v2Count: number;
  reviewCount: number;
  othersParentCount: number;
  othersChildCount: number;
  parentDistribution: Map<string, number>;
  childDistribution: Map<string, number>;
  parentConfidenceSum: Map<string, { sum: number; count: number }>;
  cameraFromBaby: string[];
  contactFromMakeup: string[];
}

interface ChildCountEntry {
  slug: string;
  name: string;
  count: number;
  isZz: boolean;
  isSmallNonZz: boolean;
}

interface ParentAuditEntry {
  parentSlug: string;
  parentName: string;
  totalCount: number;
  zzCount: number;
  zzRate: number;
  fallbackCount: number;
  children: ChildCountEntry[];
}

interface SmallChildHighlight {
  parentSlug: string;
  parentName: string;
  childSlug: string;
  childName: string;
  count: number;
}

interface ZzBreakdownReport {
  totalZz: number;
  groupA: {
    total: number;
    byParent: Record<string, number>;
  };
  groupB: {
    total: number;
    byParent: Record<string, number>;
    topRunnerUps: Array<{ slug: string; count: number }>;
  };
  groupC: {
    total: number;
    byParent: Record<string, number>;
    topAmazonCategories: Array<{ category: string; count: number }>;
    byParentTopCategories: Record<string, Array<{ category: string; count: number }>>;
  };
  otherSource: number;
}

interface AuditReportJson {
  generatedAt: string;
  storeSummary: {
    totalProducts: number;
    totalParents: number;
    totalChildren: number;
    totalZzCount: number;
    totalZzRate: number;
    totalFallbackCount: number;
    othersParentCount: number;
    smallNonZzCount: number;
  };
  parentBreakdown: ParentAuditEntry[];
  smallNonZzChildren: SmallChildHighlight[];
  zzGroups: ZzBreakdownReport;
  articlesSummary: {
    totalArticles: number;
    v2Count: number;
    reviewCount: number;
    othersParentCount: number;
    othersChildCount: number;
  };
}

const SMALL_CHILD_THRESHOLD = 10;

function parseOutputArg(args: string[]): string {
  const outIdx = args.indexOf('--out');
  if (outIdx !== -1) {
    const val = args[outIdx + 1];
    if (val) {
      return path.resolve(process.cwd(), val);
    }
  }
  return path.resolve(process.cwd(), 'tmp/zz-audit-report.json');
}

function createEmptyStats(): AuditStats {
  return {
    v2Count: 0,
    reviewCount: 0,
    othersParentCount: 0,
    othersChildCount: 0,
    parentDistribution: new Map(),
    childDistribution: new Map(),
    parentConfidenceSum: new Map(),
    cameraFromBaby: [],
    contactFromMakeup: [],
  };
}

function recordArticleMetrics(d: AuditFrontmatter, file: string, stats: AuditStats): void {
  if (d.taxonomy_version !== 2) {
    return;
  }

  stats.v2Count++;
  const p = d.category_parent || 'unknown';
  const c = d.category_child || 'unknown';
  const amazonCat = d.amazon_category || '';

  stats.parentDistribution.set(p, (stats.parentDistribution.get(p) || 0) + 1);
  stats.childDistribution.set(`${p} › ${c}`, (stats.childDistribution.get(`${p} › ${c}`) || 0) + 1);

  if (p === 'others') stats.othersParentCount++;
  if (c.startsWith('zz-')) stats.othersChildCount++;

  if (d.classification?.needs_review) {
    stats.reviewCount++;
  }

  if (typeof d.classification?.parent_confidence === 'number') {
    const current = stats.parentConfidenceSum.get(p) || { sum: 0, count: 0 };
    current.sum += d.classification.parent_confidence;
    current.count += 1;
    stats.parentConfidenceSum.set(p, current);
  }

  const itemAsin = d.asin || path.basename(file, '.md');
  const itemTitle = (d.title || itemAsin).slice(0, 30);

  if (p === 'camera-video' && amazonCat.includes('ベビー')) {
    stats.cameraFromBaby.push(`${itemAsin}: ${itemTitle}`);
  }
  if (
    p === 'healthcare-appliances' &&
    (amazonCat.includes('メイク') || amazonCat.includes('ネイル') || c.includes('contact'))
  ) {
    stats.contactFromMakeup.push(`${itemAsin}: ${itemTitle}`);
  }
}

function incrementRecord(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function mapToSortedEntries(counts: Map<string, number>, limit: number): Array<{ key: string; count: number }> {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function collectZzGroups(store: ProductCategoryMap): ZzBreakdownReport {
  let totalZz = 0;
  let groupATotal = 0;
  let groupBTotal = 0;
  let groupCTotal = 0;
  let otherSource = 0;

  const groupAByParent: Record<string, number> = {};
  const groupBByParent: Record<string, number> = {};
  const groupCByParent: Record<string, number> = {};
  const runnerUpCounts = new Map<string, number>();
  const groupCAmazonCounts = new Map<string, number>();
  const groupCByParentAmazon = new Map<string, Map<string, number>>();

  for (const item of Object.values(store)) {
    if (!item.category_child.startsWith('zz-')) {
      continue;
    }
    totalZz++;
    const parent = item.category_parent || 'unknown';
    const source = item.classification?.source;
    const childConf = item.classification?.child_confidence ?? 0;

    if (source === 'fallback-map') {
      groupATotal++;
      incrementRecord(groupAByParent, parent);
      continue;
    }

    if (source === 'gemini-decision-1' && childConf < 0.7) {
      groupBTotal++;
      incrementRecord(groupBByParent, parent);
      const runnerUp = item.classification?.child_runner_up?.slug;
      if (runnerUp) {
        runnerUpCounts.set(runnerUp, (runnerUpCounts.get(runnerUp) ?? 0) + 1);
      }
      continue;
    }

    if (source === 'gemini-decision-1' && childConf >= 0.7) {
      groupCTotal++;
      incrementRecord(groupCByParent, parent);
      const amazonCat = item.amazon_category?.trim() || '(未設定)';
      groupCAmazonCounts.set(amazonCat, (groupCAmazonCounts.get(amazonCat) ?? 0) + 1);
      const parentCatMap = groupCByParentAmazon.get(parent) ?? new Map<string, number>();
      parentCatMap.set(amazonCat, (parentCatMap.get(amazonCat) ?? 0) + 1);
      groupCByParentAmazon.set(parent, parentCatMap);
      continue;
    }

    otherSource++;
  }

  const byParentTopCategories: Record<string, Array<{ category: string; count: number }>> = {};
  for (const [parent, catMap] of groupCByParentAmazon.entries()) {
    byParentTopCategories[parent] = mapToSortedEntries(catMap, 10).map((e) => ({
      category: e.key,
      count: e.count,
    }));
  }

  return {
    totalZz,
    groupA: { total: groupATotal, byParent: groupAByParent },
    groupB: {
      total: groupBTotal,
      byParent: groupBByParent,
      topRunnerUps: mapToSortedEntries(runnerUpCounts, 20).map((e) => ({
        slug: e.key,
        count: e.count,
      })),
    },
    groupC: {
      total: groupCTotal,
      byParent: groupCByParent,
      topAmazonCategories: mapToSortedEntries(groupCAmazonCounts, 30).map((e) => ({
        category: e.key,
        count: e.count,
      })),
      byParentTopCategories,
    },
    otherSource,
  };
}

function buildParentBreakdown(
  taxonomy: TaxonomyV2,
  store: ProductCategoryMap,
): {
  parentBreakdown: ParentAuditEntry[];
  smallNonZzChildren: SmallChildHighlight[];
  totalFallbackCount: number;
  totalZzCount: number;
  othersParentCount: number;
} {
  const childCounts = new Map<string, number>();
  const parentCounts = new Map<string, number>();
  const parentZzCounts = new Map<string, number>();
  const parentFbCounts = new Map<string, number>();

  let totalFallbackCount = 0;
  let totalZzCount = 0;
  let othersParentCount = 0;

  for (const entry of Object.values(store)) {
    const p = entry.category_parent;
    const c = entry.category_child;
    parentCounts.set(p, (parentCounts.get(p) ?? 0) + 1);
    childCounts.set(c, (childCounts.get(c) ?? 0) + 1);
    if (p === 'others') othersParentCount++;
    if (c.startsWith('zz-')) {
      totalZzCount++;
      parentZzCounts.set(p, (parentZzCounts.get(p) ?? 0) + 1);
    }
    if (entry.classification?.source === 'fallback-map') {
      totalFallbackCount++;
      parentFbCounts.set(p, (parentFbCounts.get(p) ?? 0) + 1);
    }
  }

  const parentBreakdown: ParentAuditEntry[] = [];
  const smallNonZzChildren: SmallChildHighlight[] = [];

  for (const parent of taxonomy.parents) {
    const totalCount = parentCounts.get(parent.slug) ?? 0;
    const zzCount = parentZzCounts.get(parent.slug) ?? 0;
    const zzRate = totalCount > 0 ? Number(((zzCount / totalCount) * 100).toFixed(1)) : 0;
    const fallbackCount = parentFbCounts.get(parent.slug) ?? 0;

    const children: ChildCountEntry[] = parent.children.map((child) => {
      const count = childCounts.get(child.slug) ?? 0;
      const isZz = child.slug.startsWith('zz-');
      const isSmallNonZz = !isZz && parent.slug !== 'others' && count < SMALL_CHILD_THRESHOLD;
      if (isSmallNonZz) {
        smallNonZzChildren.push({
          parentSlug: parent.slug,
          parentName: parent.name,
          childSlug: child.slug,
          childName: child.name,
          count,
        });
      }
      return {
        slug: child.slug,
        name: child.name,
        count,
        isZz,
        isSmallNonZz,
      };
    });

    parentBreakdown.push({
      parentSlug: parent.slug,
      parentName: parent.name,
      totalCount,
      zzCount,
      zzRate,
      fallbackCount,
      children,
    });
  }

  smallNonZzChildren.sort((a, b) => a.count - b.count || a.childSlug.localeCompare(b.childSlug));

  return {
    parentBreakdown,
    smallNonZzChildren,
    totalFallbackCount,
    totalZzCount,
    othersParentCount,
  };
}

function printParentAndChildSummary(report: AuditReportJson): void {
  const { storeSummary, parentBreakdown, smallNonZzChildren, zzGroups } = report;

  console.log('\n======================================================');
  console.log(' タクソノミー v2 全体分布・zz-* 詳細監査レポート');
  console.log('======================================================');
  console.log(`登録商品数 (product-categories.json): ${storeSummary.totalProducts} 件`);
  console.log(`親カテゴリ数: ${storeSummary.totalParents} | 子カテゴリ数: ${storeSummary.totalChildren}`);
  console.log(
    `子「その他 (zz-*)」滞留数: ${storeSummary.totalZzCount} / ${storeSummary.totalProducts} 件 (${storeSummary.totalZzRate.toFixed(1)}%)`,
  );
  console.log(`fallback-map 由来総数: ${storeSummary.totalFallbackCount} 件`);
  console.log(`親「others」滞留数: ${storeSummary.othersParentCount} 件`);
  console.log(`10件未満 (noindex) の非 zz-* 子カテゴリ数: ${storeSummary.smallNonZzCount} 個`);

  console.log('\n------------------------------------------------------');
  console.log(' 親カテゴリ別 zz-* 率 & 子カテゴリ内訳');
  console.log('------------------------------------------------------');
  const sortedByZzRate = [...parentBreakdown].sort((a, b) => b.zzRate - a.zzRate);
  for (const p of sortedByZzRate) {
    const warnMark = p.zzRate > 15 ? '⚠️ ' : '   ';
    console.log(
      `${warnMark}${p.parentSlug.padEnd(28)} (${p.parentName}): ${String(p.totalCount).padStart(4)}件 | zz: ${String(p.zzCount).padStart(3)}件 (${String(p.zzRate.toFixed(1)).padStart(5)}%) | fb: ${String(p.fallbackCount).padStart(3)}件`,
    );
    const childDetails = p.children
      .map((c) => {
        const tag = c.isSmallNonZz ? '[<10!]' : '';
        return `${c.slug}:${c.count}${tag}`;
      })
      .join(', ');
    console.log(`      └─ ${childDetails}`);
  }

  console.log('\n------------------------------------------------------');
  console.log(' 10件未満 (noindex) の非 zz-* 子カテゴリ一覧');
  console.log('------------------------------------------------------');
  if (smallNonZzChildren.length === 0) {
    console.log('なし (0個)');
  } else {
    for (const s of smallNonZzChildren) {
      console.log(`- ${s.parentSlug} › ${s.childSlug} (${s.childName}): ${s.count} 件`);
    }
  }

  console.log('\n------------------------------------------------------');
  console.log(' zz-* 滞留商品の原因別内訳 (群A / 群B / 群C)');
  console.log('------------------------------------------------------');
  console.log(`zz-* 合計: ${zzGroups.totalZz} 件`);
  console.log(`- 群A (fallback-map):                     ${zzGroups.groupA.total} 件`);
  console.log(`- 群B (gemini-decision-1, conf < 0.70):   ${zzGroups.groupB.total} 件`);
  console.log(`- 群C (gemini-decision-1, conf >= 0.70):  ${zzGroups.groupC.total} 件`);
  if (zzGroups.otherSource > 0) {
    console.log(`- その他ソース:                           ${zzGroups.otherSource} 件`);
  }

  console.log('\n  [群B 上位 child_runner_up (次点候補)]');
  for (const r of zzGroups.groupB.topRunnerUps.slice(0, 12)) {
    console.log(`    - ${r.slug.padEnd(32)}: ${r.count} 件`);
  }

  console.log('\n  [群C 上位 amazon_category クラスタ]');
  for (const c of zzGroups.groupC.topAmazonCategories.slice(0, 15)) {
    console.log(`    - ${c.category.padEnd(32)}: ${c.count} 件`);
  }
}

function saveReportJson(outPath: string, report: AuditReportJson): void {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\n監査レポートJSONを保存しました: ${outPath}`);
}

function collectArticleStats(): { total: number; stats: AuditStats } {
  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const files = fs.existsSync(articlesDir) ? fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md')) : [];
  const stats = createEmptyStats();

  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    recordArticleMetrics(parsed.data, file, stats);
  }
  return { total: files.length, stats };
}

function printArticleSummary(total: number, stats: AuditStats): void {
  const { v2Count, reviewCount, othersParentCount, othersChildCount, cameraFromBaby, contactFromMakeup } = stats;
  const safeDiv = (num: number): string => (v2Count > 0 ? ((num / v2Count) * 100).toFixed(1) : '0.0');

  console.log('\n------------------------------------------------------');
  console.log(' 記事フロントマター分布サマリー (content/articles/*.md)');
  console.log('------------------------------------------------------');
  console.log(`総記事数: ${total} 件 | v2付与: ${v2Count} 件`);
  console.log(`自動確定率: ${safeDiv(v2Count - reviewCount)}% (${v2Count - reviewCount} 件)`);
  console.log(`要確認 (needs_review) 率: ${safeDiv(reviewCount)}% (${reviewCount} 件)`);
  console.log(
    `記事側 親「others」: ${othersParentCount} 件 | 子「zz-*」: ${othersChildCount} 件 (${safeDiv(othersChildCount)}%)`,
  );
  console.log(
    `Amazon BrowseNode 誤配是正: 防犯カメラ=${cameraFromBaby.length} 件, コンタクト=${contactFromMakeup.length} 件`,
  );
  console.log('======================================================\n');
}

function countTotalChildren(taxonomy: TaxonomyV2): number {
  return taxonomy.parents.reduce((sum, p) => sum + p.children.length, 0);
}

function auditDistribution(): void {
  const outPath = parseOutputArg(process.argv.slice(2));
  const taxonomyPath = path.resolve(process.cwd(), 'data/taxonomy-v2.json');
  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8')) as TaxonomyV2;
  const store: Record<string, StoredProductCategory> = loadProductCategories();

  const totalProducts = Object.keys(store).length;
  const { parentBreakdown, smallNonZzChildren, totalFallbackCount, totalZzCount, othersParentCount } =
    buildParentBreakdown(taxonomy, store);
  const zzGroups = collectZzGroups(store);
  const { total: totalArticles, stats: articleStats } = collectArticleStats();

  const report: AuditReportJson = {
    generatedAt: new Date().toISOString(),
    storeSummary: {
      totalProducts,
      totalParents: taxonomy.parents.length,
      totalChildren: countTotalChildren(taxonomy),
      totalZzCount,
      totalZzRate: totalProducts > 0 ? Number(((totalZzCount / totalProducts) * 100).toFixed(2)) : 0,
      totalFallbackCount,
      othersParentCount,
      smallNonZzCount: smallNonZzChildren.length,
    },
    parentBreakdown,
    smallNonZzChildren,
    zzGroups,
    articlesSummary: {
      totalArticles,
      v2Count: articleStats.v2Count,
      reviewCount: articleStats.reviewCount,
      othersParentCount: articleStats.othersParentCount,
      othersChildCount: articleStats.othersChildCount,
    },
  };

  printParentAndChildSummary(report);
  printArticleSummary(totalArticles, articleStats);
  saveReportJson(outPath, report);
}

auditDistribution();
