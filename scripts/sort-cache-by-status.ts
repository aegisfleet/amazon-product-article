
import * as fs from 'fs';
import * as path from 'path';

// Cache file path
const CACHE_FILE_PATH = path.join(__dirname, '../data/cache/paapi-product-cache.json');

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

function sortCacheByStatus() {
    console.log('📦 Reading cache file...');

    if (!fs.existsSync(CACHE_FILE_PATH)) {
        console.error(`❌ Cache file not found at: ${CACHE_FILE_PATH}`);
        process.exit(1);
    }

    const rawData = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
    let cache: CacheFile;

    try {
        cache = JSON.parse(rawData);
    } catch (error) {
        console.error('❌ Failed to parse cache file JSON.', error);
        process.exit(1);
    }

    const entries = Object.entries(cache);
    console.log(`📊 Total entries: ${entries.length}`);

    // Count entries by status before sorting
    const counts: Record<string, number> = {};
    entries.forEach(([_, value]) => {
        const status = value.status || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
    });

    console.log('📈 Status counts:', counts);

    // Sort entries
    entries.sort((a, b) => {
        const statusA = a[1].status;
        const statusB = b[1].status;

        const indexA = STATUS_ORDER.indexOf(statusA);
        const indexB = STATUS_ORDER.indexOf(statusB);

        // If both statuses are in the known list, sort by index
        if (indexA !== -1 && indexB !== -1) {
            if (indexA !== indexB) {
                return indexA - indexB;
            }
        }

        // If one is unknown, put it at the end
        if (indexA === -1 && indexB !== -1) return 1;
        if (indexA !== -1 && indexB === -1) return -1;

        // If status is same (or both unknown), sort by timestamp (newest first)
        // or ASIN as a fallback for stability
        if (a[1].timestamp !== b[1].timestamp) {
            return b[1].timestamp - a[1].timestamp;
        }
        return a[0].localeCompare(b[0]);
    });

    // Reconstruct sorted object
    const sortedCache: CacheFile = {};
    entries.forEach(([key, value]) => {
        sortedCache[key] = value;
    });

    console.log('💾 Writing sorted cache to file...');
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(sortedCache, null, 2));
    console.log('✅ Cache sorted successfully.');
}

sortCacheByStatus();
