/**
 * Amazon Product Research System
 * Entry point for the application
 */

import { ConfigManager } from './config/ConfigManager';
import { Logger } from './utils/Logger';

async function main(): Promise<void> {
  const logger = Logger.getInstance();
  
  try {
    logger.info('Starting Amazon Product Research System');
    
    // Initialize configuration
    const config = ConfigManager.getInstance();
    await config.initialize();
    
    logger.info('System initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize system', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };