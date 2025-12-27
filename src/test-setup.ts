/**
 * Jest test setup file
 * Configures global test environment and utilities
 */

import { Logger, LogLevel } from './utils/Logger';

// Set log level to ERROR during tests to reduce noise
beforeAll(() => {
  const logger = Logger.getInstance();
  logger.setLogLevel(LogLevel.ERROR);
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidConfig(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidConfig(received: unknown) {
    const pass = received !== null && 
                 typeof received === 'object' && 
                 received !== undefined;
    
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid config`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid config`,
        pass: false,
      };
    }
  },
});