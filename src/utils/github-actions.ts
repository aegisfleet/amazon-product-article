import fs from 'fs/promises';
import { Logger } from './Logger';

const logger = Logger.getInstance();

/**
 * Sets a GitHub Action output.
 *
 * If the GITHUB_OUTPUT environment variable is set, it appends the output to the file.
 * Otherwise, it logs a warning.
 *
 * @param name The name of the output.
 * @param value The value of the output.
 */
export async function setGitHubOutput(name: string, value: string): Promise<void> {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        const hasNewline = /[\r\n]/.test(value);
        if (hasNewline) {
            const delimiter = `EOF_${Date.now()}`;
            await fs.appendFile(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
        } else {
            await fs.appendFile(outputFile, `${name}=${value}\n`);
        }
        logger.info(`Set GitHub output: ${name}=${value}`);
    } else {
        logger.warn(`GITHUB_OUTPUT environment variable not set. Output skipped: ${name}=${value}`);
    }
}
