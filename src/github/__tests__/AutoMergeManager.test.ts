import { AutoMergeManager } from '../AutoMergeManager';
import { PullRequest } from '../../types/GitHubTypes';

describe('AutoMergeManager', () => {
    let autoMergeManager: AutoMergeManager;

    beforeEach(() => {
        autoMergeManager = new AutoMergeManager();
    });

    const createMockPr = (author: string): PullRequest => ({
        number: 1,
        title: 'Test PR',
        body: 'Test Body',
        head: 'feature-branch',
        base: 'main',
        author: author,
        state: 'open',
        draft: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
        changedFiles: ['data/test.json']
    });

    test('verifyJulesAuthor should return true for jules[bot]', () => {
        const pr = createMockPr('jules[bot]');
        expect(autoMergeManager.verifyJulesAuthor(pr)).toBe(true);
    });

    test('verifyJulesAuthor should return true for author containing jules', () => {
        const pr = createMockPr('some-jules-user');
        expect(autoMergeManager.verifyJulesAuthor(pr)).toBe(true);
    });

    test('verifyJulesAuthor should return true for aegisfleet', () => {
        const pr = createMockPr('aegisfleet');
        expect(autoMergeManager.verifyJulesAuthor(pr)).toBe(true);
    });

    test('verifyJulesAuthor should return false for other authors', () => {
        const pr = createMockPr('random-user');
        expect(autoMergeManager.verifyJulesAuthor(pr)).toBe(false);
    });
});
