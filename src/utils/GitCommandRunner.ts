import { spawnSync, SpawnSyncOptions } from 'child_process';
import { Logger } from './Logger';

const logger = Logger.getInstance();

export interface RunCommandOptions {
    env?: NodeJS.ProcessEnv;
    stdio?: 'pipe' | 'inherit' | 'ignore';
}

/**
 * Runs a GitHub CLI (gh) command safely using spawnSync.
 * This prevents shell injection vulnerabilities by passing arguments as an array.
 *
 * @param args The arguments to pass to the gh command
 * @param options Options for execution (env, stdio)
 */
export function runGhCommand(args: string[], options: RunCommandOptions = {}): void {
    const { env = process.env, stdio = 'inherit' } = options;

    // Log the command for debugging purposes
    // Note: We avoid logging the full environment or token
    logger.debug(`Running command: gh ${args.join(' ')}`);

    const spawnOptions: SpawnSyncOptions = {
        stdio: stdio,
        encoding: 'utf-8',
        env: env
    };

    const result = spawnSync('gh', args, spawnOptions);

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        let errorMessage = `Command failed with exit code ${result.status}`;

        // If we captured output (pipe), include stderr in the error message
        if (stdio === 'pipe' && result.stderr) {
            const stderr = result.stderr.toString().trim();
            if (stderr) {
                errorMessage += `: ${stderr}`;
            }
        }

        throw new Error(errorMessage);
    }
}
