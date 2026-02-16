import { CreatorsAPICache } from '../src/api/CreatorsAPICache';
import fs from 'fs';
import path from 'path';

// Mock large cache data
const cacheDir = 'benchmarks/data/cache';
const cacheFile = path.join(cacheDir, 'paapi-product-cache.json');

// Cleanup previous runs
if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
}

const cache = new CreatorsAPICache(24, 5, 'benchmarks/data/cache', 7);

console.log('Populating cache with 10,000 entries...');
// Fill cache with dummy data
for (let i = 0; i < 10000; i++) {
    const asin = `B00000${i.toString().padStart(5, '0')}`;
    cache.set(asin, {
        asin: asin,
        title: `Product ${i} with a very long title to simulate real data and verify that the file size is significant enough to notice blocking I/O differences`,
        price: { amount: 1000 + i, currency: 'JPY', formatted: `¥${1000 + i}` },
        images: { primary: 'http://example.com/image.jpg', thumbnails: ['http://example.com/t1.jpg', 'http://example.com/t2.jpg'] },
        specifications: { "Color": "Blue", "Size": "Large" },
        rating: { average: 4.5, count: 100 },
        detailPageUrl: `http://amazon.co.jp/dp/${asin}`,
        features: ['Feature 1: High quality', 'Feature 2: Durable', 'Feature 3: Affordable']
    });
}

async function runBenchmark() {
    console.log('Starting benchmark...');
    const start = process.hrtime();

    // We check if save is async (returns a promise)
    const result = cache.save();

    if (result && typeof result.then === 'function') {
        await result;
        console.log('Async save completed.');
    } else {
        console.log('Sync save completed.');
    }

    const end = process.hrtime(start);
    const timeInMs = (end[0] * 1000 + end[1] / 1e6).toFixed(2);
    console.log(`Save operation took ${timeInMs} ms`);

    // Verify file exists
    if (fs.existsSync(cacheFile)) {
        const stats = fs.statSync(cacheFile);
        console.log(`Cache file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
        console.error('Cache file was not created!');
    }
}

runBenchmark().catch(console.error);
