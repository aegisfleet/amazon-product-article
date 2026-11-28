import type { ProductCategoryMap } from '../store/ProductCategoryStore';
import type { TaxonomyV2 } from './types';

export interface MappedCategoryInfo {
  parentSlug: string;
  childSlug: string;
  parentName: string;
  childName: string;
}

export interface AmazonCategoryMappingStats {
  totalStoredEntries: number;
  entriesWithAmazonCategory: number;
  unresolvedEntries: number;
  distinctAmazonCategories: number;
  mappedExactChildCount: number;
  mappedParentFallbackCount: number;
  ambiguousCount: number;
}

export interface AmazonCategoryMappingResult {
  map: Map<string, MappedCategoryInfo>;
  stats: AmazonCategoryMappingStats;
}

export interface BuildAmazonCategoryMappingOptions {
  /** 最頻カテゴリの占有率がこの値未満の場合は曖昧とみなす（既定: 0.6） */
  minConfidence?: number;
}

interface ParentMeta {
  slug: string;
  name: string;
  index: number;
  zzChildSlug: string;
  zzChildName: string;
}

interface ChildMeta {
  slug: string;
  name: string;
  parentSlug: string;
  parentName: string;
  parentIndex: number;
  childIndex: number;
}

interface TaxonomyIndex {
  parentsBySlug: Map<string, ParentMeta>;
  childrenBySlug: Map<string, ChildMeta>;
  parentLegacyToSlug: Map<string, string>;
}

function buildTaxonomyIndex(taxonomy: TaxonomyV2): TaxonomyIndex {
  const parentsBySlug = new Map<string, ParentMeta>();
  const childrenBySlug = new Map<string, ChildMeta>();
  const parentLegacyToSlug = new Map<string, string>();

  const parents = Array.isArray(taxonomy?.parents) ? taxonomy.parents : [];
  for (let pIdx = 0; pIdx < parents.length; pIdx++) {
    const parent = parents[pIdx];
    if (!parent?.slug || !parent?.name) continue;

    const children = Array.isArray(parent.children) ? parent.children : [];
    const zzChild = children.find((c) => c.slug.startsWith('zz-'));
    parentsBySlug.set(parent.slug, {
      slug: parent.slug,
      name: parent.name,
      index: pIdx,
      zzChildSlug: zzChild?.slug ?? '',
      zzChildName: zzChild?.name ?? '',
    });

    if (Array.isArray(parent.legacy_slugs)) {
      for (const legacySlug of parent.legacy_slugs) {
        if (legacySlug && !parentLegacyToSlug.has(legacySlug)) {
          parentLegacyToSlug.set(legacySlug, parent.slug);
        }
      }
    }

    for (let cIdx = 0; cIdx < children.length; cIdx++) {
      const child = children[cIdx];
      if (!child?.slug || !child?.name) continue;
      childrenBySlug.set(child.slug, {
        slug: child.slug,
        name: child.name,
        parentSlug: parent.slug,
        parentName: parent.name,
        parentIndex: pIdx,
        childIndex: cIdx,
      });
    }
  }

  return { parentsBySlug, childrenBySlug, parentLegacyToSlug };
}

function resolveTaxonomyPair(
  rawParent: string | undefined,
  rawChild: string | undefined,
  index: TaxonomyIndex,
): { parentSlug: string; childSlug: string } | null {
  const childSlug = typeof rawChild === 'string' ? rawChild.trim() : '';
  if (childSlug) {
    const childMeta = index.childrenBySlug.get(childSlug);
    if (childMeta) {
      return { parentSlug: childMeta.parentSlug, childSlug: childMeta.slug };
    }
  }

  const parentSlugRaw = typeof rawParent === 'string' ? rawParent.trim() : '';
  if (!parentSlugRaw) return null;

  const resolvedParentSlug = index.parentsBySlug.has(parentSlugRaw)
    ? parentSlugRaw
    : index.parentLegacyToSlug.get(parentSlugRaw);
  if (!resolvedParentSlug) return null;

  const parentMeta = index.parentsBySlug.get(resolvedParentSlug);
  if (!parentMeta) return null;

  return { parentSlug: parentMeta.slug, childSlug: parentMeta.zzChildSlug };
}

function compareChildKeys(aKey: string, bKey: string, index: TaxonomyIndex): number {
  const [, aChildSlug = ''] = aKey.split('\0');
  const [, bChildSlug = ''] = bKey.split('\0');
  const aMeta = index.childrenBySlug.get(aChildSlug);
  const bMeta = index.childrenBySlug.get(bChildSlug);
  const aParentIdx = aMeta?.parentIndex ?? Number.MAX_SAFE_INTEGER;
  const bParentIdx = bMeta?.parentIndex ?? Number.MAX_SAFE_INTEGER;
  if (aParentIdx !== bParentIdx) return aParentIdx - bParentIdx;
  const aChildIdx = aMeta?.childIndex ?? Number.MAX_SAFE_INTEGER;
  const bChildIdx = bMeta?.childIndex ?? Number.MAX_SAFE_INTEGER;
  if (aChildIdx !== bChildIdx) return aChildIdx - bChildIdx;
  return aKey.localeCompare(bKey);
}

