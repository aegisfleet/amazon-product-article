import fs from 'node:fs';
import path from 'node:path';

// Cache directories
const CACHE_DIR = path.resolve(__dirname, '../../../data/cache');
const SHARDS_DIR = path.join(CACHE_DIR, 'paapi');

// Define status order
const STATUS_ORDER = ['valid', 'invalid', 'permanent_invalid'];

interface CacheEntry {
  data: any;
  timestamp: number;
  status: string;
}

interface CacheFile {
  [asin: string]: CacheEntry;
}

function sortEntries(entries: [string, CacheEntry][]): [string, CacheEntry][] {
  return entries.sort((a, b) => {
    const statusA = a[1].status;
    const statusB = b[1].status;

    const indexA = STATUS_ORDER.indexOf(statusA);
    const indexB = STATUS_ORDER.indexOf(statusB);

    if (indexA !== -1 && indexB !== -1) {
      if (indexA !== indexB) {
        return indexA - indexB;
      }
    }

    if (indexA === -1 && indexB !== -1) return 1;
    if (indexA !== -1 && indexB === -1) return -1;

    if (a[1].timestamp !== b[1].timestamp) {
      return b[1].timestamp - a[1].timestamp;
    }
    return a[0].localeCompare(b[0]);
  });
}

function sortCacheByStatus() {
  console.log('📦 Reading cache...');

  if (fs.existsSync(SHARDS_DIR)) {
    const shardFiles = fs.readdirSync(SHARDS_DIR).filter((f) => f.endsWith('.json'));
    console.log(`📊 Processing ${shardFiles.length} shards...`);

    let totalEntries = 0;
    const counts: Record<string, number> = {};

    for (const shardFile of shardFiles) {
      const filePath = path.join(SHARDS_DIR, shardFile);
      const rawData = fs.readFileSync(filePath, 'utf-8');
      const cache: CacheFile = JSON.parse(rawData);
      const entries = Object.entries(cache);
      totalEntries += entries.length;

      entries.forEach(([_, value]) => {
        const status = value.status || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
      });

      const sorted = sortEntries(entries);
      const lines = sorted.map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}\n`;
      fs.writeFileSync(filePath, jsonContent, 'utf-8');
    }

    console.log(`📊 Total entries across shards: ${totalEntries}`);
    console.log('📈 Status counts:', counts);
    console.log('✅ All cache shards sorted successfully.');
    return;
  }

  console.error(`❌ Cache shards not found at: ${SHARDS_DIR}`);
  process.exit(1);
}

sortCacheByStatus();
