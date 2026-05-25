import fs from 'node:fs';
import path from 'node:path';

const cachePath = path.resolve(__dirname, '../data/cache/paapi-product-cache.json');

try {
  if (fs.existsSync(cachePath)) {
    const rawData = fs.readFileSync(cachePath, 'utf8');
    const cache = JSON.parse(rawData);

    let count = 0;
    const asins = Object.keys(cache);

    for (const asin of asins) {
      if (cache[asin]?.status === 'permanent_invalid') {
        delete cache[asin];
        count++;
      }
    }

    if (count > 0) {
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
      console.log(`Successfully deleted ${count} permanent_invalid entries from cache.`);
    } else {
      console.log('No permanent_invalid entries found in cache.');
    }
  } else {
    console.error(`Cache file not found at: ${cachePath}`);
  }
} catch (error) {
  console.error(`Error processing cache file: ${error}`);
}
