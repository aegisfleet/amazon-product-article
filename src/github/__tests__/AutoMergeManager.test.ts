import type { PullRequest } from '../../types/GitHubTypes';
import { AutoMergeManager } from '../AutoMergeManager';

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
    changedFiles: ['data/test.json'],
  });

  test('verifyAuthor should return true for aegisfleet', () => {
    const pr = createMockPr('aegisfleet');
    expect(autoMergeManager.verifyAuthor(pr)).toBe(true);
  });

  test('verifyAuthor should return false for jules[bot]', () => {
    const pr = createMockPr('jules[bot]');
    expect(autoMergeManager.verifyAuthor(pr)).toBe(false);
  });

  test('verifyAuthor should return false for other authors', () => {
    const pr = createMockPr('random-user');
    expect(autoMergeManager.verifyAuthor(pr)).toBe(false);
  });
});
