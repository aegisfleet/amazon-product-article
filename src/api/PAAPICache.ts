import fs from 'fs';
import path from 'path';
import { ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';

interface CacheEntry {
    data: ProductDetail | null;
    timestamp: number;
    status: 'valid' | 'invalid';
}

interface CacheStore {
    [asin: string]: CacheEntry;
}

export class PAAPICache {
    private cachePath: string;
    private cache: CacheStore = {};
    private ttl: number; // Time to live in milliseconds for valid entries
    private invalidTtl: number; // Time to live in milliseconds for invalid entries
    private logger = Logger.getInstance();
    private isLoaded = false;

    // Regex to match invisible Unicode control characters
    // Includes: LRM (U+200E), RLM (U+200F), zero-width chars (U+200B-U+200D, U+FEFF), etc.
    private static readonly INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u2028-\u202F\uFEFF]/g;

    constructor(ttlHours: number = 24, invalidTtlHours: number = 1, cacheDir: string = 'data/cache') {
        this.ttl = ttlHours * 60 * 60 * 1000;
        this.invalidTtl = invalidTtlHours * 60 * 60 * 1000;
        this.cachePath = path.join(process.cwd(), cacheDir, 'paapi-product-cache.json');
        this.load();
    }

    /**
     * Load cache from disk
     */
    private load(): void {
        try {
            if (fs.existsSync(this.cachePath)) {
                const rawData = fs.readFileSync(this.cachePath, 'utf-8');
                const parsed = JSON.parse(rawData) as Record<string, unknown>;

                // Migration check: if old format (without status), assume valid
                this.cache = {};
                for (const [key, value] of Object.entries(parsed)) {
                    const entry = value as Partial<CacheEntry> & Record<string, unknown>;
                    if (entry && typeof entry === 'object' && !entry.status) {
                        this.cache[key] = {
                            data: (entry.data as ProductDetail | null) || null,
                            timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
                            status: 'valid'
                        };
                    } else if (entry && entry.status) {
                        this.cache[key] = entry as CacheEntry;
                    }
                }

                this.isLoaded = true;
                this.logger.info(`PA-API Cache loaded: ${Object.keys(this.cache).length} entries`);
            } else {
                this.ensureDirectory();
                this.cache = {};
                this.isLoaded = true;
                this.logger.info('PA-API Cache initialized (new)');
            }
        } catch (error) {
            this.logger.warn('Failed to load PA-API Cache:', error);
            this.cache = {}; // Start fresh on error
        }
    }

    /**
     * Ensure cache directory exists
     */
    private ensureDirectory(): void {
        const dir = path.dirname(this.cachePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Save cache to disk
     */
    public save(): void {
        try {
            this.ensureDirectory();
            fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
            this.logger.info('PA-API Cache saved to disk');
        } catch (error) {
            this.logger.error('Failed to save PA-API Cache:', error);
        }
    }

    /**
     * Get item from cache if it exists and is valid
     * Returns null if not found, expired, or marked invalid
     */
    public get(asin: string): ProductDetail | null {
        const entry = this.cache[asin];

        if (!entry) {
            return null;
        }

        // Check expiration
        let effectiveTtl = this.ttl;
        if (entry.status === 'invalid') {
            // Only use the shorter invalidTtl if we have an investigation result for this ASIN
            effectiveTtl = this.isInvestigationFileExists(asin) ? this.invalidTtl : this.ttl;
        }

        if (Date.now() - entry.timestamp > effectiveTtl) {
            return null;
        }

        // Return data only if status is valid
        if (entry.status === 'invalid') {
            return null;
        }

        return entry.data;
    }

    /**
     * Check if ASIN is marked as invalid/not-found and is still within TTL
     */
    public isInvalid(asin: string): boolean {
        const entry = this.cache[asin];
        if (!entry) return false;

        if (entry.status !== 'invalid') return false;

        // Only use the shorter invalidTtl if we have an investigation result for this ASIN
        const effectiveTtl = this.isInvestigationFileExists(asin) ? this.invalidTtl : this.ttl;

        if (Date.now() - entry.timestamp > effectiveTtl) {
            return false; // Expired, so re-check validity
        }

        return true;
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
        return str.replace(PAAPICache.INVISIBLE_CHARS_REGEX, '');
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
            return (data as unknown[]).map(item => this.sanitizeData(item)) as unknown as T;
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
     */
    public set(asin: string, data: ProductDetail): void {
        const sanitizedData = this.sanitizeData(data);
        this.cache[asin] = {
            data: sanitizedData,
            timestamp: Date.now(),
            status: 'valid'
        };
    }

    /**
     * Mark item as invalid (e.g. not found in PA-API)
     */
    public markInvalid(asin: string): void {
        this.cache[asin] = {
            data: null,
            timestamp: Date.now(),
            status: 'invalid'
        };
    }

    /**
     * Get multiple items from cache
     * Returns a map of found valid items
     */
    public getMultiple(asins: string[]): Map<string, ProductDetail> {
        const result = new Map<string, ProductDetail>();

        for (const asin of asins) {
            const data = this.get(asin);
            if (data) {
                result.set(asin, data);
            }
        }

        return result;
    }

    /**
     * Helper to determine which asins are missing from cache or expired
     * Also filters out ASINs known to be invalid so we don't re-fetch them
     */
    public getMissingAsins(asins: string[]): string[] {
        return asins.filter(asin => {
            // If we have valid data, it's not missing
            if (this.get(asin)) return false;

            // If it's known invalid (and fresh), we don't want to fetch it, so it's not "missing" for the purpose of fetching
            if (this.isInvalid(asin)) return false;

            // Otherwise (not in cache, expired, or invalid-but-expired), it is missing
            return true;
        });
    }
}
