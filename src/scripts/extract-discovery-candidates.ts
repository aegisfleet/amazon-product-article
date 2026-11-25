/**
 * 系統B: pickup-pool.json（スコア80点以上の高スコア商品）から、
 * セール有無を問わない「発掘」候補を日付シードの決定論的シャッフルで抽出する。
 */
import fs from 'node:fs';
import path from 'node:path';

export interface PickupPoolItem {
  asin: string;
  title: string;
  url?: string;
  score: number;
  price?: string;
  category: string;
  group: string;
  priceBucket?: string;
  image?: string;
}

export interface DiscoveryCandidate {
  asin: string;
  title: string;
  score: number;
  price?: string;
  category: string;
  group: string;
  imageUrl?: string;
  articlePath: string;
}

export interface DiscoveryCandidatesFile {
  extractedAt: string;
  seed: string;
  totalCandidates: number;
  candidates: DiscoveryCandidate[];
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
export function createSeededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = createSeededRandom(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

export function getJstDateString(date = new Date()): string {
  return date
    .toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replaceAll('/', '-');
}

export interface SelectDiscoveryOptions {
  excludeAsins?: ReadonlySet<string>;
  seed: string;
  limit?: number;
  maxPerGroup?: number;
  minScore?: number;
}

/** 除外・シャッフル後、グループ上限付きラウンドロビンで分散して選ぶ */
export function selectDiscoveryCandidates(
  pool: readonly PickupPoolItem[],
  options: SelectDiscoveryOptions,
): PickupPoolItem[] {
  const { excludeAsins, seed, limit = 20, maxPerGroup = 2, minScore = 80 } = options;
  const eligible = pool.filter((p) => p?.asin && p.score >= minScore && !excludeAsins?.has(p.asin.toUpperCase()));
  const shuffled = seededShuffle(eligible, seed);

  const byGroup = new Map<string, PickupPoolItem[]>();
  for (const item of shuffled) {
    const key = item.group || 'その他';
    const list = byGroup.get(key) ?? [];
    list.push(item);
    byGroup.set(key, list);
  }

  const groups = seededShuffle([...byGroup.keys()], `${seed}:groups`);
  const picked: PickupPoolItem[] = [];
  const categoryCounts = new Map<string, number>();
  for (let round = 0; round < maxPerGroup && picked.length < limit; round++) {
    for (const g of groups) {
      if (picked.length >= limit) break;
      const item = byGroup.get(g)?.[round];
      if (!item) continue;
      const catCount = categoryCounts.get(item.category) ?? 0;
      if (catCount >= 2) continue;
      categoryCounts.set(item.category, catCount + 1);
      picked.push(item);
    }
  }
  return picked;
}

export function extractDiscoveryCandidates(
  options: {
    poolPath?: string;
    outputPath?: string;
    excludeAsins?: ReadonlySet<string>;
    seed?: string;
    limit?: number;
    maxPerGroup?: number;
  } = {},
): DiscoveryCandidatesFile {
  const poolPath = options.poolPath ?? path.join(process.cwd(), 'data/recommendations/pickup-pool.json');
  const outputPath = options.outputPath ?? path.join(process.cwd(), 'tmp/discovery_candidates.json');
  const seed = options.seed ?? getJstDateString();

  let pool: PickupPoolItem[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(poolPath, 'utf-8'));
    if (Array.isArray(parsed)) pool = parsed as PickupPoolItem[];
  } catch {
    pool = [];
  }

  const selected = selectDiscoveryCandidates(pool, {
    seed,
    ...(options.excludeAsins && { excludeAsins: options.excludeAsins }),
    ...(options.limit !== undefined && { limit: options.limit }),
    ...(options.maxPerGroup !== undefined && { maxPerGroup: options.maxPerGroup }),
  });

  const result: DiscoveryCandidatesFile = {
    extractedAt: new Date().toISOString(),
    seed,
    totalCandidates: selected.length,
    candidates: selected.map((p) => ({
      asin: p.asin,
      title: p.title,
      score: p.score,
      ...(p.price !== undefined && { price: p.price }),
      category: p.category,
      group: p.group,
      ...(p.image && { imageUrl: p.image }),
      articlePath: `content/articles/${p.asin.toLowerCase()}.md`,
    })),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  return result;
}
