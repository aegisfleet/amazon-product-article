import fs from 'fs/promises';
import path from 'path';
import { ProductSearcher, SearchSession } from '../search/ProductSearcher';
import { CreatorsAPIClient } from '../api/CreatorsAPIClient';
import { ProductSearchResult } from '../types/Product';

// Subclass to override dataDir
class BenchmarkProductSearcher extends ProductSearcher {
    constructor(client: CreatorsAPIClient, dataDir: string) {
        super(client);
        // Override private dataDir
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (this as any).dataDir = dataDir;
    }
}

async function runBenchmark(): Promise<void> {
    const TEMP_DIR = path.join(process.cwd(), 'temp_bench_data');
    const SESSIONS_DIR = path.join(TEMP_DIR, 'sessions');

    console.log('Setting up benchmark environment...');

    try {
        await fs.rm(TEMP_DIR, { recursive: true, force: true });
        await fs.mkdir(SESSIONS_DIR, { recursive: true });

        const NUM_SESSIONS = 1000;
        console.log(`Generating ${NUM_SESSIONS} dummy session files...`);

        const promises = [];
        for (let i = 0; i < NUM_SESSIONS; i++) {
            const results: ProductSearchResult[] = [
                {
                    products: Array(10).fill({}), // Dummy products
                    totalResults: 10,
                    searchParams: {
                        category: i % 2 === 0 ? 'cat1' : 'cat2',
                        keywords: ['test'],
                        maxResults: 10
                    },
                    timestamp: new Date()
                } as unknown as ProductSearchResult
            ];

            const session: SearchSession = {
                id: `session_${i}`,
                timestamp: new Date(),
                categories: ['cat1', 'cat2'],
                totalProducts: Math.floor(Math.random() * 100),
                results
            };
            promises.push(fs.writeFile(path.join(SESSIONS_DIR, `${session.id}.json`), JSON.stringify(session)));
        }
        await Promise.all(promises);

        console.log('Finished generating files.');

        const client = new CreatorsAPIClient();
        const searcher = new BenchmarkProductSearcher(client, TEMP_DIR);

        console.log('Starting benchmark for getSearchStatistics...');
        const start = process.hrtime.bigint();

        const stats = await searcher.getSearchStatistics();

        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1e6; // Convert to milliseconds

        console.log(`Benchmark completed in ${duration.toFixed(2)} ms`);
        console.log(`Total sessions processed: ${stats.totalSessions}`);
        console.log(`Total products: ${stats.totalProducts}`);

    } catch (error) {
        console.error('Benchmark failed:', error);
    } finally {
        console.log('Cleaning up...');
        await fs.rm(TEMP_DIR, { recursive: true, force: true });
    }
}

void runBenchmark();