function compareParentSlugs(aSlug: string, bSlug: string, index: TaxonomyIndex): number {
  const aIdx = index.parentsBySlug.get(aSlug)?.index ?? Number.MAX_SAFE_INTEGER;
  const bIdx = index.parentsBySlug.get(bSlug)?.index ?? Number.MAX_SAFE_INTEGER;
  if (aIdx !== bIdx) return aIdx - bIdx;
  return aSlug.localeCompare(bSlug);
}

/**
 * `data/product-categories.json` と `data/taxonomy-v2.json` から、
 * Amazon カテゴリ名 → サイトカテゴリ（親・子）の対応表を動的に構築する。
 *
 * タクソノミー改定時は、最新の taxonomy-v2.json に対してスラッグ検証・legacy_slugs 解決を行い、
 * 確信度がしきい値未満の曖昧なカテゴリは親カテゴリフォールバックまたは除外する。
 */
export function buildAmazonCategoryMapping(
  taxonomy: TaxonomyV2,
  productCategories: ProductCategoryMap,
  options: BuildAmazonCategoryMappingOptions = {},
): AmazonCategoryMappingResult {
  const minConfidence = options.minConfidence ?? 0.6;
  const index = buildTaxonomyIndex(taxonomy);

  interface Bucket {
    total: number;
    pairCounts: Map<string, number>;
    parentCounts: Map<string, number>;
  }

  const buckets = new Map<string, Bucket>();
  let totalStoredEntries = 0;
  let entriesWithAmazonCategory = 0;
  let unresolvedEntries = 0;

  for (const stored of Object.values(productCategories || {})) {
    totalStoredEntries += 1;
    const amazonCat = typeof stored?.amazon_category === 'string' ? stored.amazon_category.trim() : '';
    if (!amazonCat) continue;
    entriesWithAmazonCategory += 1;

    const resolved = resolveTaxonomyPair(stored.category_parent, stored.category_child, index);
    if (!resolved) {
      unresolvedEntries += 1;
      continue;
    }

    let bucket = buckets.get(amazonCat);
    if (!bucket) {
      bucket = { total: 0, pairCounts: new Map(), parentCounts: new Map() };
      buckets.set(amazonCat, bucket);
    }
    bucket.total += 1;
    const pairKey = `${resolved.parentSlug}\0${resolved.childSlug}`;
    bucket.pairCounts.set(pairKey, (bucket.pairCounts.get(pairKey) ?? 0) + 1);
    bucket.parentCounts.set(resolved.parentSlug, (bucket.parentCounts.get(resolved.parentSlug) ?? 0) + 1);
  }

  const map = new Map<string, MappedCategoryInfo>();
  let mappedExactChildCount = 0;
  let mappedParentFallbackCount = 0;
  let ambiguousCount = 0;

  for (const [amazonCat, bucket] of buckets.entries()) {
    const sortedPairs = [...bucket.pairCounts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return compareChildKeys(a[0], b[0], index);
    });
    const topPair = sortedPairs[0];
    if (topPair && topPair[1] / bucket.total >= minConfidence) {
      const [parentSlug = '', childSlug = ''] = topPair[0].split('\0');
      const parentMeta = index.parentsBySlug.get(parentSlug);
      const childMeta = childSlug ? index.childrenBySlug.get(childSlug) : undefined;
      if (parentMeta) {
        map.set(amazonCat, {
          parentSlug: parentMeta.slug,
          childSlug: childMeta?.slug ?? '',
          parentName: parentMeta.name,
          childName: childMeta?.name ?? '',
        });
        mappedExactChildCount += 1;
        continue;
      }
    }

    const sortedParents = [...bucket.parentCounts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return compareParentSlugs(a[0], b[0], index);
    });
    const topParent = sortedParents[0];
    if (topParent && topParent[1] / bucket.total >= minConfidence) {
      const parentMeta = index.parentsBySlug.get(topParent[0]);
      if (parentMeta) {
        map.set(amazonCat, {
          parentSlug: parentMeta.slug,
          childSlug: parentMeta.zzChildSlug,
          parentName: parentMeta.name,
          childName: parentMeta.zzChildName,
        });
        mappedParentFallbackCount += 1;
        continue;
      }
    }

    ambiguousCount += 1;
  }

  return {
    map,
    stats: {
      totalStoredEntries,
      entriesWithAmazonCategory,
      unresolvedEntries,
      distinctAmazonCategories: buckets.size,
      mappedExactChildCount,
      mappedParentFallbackCount,
      ambiguousCount,
    },
  };
}
