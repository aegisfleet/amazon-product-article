import fs from 'node:fs';
import path from 'node:path';

const targetCategory = process.argv[2];

if (!targetCategory) {
  console.error('Usage: pnpm ts-node src/scripts/maintenance/reset-category-cache.ts <CategoryName>');
  console.error('Example: pnpm ts-node src/scripts/maintenance/reset-category-cache.ts "ホーム・日用品"');
  process.exit(1);
}

const cacheDir = path.resolve(__dirname, '../../../data/cache');
const shardsDir = path.join(cacheDir, 'paapi');
const legacyCachePath = path.join(cacheDir, 'paapi-product-cache.json');
const articlesDir = path.resolve(__dirname, '../../../content/articles');

try {
  let resetCount = 0;
  const targetLower = targetCategory.toLowerCase();

  // Collect target ASINs from articles if any
  const targetAsinsFromArticles = new Set<string>();
  if (fs.existsSync(articlesDir)) {
    const categoryRegex = /categories:\s*\[([^\]]+)\]/;
    const asinRegex = /asin:\s*"([^"]+)"/;
    const files = fs.readdirSync(articlesDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(articlesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const categoryMatch = categoryRegex.exec(content);
        if (categoryMatch?.[1]?.toLowerCase().includes(targetLower)) {
          const asinMatch = asinRegex.exec(content);
          if (asinMatch?.[1]) {
            targetAsinsFromArticles.add(asinMatch[1]);
          }
        }
      }
    }
  }

  if (fs.existsSync(shardsDir)) {
    const shardFiles = fs.readdirSync(shardsDir).filter((f) => f.endsWith('.json'));
    let updatedShards = 0;

    for (const shardFile of shardFiles) {
      const filePath = path.join(shardsDir, shardFile);
      const rawData = fs.readFileSync(filePath, 'utf8');
      const cache = JSON.parse(rawData);
      let shardDirty = false;

      for (const asin in cache) {
        const item = cache[asin];
        const data = item?.data;
        const fromArticle = targetAsinsFromArticles.has(asin);

        const category = data?.category?.toLowerCase() || '';
        const mainCat = data?.categoryInfo?.main?.toLowerCase() || '';
        const subCat = data?.categoryInfo?.sub?.toLowerCase() || '';
        const matchesCat =
          category.includes(targetLower) || mainCat.includes(targetLower) || subCat.includes(targetLower);

        if ((fromArticle || matchesCat) && item.timestamp !== 0) {
          item.timestamp = 0;
          console.log(`Reset cache for ASIN: ${asin} (in ${shardFile})`);
          resetCount++;
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

    console.log(
      `Successfully reset timestamp for ${resetCount} items across ${updatedShards} shards matching category "${targetCategory}".`,
    );
  } else if (fs.existsSync(legacyCachePath)) {
    const cache = JSON.parse(fs.readFileSync(legacyCachePath, 'utf8'));

    for (const asin in cache) {
      const item = cache[asin];
      const data = item?.data;
      const fromArticle = targetAsinsFromArticles.has(asin);

      const category = data?.category?.toLowerCase() || '';
      const mainCat = data?.categoryInfo?.main?.toLowerCase() || '';
      const subCat = data?.categoryInfo?.sub?.toLowerCase() || '';
      const matchesCat =
        category.includes(targetLower) || mainCat.includes(targetLower) || subCat.includes(targetLower);

      if ((fromArticle || matchesCat) && item.timestamp !== 0) {
        item.timestamp = 0;
        console.log(`Reset cache for ASIN: ${asin}`);
        resetCount++;
      }
    }

    if (resetCount > 0) {
      const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
      const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}\n`;
      fs.writeFileSync(legacyCachePath, jsonContent, 'utf8');
      console.log(`Successfully reset timestamp for ${resetCount} items matching category "${targetCategory}".`);
    } else {
      console.log(`No items found with category "${targetCategory}" to reset.`);
    }
  } else {
    console.error(`Cache not found at: ${shardsDir} or ${legacyCachePath}`);
  }
} catch (error) {
  console.error('Error processing cache:', error);
}
