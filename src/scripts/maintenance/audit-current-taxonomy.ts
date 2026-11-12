import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';

interface CategoryGroup {
  slug: string;
  categories: string[];
  icon: string;
}

function runAudit(): void {
  const articlesDir = path.resolve(process.cwd(), 'content/articles');
  const catGroupsPath = path.resolve(process.cwd(), 'data/categorygroups.json');

  const catGroups: Record<string, CategoryGroup> = JSON.parse(fs.readFileSync(catGroupsPath, 'utf8'));

  // 1. 各記事からカテゴリ情報を抽出
  const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.md'));
  const totalArticles = files.length;

  const childCounts = new Map<string, number>();
  const parentCounts = new Map<string, number>();
  const articleParentMap = new Map<string, string>(); // child -> parent

  // parent mapping 逆引き
  for (const [parentName, group] of Object.entries(catGroups)) {
    parentCounts.set(parentName, 0);
    for (const child of group.categories) {
      articleParentMap.set(child, parentName);
    }
  }

  let unmappedCount = 0;

  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    const data = parsed.data;

    const cats: string[] = Array.isArray(data.categories) ? data.categories : data.category ? [data.category] : [];

    const primaryCat = cats[0] || '未分類';
    childCounts.set(primaryCat, (childCounts.get(primaryCat) || 0) + 1);

    const parent = articleParentMap.get(primaryCat);
    if (parent) {
      parentCounts.set(parent, (parentCounts.get(parent) || 0) + 1);
    } else {
      unmappedCount++;
    }
  }

  // 2. 統計の計算
  const childCountValues = Array.from(childCounts.values()).sort((a, b) => a - b);
  const totalUniqueChildren = childCounts.size;
  const count1 = childCountValues.filter((c) => c === 1).length;
  const count5OrLess = childCountValues.filter((c) => c <= 5).length;
  const count10OrLess = childCountValues.filter((c) => c <= 10).length;

  const midIdx = Math.floor(totalUniqueChildren / 2);
  const median =
    totalUniqueChildren % 2 === 0
      ? ((childCountValues[midIdx - 1] ?? 0) + (childCountValues[midIdx] ?? 0)) / 2
      : (childCountValues[midIdx] ?? 0);

  const avg = totalArticles / totalUniqueChildren;

  console.log('\n======================================================');
  console.log(' Phase 0: 現状カテゴリ体系 実測レポート');
  console.log('======================================================');
  console.log(`記事総数: ${totalArticles} 件`);
  console.log(`子カテゴリ（categories）種類数: ${totalUniqueChildren} 種`);
  console.log(`商品 1件だけの子カテゴリ: ${count1} 種 (${((count1 / totalUniqueChildren) * 100).toFixed(1)}%)`);
  console.log(
    `商品 5件以下の子カテゴリ: ${count5OrLess} 種 (${((count5OrLess / totalUniqueChildren) * 100).toFixed(1)}%)`,
  );
  console.log(
    `商品 10件以下の子カテゴリ: ${count10OrLess} 種 (${((count10OrLess / totalUniqueChildren) * 100).toFixed(1)}%)`,
  );
  console.log(`子カテゴリあたり商品数: 中央値 ${median} 件 / 平均 ${avg.toFixed(2)} 件`);
  console.log(`categorygroups.json 未紐付け記事: ${unmappedCount} 件`);

  console.log('\n------------------------------------------------------');
  console.log(' 親カテゴリ別 商品数 & 既存スラッグ一覧 (現行31グループ)');
  console.log('------------------------------------------------------');

  const sortedParents = Object.entries(catGroups).sort(
    (a, b) => (parentCounts.get(b[0]) || 0) - (parentCounts.get(a[0]) || 0),
  );

  for (const [name, group] of sortedParents) {
    const count = parentCounts.get(name) || 0;
    const definedChildren = group.categories.length;
    console.log(
      `${group.icon || '  '} ${name.padEnd(20, ' ')} | slug: ${group.slug.padEnd(26, ' ')} | 商品: ${String(count).padStart(4, ' ')} 件 | 定義子: ${String(definedChildren).padStart(4, ' ')} 種`,
    );
  }
  console.log('======================================================\n');
}

runAudit();
