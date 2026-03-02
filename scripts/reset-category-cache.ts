import fs from 'node:fs';
import path from 'node:path';

const targetCategory = process.argv[2];

if (!targetCategory) {
    console.error('Usage: npx ts-node scripts/reset-category-cache.ts <CategoryName>');
    console.error('Example: npx ts-node scripts/reset-category-cache.ts "ホーム・日用品"');
    process.exit(1);
}

const cachePath = path.resolve(__dirname, '../data/cache/paapi-product-cache.json');
const articlesDir = path.resolve(__dirname, '../content/articles');

try {
    if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        let resetCount = 0;

        const files = fs.readdirSync(articlesDir);
        for (const file of files) {
            if (file.endsWith('.md')) {
                const filePath = path.join(articlesDir, file);
                const content = fs.readFileSync(filePath, 'utf8');

                // Check if the article has the target category
                if (content.includes(`categories: ["${targetCategory}"]`)) {
                    const asinMatch = content.match(/asin:\s*"([^"]+)"/);
                    if (asinMatch && asinMatch[1]) {
                        const asin = asinMatch[1];
                        if (cache[asin]) {
                            cache[asin].timestamp = 0;
                            console.log(`Reset cache for ASIN: ${asin}`);
                            resetCount++;
                        }
                    }
                }
            }
        }

        if (resetCount > 0) {
            fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
            console.log(`Successfully reset timestamp for ${resetCount} items matching category "${targetCategory}".`);
        } else {
            console.log(`No items found with category "${targetCategory}" to reset.`);
        }
    } else {
        console.error(`Cache file not found at: ${cachePath}`);
    }
} catch (error) {
    console.error(`Error processing cache file: ${error}`);
}
