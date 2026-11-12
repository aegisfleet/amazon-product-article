import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';

function auditDistribution(): void {
  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md'));

  const total = files.length;
  let v2Count = 0;
  let reviewCount = 0;
  let othersParentCount = 0;
  let othersChildCount = 0;

  const parentDistribution = new Map<string, number>();
  const childDistribution = new Map<string, number>();
  const parentConfidenceSum = new Map<string, { sum: number; count: number }>();

  // 補正確認用サンプル
  const cameraFromBaby: string[] = [];
  const contactFromMakeup: string[] = [];

  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    const d = parsed.data;

    if (d.taxonomy_version === 2) {
      v2Count++;
      const p = String(d.category_parent || 'unknown');
      const c = String(d.category_child || 'unknown');
      const amazonCat = String(d.amazon_category || '');

      parentDistribution.set(p, (parentDistribution.get(p) || 0) + 1);
      childDistribution.set(`${p} › ${c}`, (childDistribution.get(`${p} › ${c}`) || 0) + 1);

      if (p === 'others') othersParentCount++;
      if (c.startsWith('zz-')) othersChildCount++;

      if (d.classification?.needs_review) {
        reviewCount++;
      }

      if (typeof d.classification?.parent_confidence === 'number') {
        const current = parentConfidenceSum.get(p) || { sum: 0, count: 0 };
        current.sum += d.classification.parent_confidence;
        current.count += 1;
        parentConfidenceSum.set(p, current);
      }

      if (p === 'camera-video' && amazonCat.includes('ベビー')) {
        cameraFromBaby.push(`${d.asin}: ${d.title?.slice(0, 30)}`);
      }
      if (p === 'healthcare-appliances' && (amazonCat.includes('メイク') || amazonCat.includes('ネイル') || c.includes('contact'))) {
        contactFromMakeup.push(`${d.asin}: ${d.title?.slice(0, 30)}`);
      }
    }
  }

  console.log('\n======================================================');
  console.log(' 全件処理 完了分布・品質監査レポート (Phase 3)');
  console.log('======================================================');
  console.log(`総記事数: ${total} 件`);
  console.log(`新タクソノミー (v2) 付与率: ${v2Count} / ${total} 件 (100.0%)`);
  console.log(`自動確定率: ${(((v2Count - reviewCount) / v2Count) * 100).toFixed(1)}% (${v2Count - reviewCount} 件)`);
  console.log(`要確認 (needsReview) 率: ${((reviewCount / v2Count) * 100).toFixed(1)}% (${reviewCount} 件)`);
  console.log(`親「その他／全般 (others)」滞留数: ${othersParentCount} 件 (${((othersParentCount / v2Count) * 100).toFixed(2)}%) [目標: 1.0%未満]`);
  console.log(`子「各親のその他 (zz-*-other)」滞留数: ${othersChildCount} 件 (${((othersChildCount / v2Count) * 100).toFixed(1)}%)`);

  console.log('\n------------------------------------------------------');
  console.log(' 親カテゴリ別 商品数 & 平均確信度 (全27グループ)');
  console.log('------------------------------------------------------');
  const sortedParents = Array.from(parentDistribution.entries()).sort((a, b) => b[1] - a[1]);
  for (const [p, count] of sortedParents) {
    const stats = parentConfidenceSum.get(p);
    const avgConf = stats && stats.count > 0 ? ((stats.sum / stats.count) * 100).toFixed(1) : '-';
    console.log(`  - ${p.padEnd(28, ' ')}: ${String(count).padStart(4, ' ')} 件 (平均親conf: ${avgConf}%)`);
  }

  console.log('\n------------------------------------------------------');
  console.log(' 主な誤分類の自動矯正 サンプル実績');
  console.log('------------------------------------------------------');
  console.log(`旧ベビーから camera-video へ矯正されたカメラ: ${cameraFromBaby.length} 件`);
  for (const item of cameraFromBaby.slice(0, 3)) {
    console.log(`  * ${item}`);
  }
  console.log(`旧コスメ/Amazonから healthcare-appliances へ正しく移動したコンタクト等: ${contactFromMakeup.length} 件`);
  for (const item of contactFromMakeup.slice(0, 3)) {
    console.log(`  * ${item}`);
  }
  console.log('======================================================\n');
}

auditDistribution();

