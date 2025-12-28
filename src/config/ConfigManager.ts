/**
 * Configuration Management System
 * Handles all system configuration including secrets and environment variables
 */

import * as dotenv from 'dotenv';
import { Logger } from '../utils/Logger';

export interface SystemConfig {
  // Amazon PA-API Configuration (Japan marketplace)
  amazon: {
    accessKey: string;
    secretKey: string;
    partnerTag: string;
  };

  // Jules API Configuration
  jules: {
    apiKey: string;
    baseUrl: string;
    timeout: number;
  };

  // GitHub Configuration
  github: {
    token: string;
    repository: string;
    branch: string;
  };

  // System Configuration
  system: {
    logLevel: string;
    retryAttempts: number;
    retryDelay: number;
    maxConcurrentRequests: number;
  };

  // Product Search Configuration
  productSearch: {
    categories: string[];
    maxResultsPerCategory: number;
    searchKeywords: string[];
  };

  // Article Generation Configuration
  articleGeneration: {
    templatePath: string;
    outputPath: string;
    minWordCount: number;
    includeImages: boolean;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: SystemConfig | null = null;
  private logger = Logger.getInstance();

  private constructor() {
    // Load environment variables
    dotenv.config();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing configuration manager');

    try {
      this.config = await this.loadConfiguration();
      this.validateConfiguration(this.config);
      this.logger.info('Configuration loaded and validated successfully');
    } catch (error) {
      this.logger.error('Failed to initialize configuration', error);
      throw error;
    }
  }

  public getConfig(): SystemConfig {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.config;
  }

  private async loadConfiguration(): Promise<SystemConfig> {
    return {
      amazon: {
        accessKey: this.getRequiredEnvVar('AMAZON_ACCESS_KEY'),
        secretKey: this.getRequiredEnvVar('AMAZON_SECRET_KEY'),
        partnerTag: this.getRequiredEnvVar('AMAZON_PARTNER_TAG')
      },
      jules: {
        apiKey: this.getRequiredEnvVar('JULES_API_KEY'),
        baseUrl: this.getEnvVar('JULES_BASE_URL', 'https://api.jules.google.com'),
        timeout: parseInt(this.getEnvVar('JULES_TIMEOUT', '30000'), 10),
      },
      github: {
        token: this.getRequiredEnvVar('GITHUB_TOKEN'),
        repository: this.getRequiredEnvVar('GITHUB_REPOSITORY'),
        branch: this.getEnvVar('GITHUB_BRANCH', 'main'),
      },
      system: {
        logLevel: this.getEnvVar('LOG_LEVEL', 'info'),
        retryAttempts: parseInt(this.getEnvVar('RETRY_ATTEMPTS', '3'), 10),
        retryDelay: parseInt(this.getEnvVar('RETRY_DELAY', '1000'), 10),
        maxConcurrentRequests: parseInt(this.getEnvVar('MAX_CONCURRENT_REQUESTS', '5'), 10),
      },
      productSearch: {
        categories: this.getEnvVar('PRODUCT_CATEGORIES', 'Electronics,Home,Sports').split(','),
        maxResultsPerCategory: parseInt(this.getEnvVar('MAX_RESULTS_PER_CATEGORY', '10'), 10),
        searchKeywords: this.getEnvVar('SEARCH_KEYWORDS', 'best,top,review').split(','),
      },
      articleGeneration: {
        templatePath: this.getEnvVar('ARTICLE_TEMPLATE_PATH', './templates'),
        outputPath: this.getEnvVar('ARTICLE_OUTPUT_PATH', './articles'),
        minWordCount: parseInt(this.getEnvVar('MIN_WORD_COUNT', '2000'), 10),
        includeImages: this.getEnvVar('INCLUDE_IMAGES', 'true') === 'true',
      },
    };
  }

  private validateConfiguration(config: SystemConfig): void {
    const errors: string[] = [];

    // Validate Amazon configuration
    if (!config.amazon.accessKey || !config.amazon.secretKey || !config.amazon.partnerTag) {
      errors.push('Amazon PA-API credentials are incomplete');
    }

    // Validate Jules configuration
    if (!config.jules.apiKey) {
      errors.push('Jules API key is missing');
    }

    // Validate GitHub configuration
    if (!config.github.token || !config.github.repository) {
      errors.push('GitHub configuration is incomplete');
    }

    // Validate numeric values
    if (config.system.retryAttempts < 0 || config.system.retryAttempts > 10) {
      errors.push('Retry attempts must be between 0 and 10');
    }

    if (config.system.retryDelay < 100 || config.system.retryDelay > 60000) {
      errors.push('Retry delay must be between 100ms and 60s');
    }

    if (config.productSearch.maxResultsPerCategory < 1 || config.productSearch.maxResultsPerCategory > 50) {
      errors.push('Max results per category must be between 1 and 50');
    }

    if (config.articleGeneration.minWordCount < 500 || config.articleGeneration.minWordCount > 10000) {
      errors.push('Min word count must be between 500 and 10000');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  private getRequiredEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  private getEnvVar(name: string, defaultValue: string): string {
    return process.env[name] || defaultValue;
  }

  public updateConfig(updates: Partial<SystemConfig>): void {
    if (!this.config) {
      throw new Error('Configuration not initialized');
    }

    this.config = { ...this.config, ...updates };
    this.validateConfiguration(this.config);
    this.logger.info('Configuration updated successfully');
  }
}