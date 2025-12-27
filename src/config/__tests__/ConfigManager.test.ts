/**
 * Property-based tests for Configuration Management and Validation
 * **Feature: amazon-product-research-system, Property 12: Configuration Management and Validation**
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import * as fc from 'fast-check';
import { ConfigManager, SystemConfig } from '../ConfigManager';

describe('ConfigManager Property-Based Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear ConfigManager singleton for each test
    (ConfigManager as any).instance = undefined;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  /**
   * Property 12: Configuration Management and Validation
   * For any system configuration change (categories, templates, schedules), 
   * the system should validate the new settings and provide clear error messages 
   * for invalid configurations while applying valid changes correctly.
   */
  test('Property 12: Configuration validation should accept valid configs and reject invalid ones', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid configuration data
        fc.record({
          amazonAccessKey: fc.string({ minLength: 10, maxLength: 50 }),
          amazonSecretKey: fc.string({ minLength: 20, maxLength: 100 }),
          amazonPartnerTag: fc.string({ minLength: 5, maxLength: 20 }),
          amazonRegion: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
          julesApiKey: fc.string({ minLength: 20, maxLength: 100 }),
          julesBaseUrl: fc.webUrl(),
          julesTimeout: fc.integer({ min: 1000, max: 60000 }),
          githubToken: fc.string({ minLength: 20, maxLength: 100 }),
          githubRepository: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.includes('/')),
          githubBranch: fc.constantFrom('main', 'master', 'develop'),
          logLevel: fc.constantFrom('error', 'warn', 'info', 'debug'),
          retryAttempts: fc.integer({ min: 0, max: 10 }),
          retryDelay: fc.integer({ min: 100, max: 60000 }),
          maxConcurrentRequests: fc.integer({ min: 1, max: 20 }),
          productCategories: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          maxResultsPerCategory: fc.integer({ min: 1, max: 50 }),
          searchKeywords: fc.array(fc.string({ minLength: 2, maxLength: 15 }), { minLength: 1, maxLength: 10 }),
          minWordCount: fc.integer({ min: 500, max: 10000 }),
          includeImages: fc.boolean(),
        }),
        async (validConfig) => {
          // Set up valid environment variables
          process.env.AMAZON_ACCESS_KEY = validConfig.amazonAccessKey;
          process.env.AMAZON_SECRET_KEY = validConfig.amazonSecretKey;
          process.env.AMAZON_PARTNER_TAG = validConfig.amazonPartnerTag;
          process.env.AMAZON_REGION = validConfig.amazonRegion;
          process.env.JULES_API_KEY = validConfig.julesApiKey;
          process.env.JULES_BASE_URL = validConfig.julesBaseUrl;
          process.env.JULES_TIMEOUT = validConfig.julesTimeout.toString();
          process.env.GITHUB_TOKEN = validConfig.githubToken;
          process.env.GITHUB_REPOSITORY = validConfig.githubRepository;
          process.env.GITHUB_BRANCH = validConfig.githubBranch;
          process.env.LOG_LEVEL = validConfig.logLevel;
          process.env.RETRY_ATTEMPTS = validConfig.retryAttempts.toString();
          process.env.RETRY_DELAY = validConfig.retryDelay.toString();
          process.env.MAX_CONCURRENT_REQUESTS = validConfig.maxConcurrentRequests.toString();
          process.env.PRODUCT_CATEGORIES = validConfig.productCategories.join(',');
          process.env.MAX_RESULTS_PER_CATEGORY = validConfig.maxResultsPerCategory.toString();
          process.env.SEARCH_KEYWORDS = validConfig.searchKeywords.join(',');
          process.env.MIN_WORD_COUNT = validConfig.minWordCount.toString();
          process.env.INCLUDE_IMAGES = validConfig.includeImages.toString();

          const configManager = ConfigManager.getInstance();
          
          // Valid configuration should initialize without throwing
          await expect(configManager.initialize()).resolves.not.toThrow();
          
          // Should be able to get the configuration
          const config = configManager.getConfig();
          expect(config).toBeDefined();
          expect(config.amazon.accessKey).toBe(validConfig.amazonAccessKey);
          expect(config.jules.apiKey).toBe(validConfig.julesApiKey);
          expect(config.github.token).toBe(validConfig.githubToken);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 12: Invalid configurations should be rejected with clear error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate invalid configuration scenarios
        fc.oneof(
          // Missing required fields - environment variable not set at all
          fc.record({
            scenario: fc.constant('missing_amazon_key'),
            // Don't generate amazonAccessKey - it will be missing entirely
            amazonSecretKey: fc.string({ minLength: 20, maxLength: 100 }),
            amazonPartnerTag: fc.string({ minLength: 5, maxLength: 20 }),
            julesApiKey: fc.string({ minLength: 20, maxLength: 100 }),
            githubToken: fc.string({ minLength: 20, maxLength: 100 }),
            githubRepository: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.includes('/')),
          }),
          // Invalid numeric ranges
          fc.record({
            scenario: fc.constant('invalid_retry_attempts'),
            amazonAccessKey: fc.string({ minLength: 10, maxLength: 50 }),
            amazonSecretKey: fc.string({ minLength: 20, maxLength: 100 }),
            amazonPartnerTag: fc.string({ minLength: 5, maxLength: 20 }),
            julesApiKey: fc.string({ minLength: 20, maxLength: 100 }),
            githubToken: fc.string({ minLength: 20, maxLength: 100 }),
            githubRepository: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.includes('/')),
            retryAttempts: fc.integer({ min: 11, max: 100 }), // Invalid: > 10
          }),
          // Invalid word count
          fc.record({
            scenario: fc.constant('invalid_word_count'),
            amazonAccessKey: fc.string({ minLength: 10, maxLength: 50 }),
            amazonSecretKey: fc.string({ minLength: 20, maxLength: 100 }),
            amazonPartnerTag: fc.string({ minLength: 5, maxLength: 20 }),
            julesApiKey: fc.string({ minLength: 20, maxLength: 100 }),
            githubToken: fc.string({ minLength: 20, maxLength: 100 }),
            githubRepository: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.includes('/')),
            minWordCount: fc.integer({ min: 10001, max: 50000 }), // Invalid: > 10000
          })
        ),
        async (invalidConfig) => {
          // Set up environment with invalid configuration
          // For missing_amazon_key scenario, don't set AMAZON_ACCESS_KEY at all
          if (invalidConfig.scenario !== 'missing_amazon_key') {
            process.env.AMAZON_ACCESS_KEY = (invalidConfig as any).amazonAccessKey;
          } else {
            // Ensure AMAZON_ACCESS_KEY is not set
            delete process.env.AMAZON_ACCESS_KEY;
          }
          
          // Set other required environment variables
          process.env.AMAZON_SECRET_KEY = invalidConfig.amazonSecretKey;
          process.env.AMAZON_PARTNER_TAG = invalidConfig.amazonPartnerTag;
          process.env.JULES_API_KEY = invalidConfig.julesApiKey;
          process.env.GITHUB_TOKEN = invalidConfig.githubToken;
          process.env.GITHUB_REPOSITORY = invalidConfig.githubRepository;
          
          if ('retryAttempts' in invalidConfig) {
            process.env.RETRY_ATTEMPTS = invalidConfig.retryAttempts.toString();
          }
          
          if ('minWordCount' in invalidConfig) {
            process.env.MIN_WORD_COUNT = invalidConfig.minWordCount.toString();
          }

          const configManager = ConfigManager.getInstance();
          
          // Invalid configuration should throw with clear error message
          await expect(configManager.initialize()).rejects.toThrow();
          
          try {
            await configManager.initialize();
          } catch (error) {
            // Error message should be descriptive
            expect(error).toBeInstanceOf(Error);
            const errorMessage = (error as Error).message;
            expect(errorMessage).toBeTruthy();
            expect(errorMessage.length).toBeGreaterThan(10);
            
            // Should contain relevant context about what failed
            if (invalidConfig.scenario === 'missing_amazon_key') {
              expect(errorMessage.toLowerCase()).toContain('amazon_access_key');
            } else if (invalidConfig.scenario === 'invalid_retry_attempts') {
              expect(errorMessage.toLowerCase()).toContain('retry');
            } else if (invalidConfig.scenario === 'invalid_word_count') {
              expect(errorMessage.toLowerCase()).toContain('word count');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 12: Configuration updates should validate and apply correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Initial valid config
          initialRetryAttempts: fc.integer({ min: 1, max: 5 }),
          initialRetryDelay: fc.integer({ min: 1000, max: 5000 }),
          // Update with valid values
          newRetryAttempts: fc.integer({ min: 1, max: 10 }),
          newRetryDelay: fc.integer({ min: 100, max: 60000 }),
        }),
        async (testData) => {
          // Set up initial valid environment
          process.env.AMAZON_ACCESS_KEY = 'test_access_key_12345';
          process.env.AMAZON_SECRET_KEY = 'test_secret_key_1234567890';
          process.env.AMAZON_PARTNER_TAG = 'test_tag';
          process.env.JULES_API_KEY = 'test_jules_key_1234567890';
          process.env.GITHUB_TOKEN = 'test_github_token_1234567890';
          process.env.GITHUB_REPOSITORY = 'user/repo';
          process.env.RETRY_ATTEMPTS = testData.initialRetryAttempts.toString();
          process.env.RETRY_DELAY = testData.initialRetryDelay.toString();

          const configManager = ConfigManager.getInstance();
          await configManager.initialize();
          
          const initialConfig = configManager.getConfig();
          expect(initialConfig.system.retryAttempts).toBe(testData.initialRetryAttempts);
          expect(initialConfig.system.retryDelay).toBe(testData.initialRetryDelay);

          // Update configuration
          const updates: Partial<SystemConfig> = {
            system: {
              ...initialConfig.system,
              retryAttempts: testData.newRetryAttempts,
              retryDelay: testData.newRetryDelay,
            }
          };

          // Valid updates should succeed
          expect(() => configManager.updateConfig(updates)).not.toThrow();
          
          const updatedConfig = configManager.getConfig();
          expect(updatedConfig.system.retryAttempts).toBe(testData.newRetryAttempts);
          expect(updatedConfig.system.retryDelay).toBe(testData.newRetryDelay);
        }
      ),
      { numRuns: 100 }
    );
  });
});