import { ConfigManager } from '../ConfigManager';

describe('ConfigManager Validation Improvements', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    ConfigManager.resetInstance();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Set base valid config
    process.env.AMAZON_CREATORS_APPLICATION_ID = 'valid';
    process.env.AMAZON_CREATORS_CREDENTIAL_ID = 'valid';
    process.env.AMAZON_CREATORS_CREDENTIAL_SECRET = 'valid';
    process.env.AMAZON_PARTNER_TAG = 'valid';
    process.env.JULES_API_KEY = 'valid';
    process.env.GITHUB_TOKEN = 'valid';
    process.env.GITHUB_REPOSITORY = 'user/repo';
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
    ConfigManager.resetInstance();
  });

  test('should throw if Amazon credentials are missing (confirming implicit validation works)', async () => {
    delete process.env.AMAZON_CREATORS_APPLICATION_ID;
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(
      'Required environment variable AMAZON_CREATORS_APPLICATION_ID is not set',
    );
  });

  test('should throw if RETRY_ATTEMPTS is NaN', async () => {
    process.env.RETRY_ATTEMPTS = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow('Retry attempts must be a number between 0 and 10');
  });

  test('should throw if RETRY_DELAY is NaN', async () => {
    process.env.RETRY_DELAY = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow('Retry delay must be a number between 100ms and 60s');
  });

  test('should throw if MAX_CONCURRENT_REQUESTS is NaN', async () => {
    process.env.MAX_CONCURRENT_REQUESTS = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow('Max concurrent requests must be a number between 1 and 20');
  });

  test('should throw if JULES_TIMEOUT is NaN', async () => {
    process.env.JULES_TIMEOUT = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow('Jules timeout must be a number between 1s and 60s');
  });

  test('should throw if MAX_RESULTS_PER_CATEGORY is NaN', async () => {
    process.env.MAX_RESULTS_PER_CATEGORY = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow('Max results per category must be a number between 1 and 50');
  });

  test('should throw if MIN_WORD_COUNT is NaN', async () => {
    process.env.MIN_WORD_COUNT = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow('Min word count must be a number between 500 and 10000');
  });
});
