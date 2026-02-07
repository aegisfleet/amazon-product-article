
import fs from 'fs';
import path from 'path';

// Adjust cache path
const cachePath = path.resolve(__dirname, '../data/cache/paapi-product-cache.json');
const asin = process.argv[2] || 'B009ODJPMI';

if (!process.argv[2]) {
    console.log('Usage: npx ts-node scripts/reset_cache_timestamp.ts <ASIN>');
    console.log('Using default ASIN: B009ODJPMI');
}

try {
    if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

        if (cache[asin]) {
            console.log(`Found cache for ${asin}. Current timestamp: ${cache[asin].timestamp}`);
            cache[asin].timestamp = 0; // Reset timestamp to force refresh
            fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
            console.log(`Reset timestamp for ${asin} to 0 at ${cachePath}`);
        } else {
            console.log(`No cache found for ${asin}.`);
        }
    } else {
        console.error(`Cache file not found at: ${cachePath}`);
    }
} catch (error) {
    console.error(`Error processing cache file: ${error}`);
}
