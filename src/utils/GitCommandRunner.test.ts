import { spawnSync } from 'node:child_process';

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Logger before importing GitCommandRunner because it calls getInstance() at top level
jest.mock('./Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => mockLogger),
  },
}));

// Now import the module under test
import { runGhCommand } from './GitCommandRunner';

jest.mock('child_process');

describe('runGhCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset spawnSync default behavior
    (spawnSync as jest.Mock).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    });
  });

  it('should call spawnSync with correct arguments and return stdout', () => {
    (spawnSync as jest.Mock).mockReturnValue({
      status: 0,
      stdout: 'success output',
      stderr: '',
    });

    const args = ['pr', 'merge', '123', '--squash'];
    const result = runGhCommand(args);

    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      args,
      expect.objectContaining({
        stdio: 'inherit',
        encoding: 'utf-8',
      }),
    );
    expect(result).toBe('success output');
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('should throw error if command fails with pipe', () => {
    (spawnSync as jest.Mock).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: Buffer.from('Error: Something went wrong'),
    });

    try {
      runGhCommand(['pr', 'ready', '123'], { stdio: 'pipe' });
      fail('Should have thrown an error');
    } catch (error) {
      const gitError = error as import('./GitCommandRunner').GitCommandError;
      expect(gitError.message).toContain('Command failed with exit code 1: Error: Something went wrong');
      expect(gitError.stderr).toBe('Error: Something went wrong');
      expect(gitError.status).toBe(1);
    }
  });

  it('should throw error if command fails without pipe (inherit)', () => {
    (spawnSync as jest.Mock).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: Buffer.from('Error output'),
    });

    try {
      runGhCommand(['pr', 'ready', '123'], { stdio: 'inherit' });
      fail('Should have thrown an error');
    } catch (error) {
      const gitError = error as import('./GitCommandRunner').GitCommandError;
      expect(gitError.message).toContain('Command failed with exit code 1: Error output');
      expect(gitError.stderr).toBe('Error output');
    }
  });

  it('should pass environment variables', () => {
    const env = { ...process.env, TEST_VAR: '1' };
    runGhCommand(['pr', 'merge', '123'], { env });

    const isWindows = process.platform === 'win32';
    const expectedPath = isWindows
      ? `${process.env.SystemRoot}\\system32;${process.env.SystemRoot}`
      : '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin';

    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      ['pr', 'merge', '123'],
      expect.objectContaining({
        env: {
          ...env,
          PATH: expectedPath,
        },
      }),
    );
  });

  it('should handle malicious input safely by passing it as an array argument', () => {
    const maliciousTitle = '"; rm -rf /; echo "';
    const args = ['pr', 'merge', '123', '--subject', maliciousTitle];

    runGhCommand(args);

    // This verifies that the malicious string is passed as a single argument
    // to spawnSync, preventing shell injection.
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['pr', 'merge', '123', '--subject', maliciousTitle]),
      expect.any(Object),
    );
  });
});
