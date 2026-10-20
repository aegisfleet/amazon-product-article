import fs from 'node:fs';
import path from 'node:path';

const cacheDir = path.resolve(__dirname, '../../../data/cache');
const shardsDir = path.join(cacheDir, 'paapi');
const legacyCachePath = path.join(cacheDir, 'paapi-product-cache.json');

try {
  let count = 0;

  if (fs.existsSync(shardsDir)) {
    const shardFiles = fs.readdirSync(shardsDir).filter((f) => f.endsWith('.json'));
    let updatedShards = 0;

    for (const shardFile of shardFiles) {
      const filePath = path.join(shardsDir, shardFile);
      const rawData = fs.readFileSync(filePath, 'utf8');
      const cache = JSON.parse(rawData);
      let shardDirty = false;

      for (const asin of Object.keys(cache)) {
        if (cache[asin]?.status === 'permanent_invalid') {
          delete cache[asin];
          count++;
          shardDirty = true;
        }
      }

      if (shardDirty) {
        const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
        const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
        const jsonContent = `{\n${lines.join(',\n')}\n}\n`;
        fs.writeFileSync(filePath, jsonContent, 'utf8');
        updatedShards++;
      }
    }

    if (count > 0) {
      console.log(`Successfully deleted ${count} permanent_invalid entries across ${updatedShards} shards.`);
    } else {
      console.log('No permanent_invalid entries found in shards.');
    }
  } else if (fs.existsSync(legacyCachePath)) {
    const rawData = fs.readFileSync(legacyCachePath, 'utf8');
    const cache = JSON.parse(rawData);
    const asins = Object.keys(cache);

    for (const asin of asins) {
      if (cache[asin]?.status === 'permanent_invalid') {
        delete cache[asin];
        count++;
      }
    }

    if (count > 0) {
      const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
      const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}\n`;
      fs.writeFileSync(legacyCachePath, jsonContent, 'utf8');
      console.log(`Successfully deleted ${count} permanent_invalid entries from cache.`);
    } else {
      console.log('No permanent_invalid entries found in cache.');
    }
  } else {
    console.error(`Cache not found at: ${shardsDir} or ${legacyCachePath}`);
  }
} catch (error) {
  console.error('Error processing cache file:', error);
}
