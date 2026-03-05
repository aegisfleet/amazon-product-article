import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import { Logger } from './Logger';

const logger = Logger.getInstance();

export interface RunCommandOptions {
  env?: NodeJS.ProcessEnv;
  stdio?: 'pipe' | 'inherit' | 'ignore';
}

/**
 * Error thrown when a git command fails
 */
export class GitCommandError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

/**
 * Runs a GitHub CLI (gh) command safely using spawnSync.
 * This prevents shell injection vulnerabilities by passing arguments as an array.
 *
 * @param args The arguments to pass to the gh command
 * @param options Options for execution (env, stdio)
 */
export function runGhCommand(args: string[], options: RunCommandOptions = {}): string {
  const { env = process.env, stdio = 'inherit' } = options;

  // Log the command for debugging purposes
  // Note: We avoid logging the full environment or token
  logger.debug(`Running command: gh ${args.join(' ')}`);

  // Prioritize safe standard binary locations but preserve the existing PATH
  const isWindows = process.platform === 'win32';
  const systemPath = isWindows
    ? `${process.env.SystemRoot}/system32;${process.env.SystemRoot}`
    : '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin';

  let safePath = systemPath;
  if (isWindows) {
    // Add common GitHub CLI installation paths
    // Keep system paths first for security, then common installation paths
    const commonPaths = ['C:/Program Files/GitHub CLI', 'C:/Program Files (x86)/GitHub CLI'];
    safePath = [systemPath, ...commonPaths].filter(Boolean).join(';');
  }

  const delimiter = isWindows ? ';' : ':';
  const originalPath = env.PATH || '';
  const finalPath = [safePath, originalPath].filter(Boolean).join(delimiter);

  const safeEnv = {
    ...env,
    PATH: finalPath,
  };

  const spawnOptions: SpawnSyncOptions = {
    stdio: stdio,
    encoding: 'utf-8',
    env: safeEnv,
  };

  const result = spawnSync('gh', args, spawnOptions);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    let errorMessage = `Command failed with exit code ${result.status}`;
    let stderr = '';

    // If we captured output (pipe), include stderr in the error message
    if (result.stderr) {
      stderr = result.stderr.toString().trim();
      if (stderr) {
        errorMessage += `: ${stderr}`;
      }
    }

    throw new GitCommandError(errorMessage, stderr, result.status);
  }

  return result.stdout ? result.stdout.toString() : '';
}
