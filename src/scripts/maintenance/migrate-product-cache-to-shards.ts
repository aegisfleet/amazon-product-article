import fs from 'node:fs';
import path from 'node:path';
import { type CacheStore, CreatorsAPICache } from '../../api/CreatorsAPICache';

async function migrate() {
  const cacheDir = path.resolve(process.cwd(), 'data/cache');
  const legacyFile = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(cacheDir, 'paapi-product-cache.json');
  const shardsDir = path.join(cacheDir, 'paapi');

  console.log('🚀 Starting cache migration to shards...');
  console.log(`📁 Source legacy file: ${legacyFile}`);
  console.log(`📁 Target shards directory: ${shardsDir}`);

  if (!fs.existsSync(legacyFile)) {
    console.error(`❌ Legacy cache file not found: ${legacyFile}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(legacyFile, 'utf-8');
  const legacyStore = JSON.parse(rawData) as CacheStore;
  const legacyKeys = Object.keys(legacyStore);
  console.log(`📦 Loaded ${legacyKeys.length} items from legacy cache.`);

  console.log('🔄 Saving entries into shards...');
  const t0 = performance.now();
  await CreatorsAPICache.saveAll(legacyStore, cacheDir);
  console.log(`✅ Saved all shards in ${(performance.now() - t0).toFixed(1)} ms.`);

  // Validation
  console.log('🔍 Validating migrated shards...');
  const loadedStore = CreatorsAPICache.loadAll(cacheDir);
  const loadedKeys = Object.keys(loadedStore);
  console.log(`📦 Loaded ${loadedKeys.length} items from shards.`);

  if (loadedKeys.length !== legacyKeys.length) {
    console.error(`❌ Item count mismatch! Legacy: ${legacyKeys.length}, Migrated: ${loadedKeys.length}`);
    process.exit(1);
  }

  const shardFiles = fs.readdirSync(shardsDir).filter((f) => f.endsWith('.json'));
  console.log(`🎉 Migration verified successfully!`);
  console.log(`📊 Shard files created: ${shardFiles.length}`);
  console.log(`📊 Total entries verified: ${loadedKeys.length}`);
}

migrate().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
