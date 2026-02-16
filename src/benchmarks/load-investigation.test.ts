
import fs from 'fs/promises';
import path from 'path';
import { loadInvestigationResults } from '../scripts/article-generation-cli';
import { Logger } from '../utils/Logger';

// Mock modules
jest.mock('fs/promises');
jest.mock('child_process');
// Logger mock needs to be a bit more elaborate because it's a singleton
jest.mock('../utils/Logger', () => ({
    Logger: {
        getInstance: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
    },
}));

describe('loadInvestigationResults Performance', () => {
    // Generate 100 mock filenames
    const mockFiles = Array.from({ length: 100 }, (_, i) => `B0000000${i.toString().padStart(2, '0')}.json`);

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs.readdir to return our file list
        (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);

        // Mock fs.stat to return a dummy date
        (fs.stat as jest.Mock).mockResolvedValue({
            mtime: new Date('2023-01-01')
        });
    });

    it('should load results efficiently and verify parallel execution (optimized: skip fs.stat)', async () => {
        // Mock fs.readFile to return valid JSON WITH lastInvestigated
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
            analysis: {
                positivePoints: [],
                negativePoints: [],
                useCases: [],
                userStories: [],
                userImpression: 'Good',
                sources: [],
                competitiveAnalysis: [],
                recommendation: { targetUsers: [], pros: [], cons: [], score: 5 },
                lastInvestigated: '2023-01-01T00:00:00.000Z'
            }
        }));

        const start = Date.now();
        const results = await loadInvestigationResults();
        const end = Date.now();

        // Verify results count
        expect(results).toHaveLength(mockFiles.length);

        // Verify fs calls
        expect(fs.readdir).toHaveBeenCalledTimes(1);
        expect(fs.readFile).toHaveBeenCalledTimes(mockFiles.length);

        // Verify fs.access is NOT called (optimization)
        expect(fs.access).not.toHaveBeenCalled();

        // Verify fs.stat is NOT called because lastInvestigated is present
        expect(fs.stat).not.toHaveBeenCalled();

        console.log(`Test loaded ${results.length} files in ${end - start}ms`);
    });

    it('should fallback to fs.stat if lastInvestigated is missing', async () => {
        // Mock fs.readFile to return valid JSON WITHOUT lastInvestigated
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
            analysis: {
                positivePoints: [],
                negativePoints: [],
                useCases: [],
                userStories: [],
                userImpression: 'Good',
                sources: [],
                competitiveAnalysis: [],
                recommendation: { targetUsers: [], pros: [], cons: [], score: 5 },
                // lastInvestigated missing
            }
        }));

        const results = await loadInvestigationResults();

        expect(results).toHaveLength(mockFiles.length);

        // Verify fs.stat IS called because lastInvestigated is missing
        expect(fs.stat).toHaveBeenCalledTimes(mockFiles.length);
    });

    it('should fallback to fs.stat if lastInvestigated is invalid', async () => {
        // Mock fs.readFile to return valid JSON with INVALID lastInvestigated
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
            analysis: {
                positivePoints: [],
                negativePoints: [],
                useCases: [],
                userStories: [],
                userImpression: 'Good',
                sources: [],
                competitiveAnalysis: [],
                recommendation: { targetUsers: [], pros: [], cons: [], score: 5 },
                lastInvestigated: 'invalid-date-string'
            }
        }));

        const results = await loadInvestigationResults();

        expect(results).toHaveLength(mockFiles.length);

        // Verify fs.stat IS called because lastInvestigated is invalid
        expect(fs.stat).toHaveBeenCalledTimes(mockFiles.length);
    });

    it('should handle file read errors gracefully', async () => {
        // Make the first file fail with ENOENT
        const failingFile = mockFiles[0];
        (fs.readFile as jest.Mock).mockImplementation(async (filePath) => {
             // Simulate async work
             await Promise.resolve();
             const fileName = path.basename(filePath as string);
             if (fileName === failingFile) {
                 const error = new Error('File not found');
                 Object.assign(error, { code: 'ENOENT' });
                 throw error;
             }
             return JSON.stringify({
                analysis: {
                    positivePoints: [],
                    negativePoints: [],
                    useCases: [],
                    userStories: [],
                    userImpression: 'Good',
                    sources: [],
                    competitiveAnalysis: [],
                    recommendation: { targetUsers: [], pros: [], cons: [], score: 5 },
                    lastInvestigated: '2023-01-01T00:00:00.000Z'
                }
            });
        });

        const results = await loadInvestigationResults();

        // One file failed, so length should be N-1 (99)
        expect(results).toHaveLength(mockFiles.length - 1);

        // Verify warning logged for the missing file
        const logger = Logger.getInstance();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`File not found: `));
    });
});
