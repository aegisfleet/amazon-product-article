import fs from 'node:fs';
import path from 'node:path';
import { CreatorsAPICache } from '../../api/CreatorsAPICache';

const cacheDir = path.resolve(__dirname, '../../../data/cache');
const shardsDir = path.join(cacheDir, 'paapi');
const legacyCachePath = path.join(cacheDir, 'paapi-product-cache.json');
const asin = process.argv[2] || 'B009ODJPMI';

if (!process.argv[2]) {
  console.log('Usage: pnpm ts-node src/scripts/maintenance/reset-cache-timestamp.ts <ASIN>');
  console.log('Using default ASIN: B009ODJPMI');
}

try {
  const shardKey = CreatorsAPICache.getShardKey(asin);
  const shardFile = path.join(shardsDir, `${shardKey}.json`);

  if (fs.existsSync(shardFile)) {
    const rawData = fs.readFileSync(shardFile, 'utf8');
    const cache = JSON.parse(rawData);

    if (cache[asin]) {
      console.log(`Found cache for ${asin} in shard ${shardKey}. Current timestamp: ${cache[asin].timestamp}`);
      cache[asin].timestamp = 0; // Reset timestamp to force refresh
      const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
      const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}\n`;
      fs.writeFileSync(shardFile, jsonContent, 'utf8');
      console.log(`Reset timestamp for ${asin} to 0 at ${shardFile}`);
    } else {
      console.log(`No cache found for ${asin} in shard ${shardKey}.`);
    }
  } else if (fs.existsSync(legacyCachePath)) {
    const cache = JSON.parse(fs.readFileSync(legacyCachePath, 'utf8'));

    if (cache[asin]) {
      console.log(`Found cache for ${asin}. Current timestamp: ${cache[asin].timestamp}`);
      cache[asin].timestamp = 0; // Reset timestamp to force refresh
      const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
      const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}\n`;
      fs.writeFileSync(legacyCachePath, jsonContent, 'utf8');
      console.log(`Reset timestamp for ${asin} to 0 at ${legacyCachePath}`);
    } else {
      console.log(`No cache found for ${asin}.`);
    }
  } else {
    console.error(`Cache file/shard not found for: ${asin}`);
  }
} catch (error) {
  console.error('Error processing cache file:', error);
}
