/**
 * Product Searcher - Category-based product search and data management
 * Handles product search across multiple categories and structured data storage
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PAAPIClient } from '../api/PAAPIClient';
import { ConfigManager } from '../config/ConfigManager';
import {
  Product,
  ProductSearchParams,
  ProductSearchResult
} from '../types/Product';
import { Logger } from '../utils/Logger';

export interface CategoryConfig {
  name: string;
  searchIndex: string;
  keywords: string[];
  maxResults: number;
  sortBy?: 'relevance' | 'price' | 'rating';
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
  private papiClient: PAAPIClient;
  private config = ConfigManager.getInstance();
  private dataDir: string;
  private contentDir: string;

  constructor(papiClient: PAAPIClient) {
    this.papiClient = papiClient;
    this.dataDir = path.join(process.cwd(), 'data', 'products');
    this.contentDir = path.join(process.cwd(), 'content', 'articles');
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
        const productDetail = await this.papiClient.getProductDetails(asin);
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
   */
  async searchAllCategories(): Promise<SearchSession> {
    const categories = this.getEnabledCategories();
    // Shuffle categories to vary the starting point
    this.shuffleArray(categories);

    const sessionId = this.generateSessionId();
    const results: ProductSearchResult[] = [];
    let totalProducts = 0;

    // Get exclusion list (products already investigated)
    const exclusionList = await this.getExclusionList();
    this.logger.info(`Found ${exclusionList.size} existing products to exclude`);

    this.logger.info(`Starting product search session ${sessionId} for ${categories.length} categories`);

    for (const category of categories) {
      // Don't search too many categories in one run if we already found enough
      // But let's keep searching all configured categories for now as per requirement
      // unless we want to limit total products per session

      try {
        // Pick a random keyword from the category's keyword list
        const keyword = category.keywords[Math.floor(Math.random() * category.keywords.length)] || category.keywords[0] || 'popular';
        this.logger.info(`Searching category: ${category.name} with keyword: ${keyword}`);

        const searchParams: ProductSearchParams = {
          category: category.name,
          keywords: [keyword], // Use the single random keyword
          maxResults: category.maxResults,
          ...(category.sortBy ? { sortBy: category.sortBy } : {})
        };

        const result = await this.papiClient.searchProducts(searchParams);

        // Filter out excluded products
        const initialCount = result.products.length;
        result.products = result.products.filter(p => !exclusionList.has(p.asin));

        if (initialCount !== result.products.length) {
          this.logger.info(`Filtered ${initialCount - result.products.length} existing products from results`);
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
      keywords: customKeywords || category.keywords,
      maxResults: category.maxResults,
      ...(category.sortBy ? { sortBy: category.sortBy } : {})
    };

    this.logger.info(`Searching category ${categoryName} with keywords: ${searchParams.keywords.join(', ')}`);

    const result = await this.papiClient.searchProducts(searchParams);

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
        const result: ProductSearchResult = JSON.parse(data);
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
      const result: ProductSearchResult = JSON.parse(data);
      return result.products;

    } catch (error) {
      this.logger.warn(`Failed to load stored products for ${categoryName}:`, error);
      return [];
    }
  }

  /**
   * Get all stored products across categories
   */
  async getAllStoredProducts(): Promise<Record<string, Product[]>> {
    const categories = this.getEnabledCategories();
    const allProducts: Record<string, Product[]> = {};

    for (const category of categories) {
      allProducts[category.name] = await this.getStoredProducts(category.name);
    }

    return allProducts;
  }

  /**
   * Search for products with custom parameters
   */
  async customSearch(params: ProductSearchParams): Promise<ProductSearchResult> {
    this.logger.info(`Custom search: ${params.category} - ${params.keywords.join(', ')}`);

    const result = await this.papiClient.searchProducts(params);

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

      for (const sessionFile of sessions) {
        const sessionPath = path.join(sessionsDir, sessionFile);
        const data = await fs.readFile(sessionPath, 'utf-8');
        const session: SearchSession = JSON.parse(data);

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

    } catch (error) {
      this.logger.warn('Failed to get search statistics:', error);
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

      for (const sessionFile of sessionFiles) {
        const sessionPath = path.join(sessionsDir, sessionFile);
        const stats = await fs.stat(sessionPath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(sessionPath);
          this.logger.info(`Cleaned old session file: ${sessionFile}`);
        }
      }

      // Clean category data older than cutoff
      const categoriesDir = path.join(this.dataDir, 'categories');
      const categories = await fs.readdir(categoriesDir);

      for (const category of categories) {
        const categoryDir = path.join(categoriesDir, category);
        const categoryFiles = await fs.readdir(categoryDir);

        for (const file of categoryFiles) {
          const filePath = path.join(categoryDir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            this.logger.info(`Cleaned old category file: ${category}/${file}`);
          }
        }
      }

    } catch (error) {
      this.logger.error('Failed to clean old data:', error);
    }
  }

  /**
   * Private helper methods
   */
  private getEnabledCategories(): CategoryConfig[] {
    try {
      const config = this.config.getConfig();
      const categories = config.productSearch?.categories || [];
      // Convert string categories to CategoryConfig objects
      // Note: Config override is not fully implemented for randomize, for now we fall back to defaults effectively 
      // if categories are just strings. 
      // Ideally config would support detailed category config.

      const categoryConfigs: CategoryConfig[] = categories.map(cat => ({
        name: cat,
        searchIndex: this.getSearchIndexForCategory(cat),
        enabled: true,
        keywords: ['おすすめ', '人気', 'ランキング'], // Default Japanese keywords
        maxResults: 10,
        sortBy: 'rating'
      }));
      return categoryConfigs.length > 0 ? categoryConfigs : this.getDefaultCategories();
    } catch (error) {
      return this.getDefaultCategories();
    }
  }

  private getDefaultCategories(): CategoryConfig[] {
    // Categories and keywords tailored for amazon.co.jp
    return [
      {
        name: 'electronics',
        searchIndex: 'Electronics',
        keywords: ['スマートフォン', 'ワイヤレスイヤホン', 'モバイルバッテリー', 'スマートウォッチ', 'タブレット'],
        maxResults: 10,
        sortBy: 'rating',
        enabled: true
      },
      {
        name: 'computers',
        searchIndex: 'Computers',
        keywords: ['ノートパソコン', 'ゲーミングマウス', 'キーボード', 'モニター', '外付けSSD'],
        maxResults: 10,
        sortBy: 'rating',
        enabled: true
      },
      {
        name: 'kitchen',
        searchIndex: 'Kitchen',
        keywords: ['コーヒーメーカー', 'フライパン', '弁当箱', '水筒', '包丁'],
        maxResults: 10,
        sortBy: 'rating',
        enabled: true
      },
      {
        name: 'home',
        searchIndex: 'HomeAndKitchen',
        keywords: ['掃除機', '空気清浄機', '加湿器', '枕', '収納'],
        maxResults: 10,
        sortBy: 'rating',
        enabled: true
      },
      {
        name: 'appliances',
        searchIndex: 'Appliances', // 'LargeAppliances' in some regions, checking map
        keywords: ['冷蔵庫', '洗濯機', '電子レンジ', '炊飯器', 'ドライヤー'],
        maxResults: 10,
        sortBy: 'rating',
        enabled: true
      }
    ];
  }

  private getCategoryConfig(categoryName: string): CategoryConfig | undefined {
    try {
      const config = this.config.getConfig();
      const categories = config.productSearch?.categories || [];
      // This part is simplified, ideally we merge config with defaults
      // For now, if we have dynamic user config, we use generic keywords
      // If we use defaults, we get the rich keyword lists

      const categoryConfigs: CategoryConfig[] = categories.map(cat => ({
        name: cat,
        searchIndex: this.getSearchIndexForCategory(cat),
        enabled: true,
        keywords: ['おすすめ', '人気'],
        maxResults: 10,
        sortBy: 'rating'
      }));

      const allCategories = categoryConfigs.length > 0 ? categoryConfigs : this.getDefaultCategories();
      return allCategories.find(c => c.name === categoryName);
    } catch (error) {
      const defaultCategories = this.getDefaultCategories();
      return defaultCategories.find(c => c.name === categoryName);
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
      } catch (error) {
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
    const categoryMap: Record<string, string> = {
      'electronics': 'Electronics',
      'books': 'Books',
      'clothing': 'Fashion',
      'home': 'HomeAndKitchen',
      'kitchen': 'Kitchen',
      'sports': 'SportsAndOutdoors',
      'toys': 'Toys',
      'automotive': 'Automotive',
      'beauty': 'Beauty',
      'health': 'HealthPersonalCare',
      'computers': 'Computers',
      'music': 'Music',
      'videogames': 'VideoGames',
      'appliances': 'Appliances'
    };
    return categoryMap[categoryName.toLowerCase()] || 'All';
  }

  /**
   * Get a set of ASINs that have already been investigated/generated
   * Scans the content/articles directory for existing article bundles
   */
  private async getExclusionList(): Promise<Set<string>> {
    const exclusionList = new Set<string>();

    try {
      // Check if content directory exists
      try {
        await fs.access(this.contentDir);
      } catch {
        return exclusionList;
      }

      const files = await fs.readdir(this.contentDir);

      // Assuming article directories are named by ASIN or contain ASIN
      // Based on user workspace, articles might be in subfolders like /ASIN/index.md or just matched by name
      // Standard pattern in this project seems to be /ASIN/ or similar

      for (const file of files) {
        // Simple heuristic: if the folder name looks like an ASIN (10 alphanumeric chars), exclude it
        if (/^[A-Z0-9]{10}$/.test(file)) {
          exclusionList.add(file);
        }
      }

    } catch (error) {
      this.logger.warn('Failed to generate exclusion list:', error);
    }

    return exclusionList;
  }

  /**
   * Shuffle an array in place
   */
  private shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

}