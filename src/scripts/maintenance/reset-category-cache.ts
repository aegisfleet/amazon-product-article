import fs from 'node:fs';
import path from 'node:path';

const targetCategory = process.argv[2];

if (!targetCategory) {
  console.error('Usage: pnpm ts-node src/scripts/maintenance/reset-category-cache.ts <CategoryName>');
  console.error('Example: pnpm ts-node src/scripts/maintenance/reset-category-cache.ts "ホーム・日用品"');
  process.exit(1);
}

const cachePath = path.resolve(__dirname, '../../../data/cache/paapi-product-cache.json');
const articlesDir = path.resolve(__dirname, '../../../content/articles');

try {
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    let resetCount = 0;

    const targetLower = targetCategory.toLowerCase();

    const categoryRegex = /categories:\s*\[([^\]]+)\]/;
    const asinRegex = /asin:\s*"([^"]+)"/;

    // 1. Scan Articles (Old approach preserved for article-specific metadata if needed)
    const files = fs.readdirSync(articlesDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(articlesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if the article has the target category
        const categoryMatch = categoryRegex.exec(content);
        if (categoryMatch?.[1]?.toLowerCase().includes(targetLower)) {
          const asinMatch = asinRegex.exec(content);
          if (asinMatch?.[1]) {
            const asin = asinMatch[1];
            if (cache[asin]?.timestamp !== 0) {
              cache[asin].timestamp = 0;
              console.log(`Reset cache for ASIN (from article): ${asin}`);
              resetCount++;
            }
          }
        }
      }
    }

    // 2. Scan Cache Directly (New approach for items without articles)
    for (const asin in cache) {
      const item = cache[asin];
      const data = item.data;
      if (!data) continue;

      const category = data.category?.toLowerCase() || '';
      const mainCat = data.categoryInfo?.main?.toLowerCase() || '';
      const subCat = data.categoryInfo?.sub?.toLowerCase() || '';

      const matches = category.includes(targetLower) || mainCat.includes(targetLower) || subCat.includes(targetLower);

      if (matches && item.timestamp !== 0) {
        item.timestamp = 0;
        console.log(`Reset cache for ASIN (from cache scan): ${asin}`);
        resetCount++;
      }
    }

    if (resetCount > 0) {
      const sortedKeys = Object.keys(cache).sort((a, b) => a.localeCompare(b));
      const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(cache[key])}`);
      const jsonContent = `{\n${lines.join(',\n')}\n}`;
      fs.writeFileSync(cachePath, jsonContent, 'utf8');
      console.log(`Successfully reset timestamp for ${resetCount} items matching category "${targetCategory}".`);
    } else {
      console.log(`No items found with category "${targetCategory}" to reset.`);
    }
  } else {
    console.error(`Cache file not found at: ${cachePath}`);
  }
} catch (error) {
  console.error('Error processing cache file:', error);
}
