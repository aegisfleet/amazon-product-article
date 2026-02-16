import fs from 'fs/promises';
import { setGitHubOutput } from './github-actions';
import { Logger } from './Logger';

jest.mock('fs/promises');

describe('setGitHubOutput', () => {
    const originalEnv = process.env;
    let loggerWarnSpy: jest.SpyInstance;
    let loggerInfoSpy: jest.SpyInstance;

    beforeAll(() => {
        // Ensure logger instance is created
        Logger.getInstance();
    });

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        jest.clearAllMocks();

        // Spy on Logger methods
        loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        loggerInfoSpy = jest.spyOn(Logger.prototype, 'info').mockImplementation();
    });

    afterEach(() => {
        loggerWarnSpy.mockRestore();
        loggerInfoSpy.mockRestore();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should write to GITHUB_OUTPUT file if env var is set', async () => {
        process.env.GITHUB_OUTPUT = '/tmp/github_output';
        const appendFileMock = fs.appendFile as jest.Mock;

        await setGitHubOutput('test-name', 'test-value');

        expect(appendFileMock).toHaveBeenCalledWith('/tmp/github_output', 'test-name=test-value\n');
        expect(loggerInfoSpy).toHaveBeenCalledWith('Set GitHub output: test-name=test-value');
    });

    it('should log warning if GITHUB_OUTPUT env var is not set', async () => {
        delete process.env.GITHUB_OUTPUT;
        const appendFileMock = fs.appendFile as jest.Mock;

        await setGitHubOutput('test-name', 'test-value');

        expect(appendFileMock).not.toHaveBeenCalled();
        expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('GITHUB_OUTPUT environment variable not set'));
    });
});
