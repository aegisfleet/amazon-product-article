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

  test('should throw TypeError if RETRY_ATTEMPTS is NaN', async () => {
    process.env.RETRY_ATTEMPTS = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('RETRY_ATTEMPTS must be a valid number');
  });

  test('should throw TypeError if RETRY_ATTEMPTS contains trailing characters like 123abc', async () => {
    process.env.RETRY_ATTEMPTS = '123abc';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('RETRY_ATTEMPTS must be a valid number');
  });

  test('should throw TypeError if RETRY_DELAY is NaN', async () => {
    process.env.RETRY_DELAY = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('RETRY_DELAY must be a valid number');
  });

  test('should throw TypeError if RETRY_DELAY has invalid characters like 123abc', async () => {
    process.env.RETRY_DELAY = '123abc';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('RETRY_DELAY must be a valid number');
  });

  test('should throw TypeError if MAX_CONCURRENT_REQUESTS is NaN', async () => {
    process.env.MAX_CONCURRENT_REQUESTS = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('MAX_CONCURRENT_REQUESTS must be a valid number');
  });

  test('should throw TypeError if JULES_TIMEOUT is NaN', async () => {
    process.env.JULES_TIMEOUT = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('JULES_TIMEOUT must be a valid number');
  });

  test('should throw TypeError if MAX_RESULTS_PER_CATEGORY is NaN', async () => {
    process.env.MAX_RESULTS_PER_CATEGORY = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('MAX_RESULTS_PER_CATEGORY must be a valid number');
  });

  test('should throw TypeError if MIN_WORD_COUNT is NaN', async () => {
    process.env.MIN_WORD_COUNT = 'invalid';
    const configManager = ConfigManager.getInstance();
    await expect(configManager.initialize()).rejects.toThrow(TypeError);
    await expect(configManager.initialize()).rejects.toThrow('MIN_WORD_COUNT must be a valid number');
  });
});
