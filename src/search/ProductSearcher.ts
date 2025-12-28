/**
 * Product Searcher - Category-based product search and data management
 * Handles product search across multiple categories and structured data storage
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
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

  constructor(papiClient: PAAPIClient) {
    this.papiClient = papiClient;
    this.dataDir = path.join(process.cwd(), 'data', 'products');
  }

  /**
   * Initialize the product searcher
   */
  async initialize(): Promise<void> {
    await this.ensureDataDirectory();
    this.logger.info('ProductSearcher initialized');
  }

  /**
   * Search products across all enabled categories
   */
  async searchAllCategories(): Promise<SearchSession> {
    const categories = this.getEnabledCategories();
    const sessionId = this.generateSessionId();
    const results: ProductSearchResult[] = [];
    let totalProducts = 0;

    this.logger.info(`Starting product search session ${sessionId} for ${categories.length} categories`);

    for (const category of categories) {
      try {
        this.logger.info(`Searching category: ${category.name}`);

        const searchParams: ProductSearchParams = {
          category: category.name,
          keywords: category.keywords,
          maxResults: category.maxResults,
          ...(category.sortBy ? { sortBy: category.sortBy } : {})
        };

        const result = await this.papiClient.searchProducts(searchParams);

        // PA-API v5ではレビューデータ取得不可のためフィルタリングなし

        results.push(result);
        totalProducts += result.products.length;

        // Save category results
        await this.saveCategoryResults(sessionId, category.name, result);

        this.logger.info(`Found ${result.products.length} products in ${category.name}`);

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

    // PA-API v5ではレビューデータ取得不可のためフィルタリングなし

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

    // PA-API v5ではレビューデータ取得不可のためフィルタリングなし

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
      const categoryConfigs: CategoryConfig[] = categories.map(cat => ({
        name: cat,
        searchIndex: this.getSearchIndexForCategory(cat),
        enabled: true,
        keywords: ['best', 'top', 'review'],
        maxResults: 10,
        sortBy: 'rating'
      }));
      return categoryConfigs.length > 0 ? categoryConfigs : this.getDefaultCategories();
    } catch (error) {
      return this.getDefaultCategories();
    }
  }

  private getDefaultCategories(): CategoryConfig[] {
    return [
      {
        name: 'electronics',
        searchIndex: 'Electronics',
        keywords: ['smartphone', 'laptop', 'headphones'],
        maxResults: 10,
        sortBy: 'rating',
        enabled: true
      },
      {
        name: 'books',
        searchIndex: 'Books',
        keywords: ['programming', 'business', 'self-help'],
        maxResults: 10,
        sortBy: 'rating',
        enabled: true
      },
      {
        name: 'home',
        searchIndex: 'HomeGarden',
        keywords: ['kitchen', 'furniture', 'decor'],
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
      // Convert string categories to CategoryConfig objects and find the matching one
      const categoryConfigs: CategoryConfig[] = categories.map(cat => ({
        name: cat,
        searchIndex: this.getSearchIndexForCategory(cat),
        enabled: true,
        keywords: ['best', 'top', 'review'],
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
    // Use cryptographically secure random bytes for the session suffix
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
      'home': 'HomeGarden',
      'sports': 'SportingGoods'
    };
    return categoryMap[categoryName.toLowerCase()] || 'All';
  }

}