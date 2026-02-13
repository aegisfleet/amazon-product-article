import { spawnSync } from 'child_process';

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

    it('should call spawnSync with correct arguments', () => {
        const args = ['pr', 'merge', '123', '--squash'];
        runGhCommand(args);

        expect(spawnSync).toHaveBeenCalledWith(
            'gh',
            args,
            expect.objectContaining({
                stdio: 'inherit',
                encoding: 'utf-8',
            })
        );
        expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should throw error if command fails with pipe', () => {
        (spawnSync as jest.Mock).mockReturnValue({
            status: 1,
            stdout: '',
            stderr: Buffer.from('Error: Something went wrong'),
        });

        expect(() => runGhCommand(['pr', 'ready', '123'], { stdio: 'pipe' }))
            .toThrow('Command failed with exit code 1: Error: Something went wrong');
    });

    it('should throw error if command fails without pipe (inherit)', () => {
        (spawnSync as jest.Mock).mockReturnValue({
            status: 1,
            stdout: '',
            stderr: Buffer.from('Error output'), // Should be ignored in error message for inherit
        });

        expect(() => runGhCommand(['pr', 'ready', '123'], { stdio: 'inherit' }))
            .toThrow('Command failed with exit code 1');
    });

    it('should pass environment variables', () => {
        const env = { ...process.env, TEST_VAR: '1' };
        runGhCommand(['pr', 'merge', '123'], { env });

        expect(spawnSync).toHaveBeenCalledWith(
            'gh',
            ['pr', 'merge', '123'],
            expect.objectContaining({
                env: env,
            })
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
            expect.arrayContaining([
                'pr', 'merge', '123', '--subject', maliciousTitle
            ]),
            expect.any(Object)
        );
    });
});
