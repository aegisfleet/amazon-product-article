/**
 * Product Searcher - Category-based product search and data management
 * Handles product search across multiple categories and structured data storage
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { CreatorsAPIClient } from '../api/CreatorsAPIClient';
import categories from '../config/categories.json';
import categoryMapping from '../config/categoryMapping.json';
import { ConfigManager, SystemConfig } from '../config/ConfigManager';
import { InvestigationResult } from '../types/JulesTypes';
import {
  Product,
  ProductSearchParams,
  ProductSearchResult
} from '../types/Product';
import { Logger } from '../utils/Logger';

const DEFAULT_KEYWORDS = ['おすすめ', '人気', 'ランキング'];
const DEFAULT_MAX_RESULTS = 10;

export interface CategoryConfig {
  name: string;
  searchIndex: string;
  keywords: string[];
  maxResults: number;
  sortBy?: 'relevance' | 'price' | 'rating' | 'featured' | 'newest';
  enabled: boolean;
}

export interface SearchSession {
  id: string;
  timestamp: Date;
  categories: string[];
  totalProducts: number;
  results: ProductSearchResult[];
}

export class ProductSearcher {
  private logger = Logger.getInstance();
  private creatorsClient: CreatorsAPIClient;
  private config = ConfigManager.getInstance();
  private dataDir: string;
  private contentDir: string;

  constructor(creatorsClient: CreatorsAPIClient, dataDir?: string, contentDir?: string) {
    this.creatorsClient = creatorsClient;
    this.dataDir = dataDir || path.join(process.cwd(), 'data', 'products');
    this.contentDir = contentDir || path.join(process.cwd(), 'content', 'articles');
  }

  /**
   * Initialize the product searcher
   */
  async initialize(): Promise<void> {
    await this.ensureDataDirectory();
    this.logger.info('ProductSearcher initialized');
  }

  /**
   * Search products by specific ASINs
   */
  async searchByAsins(asins: string[]): Promise<SearchSession> {
    const sessionId = this.generateSessionId();
    const results: ProductSearchResult[] = [];
    const products: Product[] = [];

    this.logger.info(`Starting manual product search session ${sessionId} for ${asins.length} ASINs`);

    for (const asin of asins) {
      try {
        const productDetail = await this.creatorsClient.getProductDetails(asin);
        // Convert ProductDetail to Product (ProductDetail extends Product, so this is safe)
        products.push(productDetail);
        this.logger.info(`Found product: ${productDetail.title} (${asin})`);
      } catch (error) {
        this.logger.error(`Failed to fetch product for ASIN ${asin}:`, error);
      }

      // Rate limiting
      await this.sleep(200);
    }

    if (products.length > 0) {
      const result: ProductSearchResult = {
        products,
        totalResults: products.length,
        searchParams: {
          category: 'Manual',
          keywords: asins,
          maxResults: asins.length
        },
        timestamp: new Date()
      };

      results.push(result);
      await this.saveCategoryResults(sessionId, 'manual', result);
    }

    const session: SearchSession = {
      id: sessionId,
      timestamp: new Date(),
      categories: ['Manual'],
      totalProducts: products.length,
      results
    };

    await this.saveSearchSession(session);
    return session;
  }

  /**
   * Search products across all enabled categories
   * @param targetCategoryNames Optional list of category names to search. If provided, only these categories will be searched.
   * @param maxResultsOverride Optional override for maxResults per category (uses category default if not provided)
   */
  async searchAllCategories(targetCategoryNames?: string[], maxResultsOverride?: number): Promise<SearchSession> {
    let categories = this.getEnabledCategories();

    if (targetCategoryNames && targetCategoryNames.length > 0) {
      categories = categories.filter(c => targetCategoryNames.includes(c.name));
      this.logger.info(`Filtering categories: ${targetCategoryNames.join(', ')}. Result: ${categories.length} categories found.`);
    }

    // Shuffle categories to vary the starting point
    this.shuffleArray(categories);

    const sessionId = this.generateSessionId();
    const results: ProductSearchResult[] = [];
    let totalProducts = 0;

    // Get exclusion list (products already investigated)
    const exclusionList = await this.getExclusionList();
    this.logger.info(`Found ${exclusionList.asins.size} existing products to exclude`);

    this.logger.info(`Starting product search session ${sessionId} for ${categories.length} categories`);

    for (const category of categories) {
      // Don't search too many categories in one run if we already found enough
      // But let's keep searching all configured categories for now as per requirement
      // unless we want to limit total products per session

      try {
        // Pick a random keyword from the category's keyword list
        const keyword = category.keywords[Math.floor(Math.random() * category.keywords.length)] || category.keywords[0] || 'popular';
        this.logger.info(`Searching category: ${category.name} with keyword: ${keyword}`);

        // Use override if provided, otherwise use category's configured maxResults
        const effectiveMaxResults = maxResultsOverride ?? category.maxResults;

        const searchParams: ProductSearchParams = {
          category: category.name,
          searchIndex: category.searchIndex,
          keywords: [keyword], // Use the single random keyword
          maxResults: effectiveMaxResults,
          ...(category.sortBy ? { sortBy: category.sortBy } : {})
        };

        let result: ProductSearchResult;
        try {
          result = await this.creatorsClient.searchProducts(searchParams);
        } catch (error) {
          this.logger.warn(`Failed to search category ${category.name} with specific index, retrying with 'All' index. Error: ${error instanceof Error ? error.message : String(error)}`);

          // Retry with 'All' index - this is a more robust fallback
          const fallbackParams: ProductSearchParams = {
            ...searchParams,
            category: 'All'
          };
          result = await this.creatorsClient.searchProducts(fallbackParams);
        }

        // Filter out excluded products
        const initialCount = result.products.length;
        const seenParentAsins = new Set<string>();

        result.products = result.products.filter(p => {
          // 1. ASINによる除外
          if (exclusionList.asins.has(p.asin)) {
            return false;
          }

          // 2. 親ASINによる除外（既存の調査済み商品との重複回避）
          if (p.parentAsin) {
            if (exclusionList.parentAsins.has(p.parentAsin)) {
              return false;
            }
            // 親ASIN自体が単体で調査済みの可能性も考慮
            if (exclusionList.asins.has(p.parentAsin)) {
              return false;
            }
          }

          // 3. 同一検索セッション内でのバリエーション重複回避
          const parentKey = p.parentAsin || p.asin;
          if (seenParentAsins.has(parentKey)) {
            return false;
          }
          seenParentAsins.add(parentKey);

          return true;
        });

        if (initialCount !== result.products.length) {
          this.logger.info(`Filtered ${initialCount - result.products.length} products (already investigated or variations) from ${category.name}`);
        }

        if (result.products.length > 0) {
          results.push(result);
          totalProducts += result.products.length;

          // Save category results
          await this.saveCategoryResults(sessionId, category.name, result);
          this.logger.info(`Found ${result.products.length} new products in ${category.name}`);
        } else {
          this.logger.info(`No new products found in ${category.name}`);
        }

        // Rate limiting delay between categories
        await this.sleep(1000);

      } catch (error) {
        this.logger.error(`Failed to search category ${category.name}:`, error);
        // Continue with other categories
      }
    }

    const session: SearchSession = {
      id: sessionId,
      timestamp: new Date(),
      categories: categories.map(c => c.name),
      totalProducts,
      results
    };

    await this.saveSearchSession(session);

    this.logger.info(`Search session ${sessionId} completed: ${totalProducts} total products`);
    return session;
  }

  /**
   * Search products in a specific category
   */
  async searchCategory(categoryName: string, customKeywords?: string[]): Promise<ProductSearchResult> {
    const category = this.getCategoryConfig(categoryName);
    if (!category) {
      throw new Error(`Category '${categoryName}' not found in configuration`);
    }

    const searchParams: ProductSearchParams = {
      category: category.name,
      searchIndex: category.searchIndex,
      keywords: customKeywords || category.keywords,
      maxResults: category.maxResults,
      ...(category.sortBy ? { sortBy: category.sortBy } : {})
    };

    this.logger.info(`Searching category ${categoryName} with keywords: ${searchParams.keywords.join(', ')}`);

    const result = await this.creatorsClient.searchProducts(searchParams);

    // Save results
    const sessionId = this.generateSessionId();
    await this.saveCategoryResults(sessionId, categoryName, result);

    this.logger.info(`Found ${result.products.length} products in ${categoryName}`);
    return result;
  }

  /**
   * Get products from stored data by category
   */
  async getStoredProducts(categoryName: string, sessionId?: string): Promise<Product[]> {
    try {
      const categoryDir = path.join(this.dataDir, 'categories', categoryName);

      if (sessionId) {
        const filePath = path.join(categoryDir, `${sessionId}.json`);
        const data = await fs.readFile(filePath, 'utf-8');
        const result = JSON.parse(data) as ProductSearchResult;
        return result.products;
      }

      // Get latest session if no sessionId provided
      const files = await fs.readdir(categoryDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

      if (jsonFiles.length === 0) {
        return [];
      }

      const latestFile = path.join(categoryDir, jsonFiles[0]!);
      const data = await fs.readFile(latestFile, 'utf-8');
      const result = JSON.parse(data) as ProductSearchResult;
      return result.products;

    } catch (error: unknown) {
      this.logger.warn(`Failed to load stored products for ${categoryName}:`, error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * Get all stored products across categories
   */
  async getAllStoredProducts(): Promise<Record<string, Product[]>> {
    const categories = this.getEnabledCategories();

    const entries = await Promise.all(
      categories.map(async (category) => {
        const products = await this.getStoredProducts(category.name);
        return [category.name, products] as const;
      })
    );

    return Object.fromEntries(entries);
  }

  /**
   * Search for products with custom parameters
   */
  async customSearch(params: ProductSearchParams): Promise<ProductSearchResult> {
    this.logger.info(`Custom search: ${params.category} - ${params.keywords.join(', ')}`);

    const result = await this.creatorsClient.searchProducts(params);

    // Save custom search results
    const sessionId = this.generateSessionId();
    await this.saveCategoryResults(sessionId, `custom_${params.category}`, result);

    // Also save session for statistics tracking
    const session: SearchSession = {
      id: sessionId,
      timestamp: new Date(),
      categories: [params.category],
      totalProducts: result.products.length,
      results: [result]
    };
    await this.saveSearchSession(session);

    return result;
  }

  /**
   * Get search statistics
   */
  async getSearchStatistics(): Promise<{
    totalSessions: number;
    totalProducts: number;
    categoryCounts: Record<string, number>;
    lastSearchDate?: Date;
  }> {
    try {
      const sessionsDir = path.join(this.dataDir, 'sessions');
      const sessionFiles = await fs.readdir(sessionsDir);
      const sessions = sessionFiles.filter(f => f.endsWith('.json'));

      let totalProducts = 0;
      const categoryCounts: Record<string, number> = {};
      let lastSearchDate: Date | undefined;

      const loadedSessions: SearchSession[] = [];
      const CONCURRENCY = 50;
      for (let i = 0; i < sessions.length; i += CONCURRENCY) {
        const batch = sessions.slice(i, i + CONCURRENCY);
        const batchSessions = await Promise.all(batch.map(async (sessionFile) => {
          const sessionPath = path.join(sessionsDir, sessionFile);
          const data = await fs.readFile(sessionPath, 'utf-8');
          return JSON.parse(data) as SearchSession;
        }));
        loadedSessions.push(...batchSessions);
      }

      for (const session of loadedSessions) {
        totalProducts += session.totalProducts;

        if (!lastSearchDate || new Date(session.timestamp) > new Date(lastSearchDate)) {
          lastSearchDate = new Date(session.timestamp);
        }

        for (const result of session.results) {
          const category = result.searchParams.category;
          categoryCounts[category] = (categoryCounts[category] || 0) + result.products.length;
        }
      }

      return {
        totalSessions: sessions.length,
        totalProducts,
        categoryCounts,
        ...(lastSearchDate && { lastSearchDate })
      };

    } catch (error: unknown) {
      this.logger.warn('Failed to get search statistics:', error instanceof Error ? error.message : String(error));
      return {
        totalSessions: 0,
        totalProducts: 0,
        categoryCounts: {}
      };
    }
  }

  /**
   * Clean old search data
   */
  async cleanOldData(daysToKeep = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const sessionsDir = path.join(this.dataDir, 'sessions');
      const sessionFiles = await fs.readdir(sessionsDir);

      // Process session files in batches to prevent EMFILE errors
      await this.processInBatches(sessionFiles, 50, async (sessionFile) => {
        const sessionPath = path.join(sessionsDir, sessionFile);
        const stats = await fs.stat(sessionPath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(sessionPath);
          this.logger.info(`Cleaned old session file: ${sessionFile}`);
        }
      });

      // Clean category data older than cutoff
      const categoriesDir = path.join(this.dataDir, 'categories');
      const categories = await fs.readdir(categoriesDir);

      // Process categories in small batches
      await this.processInBatches(categories, 5, async (category) => {
        const categoryDir = path.join(categoriesDir, category);
        const categoryFiles = await fs.readdir(categoryDir);

        // Process files in each category in batches
        await this.processInBatches(categoryFiles, 50, async (file) => {
          const filePath = path.join(categoryDir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            this.logger.info(`Cleaned old category file: ${category}/${file}`);
          }
        });
      });

    } catch (error) {
      this.logger.error('Failed to clean old data:', error);
    }
  }

  /**
   * Helper to process items in batches
   */
  private async processInBatches<T>(items: T[], batchSize: number, task: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(batch.map(item => task(item)));
    }
  }

  /**
   * Private helper methods
   */
  private getEnabledCategories(): CategoryConfig[] {
    try {
      const config = this.config.getConfig();
      const enabledCategoryNames = config.productSearch?.categories || [];
      const defaultCategories = this.getDefaultCategories();

      if (enabledCategoryNames.length === 0) {
        return defaultCategories;
      }

      return enabledCategoryNames.map(name => {
        const found = defaultCategories.find(d => d.name === name);
        if (found) {
          return found;
        }

        return this.createFallbackCategoryConfig(name, config);
      });
    } catch (_error) {
      return this.getDefaultCategories();
    }
  }

  private getDefaultCategories(): CategoryConfig[] {
    // Categories and keywords tailored for amazon.co.jp
    return categories as CategoryConfig[];
  }

  private getCategoryConfig(categoryName: string): CategoryConfig | undefined {
    try {
      const defaultCategories = this.getDefaultCategories();
      const defaultCat = defaultCategories.find(c => c.name === categoryName);

      if (defaultCat) {
        return defaultCat;
      }

      // If not in defaults, check if it's in config (even if with generic settings)
      const config = this.config.getConfig();
      const categories = config.productSearch?.categories || [];

      if (categories.includes(categoryName)) {
        return this.createFallbackCategoryConfig(categoryName, config);
      }

      return undefined;
    } catch (_error) {
      return this.getDefaultCategories().find(c => c.name === categoryName);
    }
  }

  private generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}_${random}`;
  }

  private async ensureDataDirectory(): Promise<void> {
    const dirs = [
      this.dataDir,
      path.join(this.dataDir, 'sessions'),
      path.join(this.dataDir, 'categories')
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (_error) {
        // Directory might already exist
      }
    }
  }

  private async saveCategoryResults(sessionId: string, categoryName: string, result: ProductSearchResult): Promise<void> {
    try {
      const categoryDir = path.join(this.dataDir, 'categories', categoryName);
      await fs.mkdir(categoryDir, { recursive: true });

      const filePath = path.join(categoryDir, `${sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(result, null, 2));

    } catch (error) {
      this.logger.error(`Failed to save category results for ${categoryName}:`, error);
    }
  }

  private async saveSearchSession(session: SearchSession): Promise<void> {
    try {
      const sessionsDir = path.join(this.dataDir, 'sessions');
      await fs.mkdir(sessionsDir, { recursive: true });

      const filePath = path.join(sessionsDir, `${session.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));

    } catch (error) {
      this.logger.error(`Failed to save search session ${session.id}:`, error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getSearchIndexForCategory(categoryName: string): string {
    const categoryMap = categoryMapping as Record<string, string>;
    return categoryMap[categoryName.toLowerCase()] || 'All';
  }

  /**
   * Get a detailed exclusion list containing ASINs, Parent ASINs, and Product Names
   * that have already been investigated/generated.
   */
  private async getExclusionList(): Promise<{
    asins: Set<string>;
    parentAsins: Set<string>;
    productNames: Set<string>;
  }> {
    const asins = new Set<string>();
    const parentAsins = new Set<string>();
    const productNames = new Set<string>();

    // 1. Check content directory (already published articles)
    try {
      const normalizedContentDir = path.normalize(this.contentDir);
      await fs.access(normalizedContentDir);
      const files = await fs.readdir(normalizedContentDir);
      for (const file of files) {
        const asin = file.endsWith('.md') ? path.basename(file, '.md') : file;
        if (/^[A-Z0-9]{10}$/.test(asin)) {
          asins.add(asin);
        }
      }
    } catch {
      this.logger.debug('Content directory not found or inaccessible');
    }

    // 2. Check investigations directory (already researched)
    try {
      const investigationsDir = path.normalize(path.join(process.cwd(), 'data', 'investigations'));
      await fs.access(investigationsDir);

      const files = await fs.readdir(investigationsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      await this.processInBatches(jsonFiles, 50, async (file) => {
        const asin = path.basename(file, '.json');
        if (/^[A-Z0-9]{10}$/.test(asin)) {
          asins.add(asin);
        }

        const filePath = path.join(investigationsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as InvestigationResult;

          if (data.analysis) {
            if (data.analysis.parentAsin) {
              parentAsins.add(data.analysis.parentAsin);
            }
            if (data.analysis.productName) {
              productNames.add(data.analysis.productName);
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to read/parse investigation file ${file}:`, e);
        }
      });
    } catch {
      this.logger.debug('Investigations directory not found or inaccessible');
    }

    this.logger.info(`Exclusion list: ${asins.size} ASINs, ${parentAsins.size} Parent ASINs, ${productNames.size} Product Names`);
    return { asins, parentAsins, productNames };
  }

  /**
   * Shuffle an array in place
   */
  private shuffleArray(array: unknown[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
  }

  private createFallbackCategoryConfig(name: string, config: SystemConfig): CategoryConfig {
    return {
      name,
      searchIndex: this.getSearchIndexForCategory(name),
      enabled: true,
      keywords: DEFAULT_KEYWORDS,
      maxResults: config.productSearch?.maxResultsPerCategory || DEFAULT_MAX_RESULTS,
      sortBy: 'featured'
    };
  }
}