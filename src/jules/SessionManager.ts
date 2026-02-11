import fs from 'fs/promises';
import path from 'path';
import { Product } from '../types/Product';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface SessionInfo {
    sessionId: string;
    sessionName: string;
}

/**
 * Saves the session information to a file.
 * Validates the ASIN to prevent path traversal vulnerabilities.
 */
export async function saveSessionInfo(
    product: Product,
    sessionInfo: SessionInfo
): Promise<void> {
    // Validate ASIN format to prevent path traversal
    if (!/^[A-Z0-9]{10}$/i.test(product.asin)) {
        throw new Error(`Invalid ASIN format: ${product.asin}`);
    }

    const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    const filename = `${product.asin}-${Date.now()}.json`;
    const filePath = path.join(sessionsDir, filename);

    await fs.writeFile(filePath, JSON.stringify({
        product,
        session: sessionInfo,
        status: 'started',
        timestamp: new Date().toISOString(),
    }, null, 2));

    logger.info(`Session info saved: ${filename}`);
}
