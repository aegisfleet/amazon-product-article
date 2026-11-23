import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface InvestigationJsonLike {
  analysis?: {
    investigatedPrice?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CachePriceInfo {
  amount?: number;
  formatted?: string;
}

export interface CacheEntryLike {
  data?: {
    price?: CachePriceInfo;
  };
}

export interface BackfillResult {
  updated: boolean;
  reason?: 'no_analysis' | 'already_exists' | 'no_cache' | 'invalid_price';
}

export interface BackfillSummary {
  total: number;
  updated: number;
  alreadyExists: number;
  noAnalysis: number;
  noCache: number;
  invalidPrice: number;
}

/**
 * キャッシュ価格から有効な表示用価格文字列を抽出する。無効な場合は null を返す。
 */
export function extractValidPriceFormatted(price?: CachePriceInfo): string | null {
  if (!price?.formatted) return null;
  const formatted = price.formatted.trim();
  if (!formatted || formatted === '価格情報なし') return null;
  if (typeof price.amount === 'number' && price.amount <= 0) return null;

  const digits = formatted.replaceAll(',', '');
  const match = /\d+/.exec(digits);
  const numeric = match ? Number.parseInt(match[0], 10) : 0;
  if (numeric <= 0) return null;

  return formatted;
}

/**
 * 調査結果オブジェクトの `analysis.investigatedPrice` が未設定の場合に、
 * キャッシュ上の現在価格を基準価格として設定する。
 */
export function applyInvestigatedPriceToInvestigation(
  investigation: InvestigationJsonLike,
  cacheEntry?: CacheEntryLike,
): BackfillResult {
  if (!investigation.analysis) {
    return { updated: false, reason: 'no_analysis' };
  }

  const existing = investigation.analysis.investigatedPrice;
  if (typeof existing === 'string' && existing.trim() !== '') {
    return { updated: false, reason: 'already_exists' };
  }

  if (!cacheEntry) {
    return { updated: false, reason: 'no_cache' };
  }

  const validFormatted = extractValidPriceFormatted(cacheEntry.data?.price);
  if (!validFormatted) {
    return { updated: false, reason: 'invalid_price' };
  }

  investigation.analysis.investigatedPrice = validFormatted;
  return { updated: true };
}

/**
 * `data/cache/paapi/*.json` シャードから ASIN -> CacheEntry のマップを読み込む。
 */
async function loadAllPaapiCacheEntries(paapiDir: string): Promise<Map<string, CacheEntryLike>> {
  const map = new Map<string, CacheEntryLike>();
  const entries = await fs.readdir(paapiDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(paapiDir, entry.name), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, CacheEntryLike>;
    for (const [asin, cacheEntry] of Object.entries(parsed)) {
      map.set(asin, cacheEntry);
    }
  }
  return map;
}

/**
 * `data/investigations/*.json` を走査し、`investigatedPrice` が未設定の項目に
 * `data/cache/paapi/*.json` の現在価格を一括補完する。
 */
export async function backfillInvestigatedPriceInInvestigations(
  investigationsDir: string,
  paapiCacheDir: string,
  dryRun = false,
): Promise<BackfillSummary> {
  const cacheMap = await loadAllPaapiCacheEntries(paapiCacheDir);
  const files = (await fs.readdir(investigationsDir, { withFileTypes: true })).filter(
    (e) => e.isFile() && e.name.endsWith('.json'),
  );

  const summary: BackfillSummary = {
    total: files.length,
    updated: 0,
    alreadyExists: 0,
    noAnalysis: 0,
    noCache: 0,
    invalidPrice: 0,
  };

  for (const file of files) {
    const asin = path.basename(file.name, '.json');
    const filePath = path.join(investigationsDir, file.name);
    const raw = await fs.readFile(filePath, 'utf-8');
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const investigation = JSON.parse(raw) as InvestigationJsonLike;

    const result = applyInvestigatedPriceToInvestigation(investigation, cacheMap.get(asin));
    if (result.updated) {
      summary.updated += 1;
      if (!dryRun) {
        const serialized = JSON.stringify(investigation, null, 2).replaceAll('\n', eol) + eol;
        await fs.writeFile(filePath, serialized, 'utf-8');
      }
      continue;
    }

    switch (result.reason) {
      case 'already_exists':
        summary.alreadyExists += 1;
        break;
      case 'no_analysis':
        summary.noAnalysis += 1;
        break;
      case 'no_cache':
        summary.noCache += 1;
        break;
      case 'invalid_price':
        summary.invalidPrice += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const root = process.cwd();
  const investigationsDir = path.join(root, 'data', 'investigations');
  const paapiCacheDir = path.join(root, 'data', 'cache', 'paapi');

  const summary = await backfillInvestigatedPriceInInvestigations(investigationsDir, paapiCacheDir, dryRun);
  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
