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

function loadJSON(filePath: string): CacheFile {
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

function mergeCaches() {
  const oursPath = process.argv[2];
  const theirsPath = process.argv[3];
  const outputPath = process.argv[4];

  if (!oursPath || !theirsPath || !outputPath) {
    console.error('❌ Usage: pnpm exec ts-node scripts/merge-product-cache.ts <ours.json> <theirs.json> <output.json>');
    process.exit(1);
  }

  console.log(`📦 Loading ours: ${oursPath}`);
  const ours = loadJSON(oursPath);

  console.log(`📦 Loading theirs: ${theirsPath}`);
  const theirs = loadJSON(theirsPath);

  console.log('🔄 Merging cache entries...');

  // Start with a copy of theirs to preserve all its keys
  const merged: CacheFile = { ...theirs };

  let addedFromOurs = 0;
  let updatedFromOurs = 0;
  let keptTheirs = 0;

  for (const key in ours) {
    if (Object.prototype.hasOwnProperty.call(ours, key)) {
      const oursEntry = ours[key];
      if (!oursEntry) continue;

      const theirsEntry = theirs[key];

      if (!theirsEntry) {
        // Only exists in ours
        merged[key] = oursEntry;
        addedFromOurs++;
      } else {
        // Exists in both, compare timestamps
        const oursTime = oursEntry.timestamp || 0;
        const theirsTime = theirsEntry.timestamp || 0;

        if (oursTime > theirsTime) {
          merged[key] = oursEntry;
          updatedFromOurs++;
        } else {
          keptTheirs++;
        }
      }
    }
  }

  console.log(`📊 Merge summary:`);
  console.log(`   - Added from ours (new entries): ${addedFromOurs}`);
  console.log(`   - Updated from ours (newer timestamp): ${updatedFromOurs}`);
  console.log(`   - Kept from theirs (newer/same timestamp): ${keptTheirs}`);
  console.log(`   - Total merged entries: ${Object.keys(merged).length}`);

  try {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`✅ Successfully wrote merged cache to ${outputPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Failed to write merged cache to ${outputPath}:`, error);
    process.exit(1);
  }
}

mergeCaches();
