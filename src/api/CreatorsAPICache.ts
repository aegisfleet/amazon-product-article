import fs from 'node:fs';
import path from 'node:path';
import type { ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';

export interface CacheEntry {
  data: ProductDetail | null;
  timestamp: number;
  status: 'valid' | 'invalid' | 'permanent_invalid';
  previousPrice?: number;
  priceChangedAt?: number;
}

export interface CacheStore {
  [asin: string]: CacheEntry;
}

export class CreatorsAPICache {
  private readonly cacheDir: string;
  private readonly shardsDir: string;
  private readonly legacyCachePath: string;
  private cache: CacheStore = {};
  private readonly loadedShards = new Set<string>();
  private readonly dirtyShards = new Set<string>();
  private readonly ttl: number; // Time to live in milliseconds for valid entries
  private readonly invalidTtl: number; // Time to live in milliseconds for invalid entries
  private readonly permanentInvalidTtl: number; // Time to live in milliseconds for permanent invalid entries (1 week)
  private readonly logger = Logger.getInstance();

  // Regex to match invisible Unicode control characters
  // Includes: LRM (U+200E), RLM (U+200F), zero-width chars (U+200B-U+200D, U+FEFF), etc.
  private static readonly INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u2028-\u202F\uFEFF]/g;

  constructor(
    ttlHours: number = 24,
    invalidTtlMinutes: number = 5,
    cacheDir: string = 'data/cache',
    permanentInvalidTtlDays: number = 7,
  ) {
    this.ttl = ttlHours * 60 * 60 * 1000;
    this.invalidTtl = invalidTtlMinutes * 60 * 1000; // 5分（一時的な失敗からの早期回復用）
    this.permanentInvalidTtl = permanentInvalidTtlDays * 24 * 60 * 60 * 1000; // 1週間
    this.cacheDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
    this.shardsDir = path.join(this.cacheDir, 'paapi');
    this.legacyCachePath = path.join(this.cacheDir, 'paapi-product-cache.json');
  }

  /**
   * Calculate 2-character shard key from ASIN (last 2 characters, uppercase)
   */
  public static getShardKey(asin: string): string {
    const clean = asin.trim().toUpperCase();
    if (clean.length < 2) {
      return clean.padStart(2, '0');
    }
    return clean.slice(-2);
  }

  /**
   * Get file path for a shard key
   */
  public getShardPath(shardKey: string): string {
    return path.join(this.shardsDir, `${shardKey}.json`);
  }

  /**
   * Normalize an entry, providing defaults for missing status (migration)
   */
  public static normalizeCacheEntry(entry: Partial<CacheEntry> & Record<string, unknown>): CacheEntry {
    const data = (entry.data as ProductDetail | null) ?? null;
    // Trim description and features to reduce file size
    if (data && typeof data === 'object') {
      delete data.description;
      data.features = [];
    }

    const previousPrice = typeof entry.previousPrice === 'number' ? entry.previousPrice : undefined;
    const priceChangedAt = typeof entry.priceChangedAt === 'number' ? entry.priceChangedAt : undefined;

    if (entry.status) {
      const normalized: CacheEntry = entry as CacheEntry;
      if (previousPrice !== undefined) normalized.previousPrice = previousPrice;
      if (priceChangedAt !== undefined) normalized.priceChangedAt = priceChangedAt;
      return normalized;
    }

    // Migration logic for old format (without status)
    return {
      data,
      timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
      status: 'valid',
      ...(previousPrice !== undefined && { previousPrice }),
      ...(priceChangedAt !== undefined && { priceChangedAt }),
    };
  }

  /**
   * Ensure a specific shard is loaded into memory
   */
  private ensureShardLoaded(shardKey: string): void {
    if (this.loadedShards.has(shardKey)) {
      return;
    }

    const shardPath = this.getShardPath(shardKey);
    try {
      if (fs.existsSync(shardPath)) {
        const rawData = fs.readFileSync(shardPath, 'utf-8');
        const parsed = JSON.parse(rawData) as Record<string, unknown>;
        for (const [key, entry] of Object.entries(parsed)) {
          if (entry && typeof entry === 'object') {
            this.cache[key] = CreatorsAPICache.normalizeCacheEntry(entry as Partial<CacheEntry>);
          }
        }
      } else if (fs.existsSync(this.legacyCachePath) && !fs.existsSync(this.shardsDir)) {
        // Fallback to legacy single file if shards directory doesn't exist
        this.loadLegacyCache();
      }
    } catch (error) {
      this.logger.warn(`Failed to load cache shard ${shardKey}:`, error);
    }

    this.loadedShards.add(shardKey);
  }

  /**
   * Load entire legacy cache file into memory (fallback)
   */
  private loadLegacyCache(): void {
    try {
      if (!fs.existsSync(this.legacyCachePath)) return;
      const rawData = fs.readFileSync(this.legacyCachePath, 'utf-8');
      const parsed = JSON.parse(rawData) as Record<string, unknown>;
      for (const [key, entry] of Object.entries(parsed)) {
        if (entry && typeof entry === 'object') {
          this.cache[key] = CreatorsAPICache.normalizeCacheEntry(entry as Partial<CacheEntry>);
        }
      }
      this.logger.info(`Loaded legacy cache: ${Object.keys(this.cache).length} entries`);
    } catch (error) {
      this.logger.warn('Failed to load legacy Creators API Cache:', error);
    }
  }

  /**
   * Load all shards from disk into memory
   */
  public loadAll(): void {
    const store = CreatorsAPICache.loadAll(this.cacheDir);
    this.cache = store;
    // Mark all existing shards as loaded
    if (fs.existsSync(this.shardsDir)) {
      const files = fs.readdirSync(this.shardsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        this.loadedShards.add(path.basename(file, '.json'));
      }
    }
  }

  /**
   * Get all entries currently loaded (loads all shards if not fully loaded)
   */
  public getAllEntries(): CacheStore {
    this.loadAll();
    return this.cache;
  }

  private static loadEntriesFromFile(filePath: string, store: CacheStore): void {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, entry] of Object.entries(parsed)) {
        if (entry && typeof entry === 'object') {
          store[key] = CreatorsAPICache.normalizeCacheEntry(entry as Partial<CacheEntry>);
        }
      }
    } catch {
      // ignore error on individual corrupt shard to stay resilient
    }
  }

  private static loadFromShards(shardsDir: string): CacheStore {
    const store: CacheStore = {};
    const files = fs.readdirSync(shardsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      CreatorsAPICache.loadEntriesFromFile(path.join(shardsDir, file), store);
    }
    return store;
  }

  /**
   * Static helper: Load all cache entries from shards (or legacy fallback)
   */
  public static loadAll(cacheDir: string = 'data/cache'): CacheStore {
    const resolvedDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
    const shardsDir = path.join(resolvedDir, 'paapi');
    if (fs.existsSync(shardsDir)) {
      return CreatorsAPICache.loadFromShards(shardsDir);
    }

    const legacyPath = path.join(resolvedDir, 'paapi-product-cache.json');
    const store: CacheStore = {};
    if (fs.existsSync(legacyPath)) {
      CreatorsAPICache.loadEntriesFromFile(legacyPath, store);
    }

    return store;
  }

  private static async writeShardFile(shardPath: string, shardEntries: CacheStore): Promise<void> {
    const tmpPath = `${shardPath}.tmp`;
    const sortedKeys = Object.keys(shardEntries).sort((a, b) => a.localeCompare(b));
    const lines = sortedKeys.map((key) => `  "${key}": ${JSON.stringify(shardEntries[key])}`);
    const jsonContent = `{\n${lines.join(',\n')}\n}\n`;

    await fs.promises.writeFile(tmpPath, jsonContent, 'utf-8');
    await fs.promises.rename(tmpPath, shardPath);
  }

  /**
   * Static helper: Save entire CacheStore into shards
   */
  public static async saveAll(store: CacheStore, cacheDir: string = 'data/cache'): Promise<void> {
    const resolvedDir = path.isAbsolute(cacheDir) ? cacheDir : path.join(process.cwd(), cacheDir);
    const shardsDir = path.join(resolvedDir, 'paapi');
    await fs.promises.mkdir(shardsDir, { recursive: true });

    // Group by shard
    const shards: Record<string, CacheStore> = {};
    for (const [asin, entry] of Object.entries(store)) {
      const shardKey = CreatorsAPICache.getShardKey(asin);
      shards[shardKey] ??= {};
      shards[shardKey][asin] = entry;
    }

    await Promise.all(
      Object.entries(shards).map(([shardKey, shardEntries]) => {
        const shardPath = path.join(shardsDir, `${shardKey}.json`);
        return CreatorsAPICache.writeShardFile(shardPath, shardEntries);
      }),
    );
  }

  /**
   * Save dirty shards to disk atomically
   */
  public async save(): Promise<void> {
    try {
      if (this.dirtyShards.size === 0) {
        return;
      }

      await fs.promises.mkdir(this.shardsDir, { recursive: true });

      const dirtyKeys = Array.from(this.dirtyShards);
      await Promise.all(
        dirtyKeys.map((shardKey) => {
          const shardPath = this.getShardPath(shardKey);
          const shardEntries: CacheStore = {};
          for (const [asin, entry] of Object.entries(this.cache)) {
            if (CreatorsAPICache.getShardKey(asin) === shardKey) {
              shardEntries[asin] = entry;
            }
          }
          return CreatorsAPICache.writeShardFile(shardPath, shardEntries);
        }),
      );

      this.logger.info(`Creators API Cache saved ${this.dirtyShards.size} dirty shards to disk`);
      this.dirtyShards.clear();
    } catch (error) {
      this.logger.error('Failed to save Creators API Cache:', error);
    }
  }

  /**
   * Get item from cache if it exists and is valid
   * Returns null if not found, expired, or marked invalid
   * @param options.ignoreExpiration If true, returns valid data even if expired
   */
  public get(asin: string, options: { ignoreExpiration?: boolean; allowInvalid?: boolean } = {}): ProductDetail | null {
    const shardKey = CreatorsAPICache.getShardKey(asin);
    this.ensureShardLoaded(shardKey);

    const entry = this.cache[asin];
    if (!entry) {
      return null;
    }

    // Check expiration
    let effectiveTtl = this.ttl;
    if (entry.status === 'invalid') {
      // Only use the shorter invalidTtl if we have an investigation result for this ASIN
      effectiveTtl = this.isInvestigationFileExists(asin) ? this.invalidTtl : this.ttl;
    } else if (entry.status === 'permanent_invalid') {
      effectiveTtl = this.permanentInvalidTtl;
    }

    if (!options.ignoreExpiration && Date.now() - entry.timestamp > effectiveTtl) {
      return null;
    }

    // Return data only if status is valid, unless allowInvalid is true
    if (entry.status !== 'valid' && !options.allowInvalid) {
      return null;
    }

    return entry.data;
  }

  /**
   * Check if ASIN is marked as invalid/not-found and is still within TTL
   */
  public isInvalid(asin: string): boolean {
    const shardKey = CreatorsAPICache.getShardKey(asin);
    this.ensureShardLoaded(shardKey);

    const entry = this.cache[asin];
    if (!entry) return false;

    if (entry.status === 'valid') return false;

    // Check expiration
    let effectiveTtl = this.ttl;
    if (entry.status === 'invalid') {
      effectiveTtl = this.isInvestigationFileExists(asin) ? this.invalidTtl : this.ttl;
    } else if (entry.status === 'permanent_invalid') {
      effectiveTtl = this.permanentInvalidTtl;
    }

    if (Date.now() - entry.timestamp > effectiveTtl) {
      return false; // Expired, so re-check validity
    }

    return true;
  }

  /**
   * Check if ASIN is marked as permanent_invalid and has expired
   */
  public isExpiredPermanentInvalid(asin: string): boolean {
    const shardKey = CreatorsAPICache.getShardKey(asin);
    this.ensureShardLoaded(shardKey);

    const entry = this.cache[asin];
    if (!entry) return false;

    if (entry.status !== 'permanent_invalid') return false;

    const effectiveTtl = this.permanentInvalidTtl;
    if (Date.now() - entry.timestamp > effectiveTtl) {
      return true;
    }

    return false;
  }

  /**
   * Check if investigation result file exists for the given ASIN
   */
  private isInvestigationFileExists(asin: string): boolean {
    const filePath = path.join(process.cwd(), 'data/investigations', `${asin}.json`);
    return fs.existsSync(filePath);
  }

  /**
   * Sanitize string by removing invisible Unicode control characters
   */
  private sanitizeString(str: string): string {
    return str.replace(CreatorsAPICache.INVISIBLE_CHARS_REGEX, '');
  }

  /**
   * Recursively sanitize all string values in an object
   */
  private sanitizeData<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data) as unknown as T;
    }

    if (Array.isArray(data)) {
      return (data as unknown[]).map((item) => this.sanitizeData(item)) as unknown as T;
    }

    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.sanitizeData(value);
      }
      return result as T;
    }

    return data;
  }

  /**
   * Set item in cache as valid
   * If new data has no price info but existing cache has valid price, preserve it
   */
  public set(asin: string, data: ProductDetail): void {
    const shardKey = CreatorsAPICache.getShardKey(asin);
    this.ensureShardLoaded(shardKey);

    const sanitizedData = this.sanitizeData(data);

    const existingEntry = this.cache[asin];
    let previousPrice = existingEntry?.previousPrice;
    let priceChangedAt = existingEntry?.priceChangedAt;

    const oldPrice = existingEntry?.data?.price?.amount;
    const newPrice = sanitizedData?.price?.amount;

    if (oldPrice && newPrice && oldPrice > 0 && newPrice > 0 && oldPrice !== newPrice) {
      previousPrice = oldPrice;
      priceChangedAt = Date.now();
    }

    // Check if new data has "価格情報なし" and existing cache has valid price
    if (this.isNoPriceData(sanitizedData) && existingEntry?.data && !this.isNoPriceData(existingEntry.data)) {
      this.logger.info(
        `Preserving existing price for ASIN ${asin}: ${existingEntry.data.price.formatted} (new data has no price)`,
      );
      sanitizedData.price = existingEntry.data.price;
    }

    // Trim description and features to reduce file size
    delete sanitizedData.description;
    sanitizedData.features = [];

    this.cache[asin] = {
      data: sanitizedData,
      timestamp: Date.now(),
      status: 'valid',
      ...(previousPrice !== undefined && { previousPrice }),
      ...(priceChangedAt !== undefined && { priceChangedAt }),
    };

    this.dirtyShards.add(shardKey);
  }

  /**
   * Check if product data has no price information
   */
  private isNoPriceData(data: ProductDetail): boolean {
    return data.price.amount === 0 && data.price.formatted === '価格情報なし';
  }

  /**
   * Remove deal badges and temporary sale data when marking as invalid
   */
  private sanitizePreservedData(data: ProductDetail | null | undefined): ProductDetail | null {
    if (!data) return null;
    const sanitized = { ...data };
    delete sanitized.dealBadge;
    delete sanitized.savingsPercentage;
    delete sanitized.dealAccessType;
    return sanitized;
  }

  /**
   * Mark item as invalid (e.g. not found in Creators API)
   */
  public markInvalid(asin: string): void {
    const shardKey = CreatorsAPICache.getShardKey(asin);
    this.ensureShardLoaded(shardKey);

    const existing = this.cache[asin];
    if (existing?.status === 'valid' && Date.now() - existing.timestamp <= this.ttl) {
      this.logger.info(`Not marking ASIN ${asin} as invalid because a non-expired valid cache entry already exists.`);
      return;
    }

    this.cache[asin] = {
      data: this.sanitizePreservedData(existing?.data),
      timestamp: Date.now(),
      status: 'invalid',
    };

    this.dirtyShards.add(shardKey);
  }

  /**
   * Mark item as permanently invalid (e.g. InvalidParameterValue - re-check only once a week)
   */
  public markPermanentInvalid(asin: string): void {
    const shardKey = CreatorsAPICache.getShardKey(asin);
    this.ensureShardLoaded(shardKey);

    const existing = this.cache[asin];
    if (existing?.status === 'valid' && Date.now() - existing.timestamp <= this.ttl) {
      this.logger.info(
        `Not marking ASIN ${asin} as permanent_invalid because a non-expired valid cache entry already exists.`,
      );
      return;
    }

    this.cache[asin] = {
      data: this.sanitizePreservedData(existing?.data),
      timestamp: Date.now(),
      status: 'permanent_invalid',
    };

    this.dirtyShards.add(shardKey);
  }

  /**
   * Get multiple items from cache
   */
  public getMultiple(
    asins: string[],
    options: { ignoreExpiration?: boolean; allowInvalid?: boolean } = {},
  ): Map<string, ProductDetail> {
    const result = new Map<string, ProductDetail>();

    for (const asin of asins) {
      const data = this.get(asin, options);
      if (data) {
        result.set(asin, data);
      }
    }

    return result;
  }

  /**
   * Helper to determine which asins are missing from cache or expired
   */
  public getMissingAsins(asins: string[]): string[] {
    return asins.filter((asin) => {
      if (this.get(asin)) return false;
      if (this.isInvalid(asin)) return false;
      return true;
    });
  }
}
