import * as fs from 'node:fs';
import * as path from 'node:path';

interface CacheEntry {
  data: unknown;
  timestamp: number;
  status: string;
}

interface CacheFile {
  [asin: string]: CacheEntry;
}

export function loadJSON(filePath: string): CacheFile {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`ℹ️ File not found, treating as empty: ${filePath}`);
      return {};
    }
    const rawData = fs.readFileSync(filePath, 'utf-8');
    if (!rawData.trim()) {
      return {};
    }
    return JSON.parse(rawData) as CacheFile;
  } catch (error) {
    console.error(`❌ Failed to parse JSON from ${filePath}:`, error);
    return {};
  }
}

function processEntry(key: string, oursEntry: CacheEntry, theirsEntry: CacheEntry | undefined, merged: CacheFile, stats: { added: number, updated: number, kept: number }) {
  if (!theirsEntry) {
    merged[key] = oursEntry;
    stats.added++;
  } else {
    const oursTime = oursEntry.timestamp || 0;
    const theirsTime = theirsEntry.timestamp || 0;

    if (oursTime > theirsTime) {
      merged[key] = oursEntry;
      stats.updated++;
    } else {
      stats.kept++;
    }
  }
}

export function mergeCaches() {
  const oursPath = process.argv[2];
  const theirsPath = process.argv[3];
  const outputPath = process.argv[4];

  if (!oursPath || !theirsPath || !outputPath) {
    console.error('❌ Usage: pnpm exec ts-node scripts/merge-product-cache.ts <ours.json> <theirs.json> <output.json>');
    process.exit(1);
  }

  // SonarCloud: properly sanitize paths to ensure they're within the intended workspace
  const workspaceRoot = path.resolve(process.cwd());
  const resolvedOutputPath = path.resolve(workspaceRoot, outputPath);

  if (!resolvedOutputPath.startsWith(workspaceRoot)) {
    console.error(`❌ Invalid output path: ${resolvedOutputPath}. Path must be within the current working directory.`);
    process.exit(1);
  }

  console.log(`📦 Loading ours: ${oursPath}`);
  const ours = loadJSON(oursPath);

  console.log(`📦 Loading theirs: ${theirsPath}`);
  const theirs = loadJSON(theirsPath);

  console.log('🔄 Merging cache entries...');

  const merged: CacheFile = { ...theirs };
  const stats = { added: 0, updated: 0, kept: 0 };

  for (const key in ours) {
    if (Object.hasOwn(ours, key)) {
      const oursEntry = ours[key];
      if (!oursEntry) continue;
      processEntry(key, oursEntry, theirs[key], merged, stats);
    }
  }

  console.log(`📊 Merge summary:`);
  console.log(`   - Added from ours (new entries): ${stats.added}`);
  console.log(`   - Updated from ours (newer timestamp): ${stats.updated}`);
  console.log(`   - Kept from theirs (newer/same timestamp): ${stats.kept}`);
  console.log(`   - Total merged entries: ${Object.keys(merged).length}`);

  try {
    const dir = path.dirname(resolvedOutputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedOutputPath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`✅ Successfully wrote merged cache to ${resolvedOutputPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Failed to write merged cache to ${resolvedOutputPath}:`, error);
    process.exit(1);
  }
}

mergeCaches();
