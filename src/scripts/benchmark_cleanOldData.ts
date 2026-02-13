import fs from 'fs/promises';
import path from 'path';
import { ProductSearcher } from '../search/ProductSearcher';
import { CreatorsAPIClient } from '../api/CreatorsAPIClient';
import { Logger, LogLevel } from '../utils/Logger';

// Suppress logs during benchmark
Logger.getInstance().setLogLevel(LogLevel.ERROR);

const TEST_DIR = path.join(process.cwd(), 'temp_benchmark_data');
const DATA_DIR = path.join(TEST_DIR, 'data', 'products');
const CONTENT_DIR = path.join(TEST_DIR, 'content', 'articles');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const CATEGORIES_DIR = path.join(DATA_DIR, 'categories');

const SESSION_COUNT = 2000;
const CATEGORY_COUNT = 20;
const FILES_PER_CATEGORY = 100;

// Dummy client
const mockClient = {} as CreatorsAPIClient;

async function setupData(): Promise<void> {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(CATEGORIES_DIR, { recursive: true });
  await fs.mkdir(CONTENT_DIR, { recursive: true });

  // Create sessions
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 60); // 60 days old

  const promises: Promise<void>[] = [];
  for (let i = 0; i < SESSION_COUNT; i++) {
    const filePath = path.join(SESSIONS_DIR, `session_${i}.json`);
    promises.push(fs.writeFile(filePath, JSON.stringify({ id: `session_${i}` })));
  }
  await Promise.all(promises);

  // Set mtime for half of them to be old
  const mtimePromises: Promise<void>[] = [];
  for (let i = 0; i < SESSION_COUNT; i++) {
    if (i % 2 === 0) { // Even indices are old
        const filePath = path.join(SESSIONS_DIR, `session_${i}.json`);
        mtimePromises.push(fs.utimes(filePath, oldDate, oldDate));
    }
  }
  await Promise.all(mtimePromises);


  // Create categories
  for (let c = 0; c < CATEGORY_COUNT; c++) {
      const catDir = path.join(CATEGORIES_DIR, `cat_${c}`);
      await fs.mkdir(catDir, { recursive: true });
      const catPromises: Promise<void>[] = [];
      for (let f = 0; f < FILES_PER_CATEGORY; f++) {
          const filePath = path.join(catDir, `file_${f}.json`);
          catPromises.push(fs.writeFile(filePath, '{}'));
      }
      await Promise.all(catPromises);
  }

  // Re-loop for mtime
  const allMtimePromises: Promise<void>[] = [];
  for (let c = 0; c < CATEGORY_COUNT; c++) {
      const catDir = path.join(CATEGORIES_DIR, `cat_${c}`);
      for (let f = 0; f < FILES_PER_CATEGORY; f++) {
          if (f % 2 === 0) {
              const filePath = path.join(catDir, `file_${f}.json`);
              allMtimePromises.push(fs.utimes(filePath, oldDate, oldDate));
          }
      }
  }
  await Promise.all(allMtimePromises);
}

// Sequential implementation
async function cleanOldDataSequential(dataDir: string, daysToKeep = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const sessionsDir = path.join(dataDir, 'sessions');

    // Sessions
    const sessionFiles = await fs.readdir(sessionsDir);
    for (const sessionFile of sessionFiles) {
        const sessionPath = path.join(sessionsDir, sessionFile);
        const stats = await fs.stat(sessionPath);
        if (stats.mtime < cutoffDate) {
            await fs.unlink(sessionPath);
        }
    }

    // Categories
    const categoriesDir = path.join(dataDir, 'categories');
    const categories = await fs.readdir(categoriesDir);
    for (const category of categories) {
        const categoryDir = path.join(categoriesDir, category);
        const categoryFiles = await fs.readdir(categoryDir);
        for (const file of categoryFiles) {
            const filePath = path.join(categoryDir, file);
            const stats = await fs.stat(filePath);
            if (stats.mtime < cutoffDate) {
                await fs.unlink(filePath);
            }
        }
    }
}

async function runBenchmark(): Promise<void> {
    console.log('Setting up data...');
    await setupData();
    console.log(`Data setup complete. ${SESSION_COUNT} sessions, ${CATEGORY_COUNT * FILES_PER_CATEGORY} category files.`);

    console.log('Running Sequential Cleanup...');
    const startSeq = process.hrtime.bigint();
    await cleanOldDataSequential(DATA_DIR);
    const endSeq = process.hrtime.bigint();
    const durationSeq = Number(endSeq - startSeq) / 1e6; // ms
    console.log(`Sequential Cleanup: ${durationSeq.toFixed(2)} ms`);

    // Reset data
    console.log('Resetting data...');
    await setupData();

    console.log('Running Parallel Cleanup (ProductSearcher.cleanOldData)...');
    const searcher = new ProductSearcher(mockClient, DATA_DIR, CONTENT_DIR);
    const startPar = process.hrtime.bigint();
    await searcher.cleanOldData();
    const endPar = process.hrtime.bigint();
    const durationPar = Number(endPar - startPar) / 1e6; // ms
    console.log(`Parallel Cleanup: ${durationPar.toFixed(2)} ms`);

    console.log('------------------------------------------------');
    console.log(`Speedup: ${(durationSeq / durationPar).toFixed(2)}x`);

    await fs.rm(TEST_DIR, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
