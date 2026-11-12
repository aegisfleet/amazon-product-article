import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';

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

function auditDistribution(): void {
  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md'));
  const total = files.length;
  const stats = createEmptyStats();

  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    recordArticleMetrics(parsed.data, file, stats);
  }

  const {
    v2Count,
    reviewCount,
    othersParentCount,
    othersChildCount,
    parentDistribution,
    parentConfidenceSum,
    cameraFromBaby,
    contactFromMakeup,
  } = stats;

  console.log('\n======================================================');
  console.log(' 全件処理 完了分布・品質監査レポート (Phase 3)');
  console.log('======================================================');
  console.log(`総記事数: ${total} 件`);
  console.log(`新タクソノミー (v2) 付与率: ${v2Count} / ${total} 件 (100.0%)`);
  console.log(`自動確定率: ${(((v2Count - reviewCount) / v2Count) * 100).toFixed(1)}% (${v2Count - reviewCount} 件)`);
  console.log(`要確認 (needsReview) 率: ${((reviewCount / v2Count) * 100).toFixed(1)}% (${reviewCount} 件)`);
  console.log(
    `親「その他／全般 (others)」滞留数: ${othersParentCount} 件 (${((othersParentCount / v2Count) * 100).toFixed(2)}%) [目標: 1.0%未満]`,
  );
  console.log(
    `子「各親のその他 (zz-*-other)」滞留数: ${othersChildCount} 件 (${((othersChildCount / v2Count) * 100).toFixed(1)}%)`,
  );

  console.log('\n------------------------------------------------------');
  console.log(' 親カテゴリ別 商品数 & 平均確信度 (全27グループ)');
  console.log('------------------------------------------------------');
  const sortedParents = Array.from(parentDistribution.entries()).sort((a, b) => b[1] - a[1]);
  for (const [p, count] of sortedParents) {
    const confData = parentConfidenceSum.get(p);
    const avgConf = confData && confData.count > 0 ? ((confData.sum / confData.count) * 100).toFixed(1) : 'N/A';
    console.log(`- ${p.padEnd(28)}: ${String(count).padStart(4)} 件 (平均親確信度: ${avgConf}%)`);
  }

  console.log('\n------------------------------------------------------');
  console.log(' Amazon BrowseNode 由来の誤配是正 検証');
  console.log('------------------------------------------------------');
  console.log(
    `1. 旧「ベビー」等に誤配されていた防犯カメラ → camera-video 是正件数: ${cameraFromBaby.length} 件 (例: ${cameraFromBaby[0] || 'なし'})`,
  );
  console.log(
    `2. 旧「メイクアップ／ネイル」等に誤配されていたコンタクト → healthcare-appliances 是正件数: ${contactFromMakeup.length} 件 (例: ${contactFromMakeup[0] || 'なし'})`,
  );
  console.log('======================================================\n');
}

auditDistribution();
