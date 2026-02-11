import { CreatorsAPICache } from '../api/CreatorsAPICache';
import fs from 'fs';
import path from 'path';

async function main() {
    const cache = new CreatorsAPICache();
    // Force reload or ensure it's loaded
    // The constructor calls load(), which is synchronous.

    console.log('Cache loaded.');

    const start = process.hrtime();
    await cache.save();
    const end = process.hrtime(start);

    const durationInMs = (end[0] * 1000 + end[1] / 1e6).toFixed(3);
    console.log(`Save took ${durationInMs}ms`);
}

main().catch(console.error);
