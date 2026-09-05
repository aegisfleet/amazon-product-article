import fs from 'node:fs';
import path from 'node:path';

// Adjust cache path
const cachePath = path.resolve(__dirname, '../../../data/cache/paapi-product-cache.json');
const asin = process.argv[2] || 'B009ODJPMI';

if (!process.argv[2]) {
  console.log('Usage: pnpm ts-node src/scripts/maintenance/reset-cache-timestamp.ts <ASIN>');
  console.log('Using default ASIN: B009ODJPMI');
}

try {
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

    if (cache[asin]) {
      console.log(`Found cache for ${asin}. Current timestamp: ${cache[asin].timestamp}`);
      cache[asin].timestamp = 0; // Reset timestamp to force refresh
      const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
      const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}`;
      fs.writeFileSync(cachePath, jsonContent, 'utf8');
      console.log(`Reset timestamp for ${asin} to 0 at ${cachePath}`);
    } else {
      console.log(`No cache found for ${asin}.`);
    }
  } else {
    console.error(`Cache file not found at: ${cachePath}`);
  }
} catch (error) {
  console.error('Error processing cache file:', error);
}
