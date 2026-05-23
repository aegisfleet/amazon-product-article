/**
 * Configuration Management System
 * Handles all system configuration including secrets and environment variables
 */

import * as dotenv from 'dotenv';
import { Logger } from '../utils/Logger';

export interface SystemConfig {
  // Amazon Creators API Configuration (Japan marketplace)
  amazon: {
    applicationId: string;
    credentialId: string;
    credentialSecret: string;
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
  };

  // Article Generation Configuration
  articleGeneration: {
    outputPath: string;
    minWordCount: number;
    includeImages: boolean;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: SystemConfig | null = null;
  private logger = Logger.getInstance();
  private static skipDotenv = false;

  private constructor() {
    // Skip loading .env file in test environment to avoid overwriting test-defined env vars
    if (!ConfigManager.skipDotenv && process.env.NODE_ENV !== 'test') {
      dotenv.config();
    }
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes only)
   */
  public static resetInstance(): void {
    ConfigManager.instance = undefined as unknown as ConfigManager;
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing configuration manager');
    await Promise.resolve();

    try {
      this.config = this.loadConfiguration();
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

  private parseNumericEnvVar(name: string, defaultValue: number | string): number {
    const raw = this.getEnvVar(name, String(defaultValue)).trim();

    const numRegex = /^-?\d+(\.\d+)?$/;
    if (!numRegex.test(raw) || String(Number(raw)) !== raw) {
      throw new TypeError(`${name} must be a valid number`);
    }

    const value = Number(raw);
    if (Number.isNaN(value)) {
      throw new TypeError(`${name} must be a valid number`);
    }
    return value;
  }

  private loadConfiguration(): SystemConfig {
    return {
      amazon: {
        applicationId: this.getRequiredEnvVar('AMAZON_CREATORS_APPLICATION_ID'),
        credentialId: this.getRequiredEnvVar('AMAZON_CREATORS_CREDENTIAL_ID'),
        credentialSecret: this.getRequiredEnvVar('AMAZON_CREATORS_CREDENTIAL_SECRET'),
        partnerTag: this.getRequiredEnvVar('AMAZON_PARTNER_TAG'),
      },
      jules: {
        apiKey: this.getRequiredEnvVar('JULES_API_KEY'),
        baseUrl: this.getEnvVar('JULES_BASE_URL', 'https://api.jules.google.com'),
        timeout: this.parseNumericEnvVar('JULES_TIMEOUT', 30000),
      },
      github: {
        token: this.getRequiredEnvVar('GITHUB_TOKEN'),
        repository: this.getRequiredEnvVar('GITHUB_REPOSITORY'),
        branch: this.getEnvVar('GITHUB_BRANCH', 'main'),
      },
      system: {
        logLevel: this.getEnvVar('LOG_LEVEL', 'info'),
        retryAttempts: this.parseNumericEnvVar('RETRY_ATTEMPTS', 3),
        retryDelay: this.parseNumericEnvVar('RETRY_DELAY', 1000),
        maxConcurrentRequests: this.parseNumericEnvVar('MAX_CONCURRENT_REQUESTS', 5),
      },
      productSearch: {
        categories: this.parseListEnvVar('PRODUCT_CATEGORIES', ''),
        maxResultsPerCategory: this.parseNumericEnvVar('MAX_RESULTS_PER_CATEGORY', 10),
      },
      articleGeneration: {
        outputPath: this.getEnvVar('ARTICLE_OUTPUT_PATH', './articles'),
        minWordCount: this.parseNumericEnvVar('MIN_WORD_COUNT', 2000),
        includeImages: this.getEnvVar('INCLUDE_IMAGES', 'true') === 'true',
      },
    };
  }

  private validateConfiguration(config: SystemConfig): void {
    const errors: string[] = [];

    // Validate numeric values
    if (config.system.retryAttempts < 0 || config.system.retryAttempts > 10) {
      errors.push('Retry attempts must be a number between 0 and 10');
    }

    if (config.system.retryDelay < 100 || config.system.retryDelay > 60000) {
      errors.push('Retry delay must be a number between 100ms and 60s');
    }

    if (config.system.maxConcurrentRequests < 1 || config.system.maxConcurrentRequests > 20) {
      errors.push('Max concurrent requests must be a number between 1 and 20');
    }

    if (config.jules.timeout < 1000 || config.jules.timeout > 60000) {
      errors.push('Jules timeout must be a number between 1s and 60s');
    }

    if (config.productSearch.maxResultsPerCategory < 1 || config.productSearch.maxResultsPerCategory > 50) {
      errors.push('Max results per category must be a number between 1 and 50');
    }

    if (config.articleGeneration.minWordCount < 500 || config.articleGeneration.minWordCount > 10000) {
      errors.push('Min word count must be a number between 500 and 10000');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  private getRequiredEnvVar(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  private getEnvVar(name: string, defaultValue: string): string {
    return process.env[name] || defaultValue;
  }

  private parseListEnvVar(name: string, defaultValue: string): string[] {
    const value = process.env[name] || defaultValue;
    if (!value) {
      return [];
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
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
