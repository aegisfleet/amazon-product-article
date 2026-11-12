import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaxonomyV2 } from '../../category/taxonomy/types';

interface LegacyMapEntry {
  parent_slug: string;
  child_slug: string;
}

interface CategoryGroup {
  slug: string;
  categories: string[];
}

function generateLegacyMap(): void {
  const taxonomyPath = path.resolve(process.cwd(), 'data/taxonomy-v2.json');
  const catGroupsPath = path.resolve(process.cwd(), 'data/categorygroups.json');
  const outputPath = path.resolve(process.cwd(), 'data/legacy-category-map.json');

  const taxonomy: TaxonomyV2 = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
  const catGroups: Record<string, CategoryGroup> = JSON.parse(fs.readFileSync(catGroupsPath, 'utf8'));

  const map: Record<string, LegacyMapEntry> = {};

  // 1. taxonomy-v2 の明示的 legacy_names をマッピング（最優先）
  for (const parent of taxonomy.parents) {
    for (const child of parent.children) {
      if (child.legacy_names) {
        for (const legacy of child.legacy_names) {
          map[legacy] = {
            parent_slug: parent.slug,
            child_slug: child.slug,
          };
        }
      }
    }
  }

  // 2. 旧 categorygroups.json の各カテゴリ文字列をフォールバック紐付け
  // 親スラッグのマッピング
  const oldSlugToNewParent = new Map<string, (typeof taxonomy.parents)[0]>();
  for (const parent of taxonomy.parents) {
    oldSlugToNewParent.set(parent.slug, parent);
    if (parent.legacy_slugs) {
      for (const oldSlug of parent.legacy_slugs) {
        oldSlugToNewParent.set(oldSlug, parent);
      }
    }
  }

  for (const [_, group] of Object.entries(catGroups)) {
    const targetParent = oldSlugToNewParent.get(group.slug) || taxonomy.parents.find((p) => p.slug === 'others');
    if (!targetParent) continue;

    // targetParent 配下のフォールバック子 (zz-*-other または general-uncategorized)
    const fallbackChild =
      targetParent.children.find((c) => c.slug.startsWith('zz-')) ||
      targetParent.children[targetParent.children.length - 1];

    if (!fallbackChild) continue;

    for (const oldCat of group.categories) {
      // 既に高精度な mapping が入っていなければフォールバック設定
      if (!map[oldCat]) {
        map[oldCat] = {
          parent_slug: targetParent.slug,
          child_slug: fallbackChild.slug,
        };
      }
    }
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  console.log(`[SUCCESS] legacy-category-map.json を生成しました: ${outputPath}`);
  console.log(`登録マッピング件数: ${Object.keys(map).length}`);
}

generateLegacyMap();
