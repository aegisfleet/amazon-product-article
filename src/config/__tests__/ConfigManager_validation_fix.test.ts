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

  test('should throw if numeric values are NaN', async () => {
    process.env.RETRY_ATTEMPTS = 'invalid'; // Parses to NaN
    const configManager = ConfigManager.getInstance();

    // This is expected to fail before the fix is implemented because NaN checks are missing
    await expect(configManager.initialize()).rejects.toThrow('Configuration validation failed');
  });
});
