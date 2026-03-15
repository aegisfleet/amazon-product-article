import { Logger, LogLevel } from './Logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Clear the singleton instance before each test to ensure clean state
    Logger.resetInstance();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Initialization', () => {
    it('should initialize with INFO level by default', () => {
      const logger = Logger.getInstance();
      logger.debug('test debug');
      logger.info('test info');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // Only info should be logged
      expect((consoleLogSpy.mock.calls[0] as string[])[0]).toContain('[INFO]');
    });

    it('should initialize with level from process.env.LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const logger = Logger.getInstance();

      logger.debug('test debug');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect((consoleLogSpy.mock.calls[0] as string[])[0]).toContain('[DEBUG]');
    });

    it('should fallback to INFO if process.env.LOG_LEVEL is invalid', () => {
      process.env.LOG_LEVEL = 'INVALID';
      const logger = Logger.getInstance();

      logger.debug('test debug');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('setLogLevel', () => {
    it('should change the log level', () => {
      const logger = Logger.getInstance();
      logger.setLogLevel(LogLevel.WARN);

      logger.info('test info');
      logger.warn('test warn');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect((consoleWarnSpy.mock.calls[0] as string[])[0]).toContain('[WARN]');
    });
  });

  describe('Logging methods', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance();
      logger.setLogLevel(LogLevel.DEBUG); // Set to max to allow all logs
    });

    it('should log debug messages using console.log', () => {
      logger.debug('debug msg');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect((consoleLogSpy.mock.calls[0] as string[])[0]).toContain('[DEBUG] debug msg');
    });

    it('should log info messages using console.log', () => {
      logger.info('info msg');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect((consoleLogSpy.mock.calls[0] as string[])[0]).toContain('[INFO] info msg');
    });

    it('should log warn messages using console.warn', () => {
      logger.warn('warn msg');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect((consoleWarnSpy.mock.calls[0] as string[])[0]).toContain('[WARN] warn msg');
    });

    it('should log error messages using console.error', () => {
      logger.error('error msg');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect((consoleErrorSpy.mock.calls[0] as string[])[0]).toContain('[ERROR] error msg');
    });
  });

  describe('Log formatting', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = Logger.getInstance();
      logger.setLogLevel(LogLevel.DEBUG);
    });

    it('should include timestamp in logs', () => {
      jest.useFakeTimers();
      const mockDate = new Date('2023-01-01T00:00:00.000Z');
      jest.setSystemTime(mockDate);

      logger.info('test');

      expect((consoleLogSpy.mock.calls[0] as string[])[0]).toContain('[2023-01-01T00:00:00.000Z]');
      
      jest.useRealTimers();
    });

    it('should format data correctly', () => {
      const testData = { key: 'value', num: 123 };
      logger.info('msg', testData);

      expect((consoleLogSpy.mock.calls[0] as string[])[0]).toContain(`Data: ${JSON.stringify(testData)}`);
    });

    it('should format Error correctly', () => {
      const testError = new Error('Test Error Message');
      testError.stack = 'Test Error Stack';

      logger.error('msg', testError);
                                                                     
      const logString = (consoleErrorSpy.mock.calls[0] as string[])[0];
      expect(logString).toContain('Error: Test Error Message');
      expect(logString).toContain('Stack: Test Error Stack');
    });

    it('should format unknown error correctly', () => {
      const unknownError = { message: 'Some other error' };
      logger.error('msg', unknownError);
                                                                     
      const logString = (consoleErrorSpy.mock.calls[0] as string[])[0];
      expect(logString).toContain(`Data: ${JSON.stringify(unknownError)}`);
      expect(logString).not.toContain('Stack:');
    });
  });
});
