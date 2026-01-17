/**
 * Property-based tests for Configuration Management and Validation
 * **Feature: amazon-product-research-system, Property 12: Configuration Management and Validation**
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import * as fc from 'fast-check';
import { ConfigManager, SystemConfig } from '../ConfigManager';

// Helper: Generate non-empty alphanumeric string
const nonEmptyAlphanumericString = (minLength: number, maxLength: number) =>
  fc.stringMatching(new RegExp(`^[a-zA-Z0-9]{${minLength},${maxLength}}$`));

// Helper: Generate string that contains '/' for repository format
const repositoryString = () =>
  fc.tuple(
    fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
    fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/)
  ).map(([user, repo]) => `${user}/${repo}`);

describe('ConfigManager Property-Based Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: jest.SpyInstance;

  const clearAllConfigEnvVars = () => {
    // Clear all config-related environment variables
    const configEnvVars = [
      'AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'AMAZON_PARTNER_TAG', 'AMAZON_REGION',
      'JULES_API_KEY', 'JULES_BASE_URL', 'JULES_TIMEOUT',
      'GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_BRANCH',
      'LOG_LEVEL', 'RETRY_ATTEMPTS', 'RETRY_DELAY', 'MAX_CONCURRENT_REQUESTS',
      'PRODUCT_CATEGORIES', 'MAX_RESULTS_PER_CATEGORY',
      'MIN_WORD_COUNT', 'INCLUDE_IMAGES', 'ARTICLE_OUTPUT_PATH'
    ];
    for (const envVar of configEnvVars) {
      delete process.env[envVar];
    }
  };

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear ConfigManager singleton using proper method
    ConfigManager.resetInstance();

    // Clear all config-related env vars
    clearAllConfigEnvVars();

    // Suppress expected error logs during testing
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();

    // Restore original environment
    process.env = originalEnv;

    // Reset singleton after each test
    ConfigManager.resetInstance();
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
          amazonAccessKey: nonEmptyAlphanumericString(10, 50),
          amazonSecretKey: nonEmptyAlphanumericString(20, 100),
          amazonPartnerTag: nonEmptyAlphanumericString(5, 20),
          amazonRegion: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
          julesApiKey: nonEmptyAlphanumericString(20, 100),
          julesBaseUrl: fc.webUrl(),
          julesTimeout: fc.integer({ min: 1000, max: 60000 }),
          githubToken: nonEmptyAlphanumericString(20, 100),
          githubRepository: repositoryString(),
          githubBranch: fc.constantFrom('main', 'master', 'develop'),
          logLevel: fc.constantFrom('error', 'warn', 'info', 'debug'),
          retryAttempts: fc.integer({ min: 0, max: 10 }),
          retryDelay: fc.integer({ min: 100, max: 60000 }),
          maxConcurrentRequests: fc.integer({ min: 1, max: 20 }),
          productCategories: fc.array(nonEmptyAlphanumericString(3, 20), { minLength: 1, maxLength: 10 }),
          maxResultsPerCategory: fc.integer({ min: 1, max: 50 }),
          minWordCount: fc.integer({ min: 500, max: 10000 }),
          includeImages: fc.boolean(),
        }),
        async (validConfig) => {
          // Reset singleton for each property test iteration
          ConfigManager.resetInstance();
          clearAllConfigEnvVars();

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
      { numRuns: 20 }
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
            amazonSecretKey: nonEmptyAlphanumericString(20, 100),
            amazonPartnerTag: nonEmptyAlphanumericString(5, 20),
            julesApiKey: nonEmptyAlphanumericString(20, 100),
            githubToken: nonEmptyAlphanumericString(20, 100),
            githubRepository: repositoryString(),
          }),
          // Invalid numeric ranges
          fc.record({
            scenario: fc.constant('invalid_retry_attempts'),
            amazonAccessKey: nonEmptyAlphanumericString(10, 50),
            amazonSecretKey: nonEmptyAlphanumericString(20, 100),
            amazonPartnerTag: nonEmptyAlphanumericString(5, 20),
            julesApiKey: nonEmptyAlphanumericString(20, 100),
            githubToken: nonEmptyAlphanumericString(20, 100),
            githubRepository: repositoryString(),
            retryAttempts: fc.integer({ min: 11, max: 100 }), // Invalid: > 10
          }),
          // Invalid word count
          fc.record({
            scenario: fc.constant('invalid_word_count'),
            amazonAccessKey: nonEmptyAlphanumericString(10, 50),
            amazonSecretKey: nonEmptyAlphanumericString(20, 100),
            amazonPartnerTag: nonEmptyAlphanumericString(5, 20),
            julesApiKey: nonEmptyAlphanumericString(20, 100),
            githubToken: nonEmptyAlphanumericString(20, 100),
            githubRepository: repositoryString(),
            minWordCount: fc.integer({ min: 10001, max: 50000 }), // Invalid: > 10000
          })
        ),
        async (invalidConfig) => {
          // Reset singleton for each property test iteration
          ConfigManager.resetInstance();
          clearAllConfigEnvVars();

          // Set up environment with invalid configuration
          // For missing_amazon_key scenario, don't set AMAZON_ACCESS_KEY at all
          if (invalidConfig.scenario !== 'missing_amazon_key') {
            process.env.AMAZON_ACCESS_KEY = (invalidConfig as any).amazonAccessKey;
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

          // Reset singleton again to test error message
          ConfigManager.resetInstance();
          clearAllConfigEnvVars();

          // Re-set the same invalid config
          if (invalidConfig.scenario !== 'missing_amazon_key') {
            process.env.AMAZON_ACCESS_KEY = (invalidConfig as any).amazonAccessKey;
          }
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

          const freshConfigManager = ConfigManager.getInstance();

          try {
            await freshConfigManager.initialize();
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
      { numRuns: 20 }
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
          // Reset singleton for each property test iteration
          ConfigManager.resetInstance();
          clearAllConfigEnvVars();

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
      { numRuns: 20 }
    );
  });
});