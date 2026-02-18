
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadInvestigationResults } from '../article-generation-cli';

// Mock Logger
jest.mock('../../utils/Logger', () => ({
  Logger: {
    getInstance: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Mock fs and path
jest.mock('node:fs/promises');
jest.mock('node:path', () => {
  const originalPath = jest.requireActual('node:path');
  return {
    ...originalPath,
    join: jest.fn((...args) => originalPath.join(...args)),
  };
});

describe('loadInvestigationResults Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });
  });

  it('should filter out files with missing required analysis fields', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['missing_fields.json']);
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
      analysis: {
        // Missing positivePoints, negativePoints, etc.
        userImpression: 'Good',
      }
    }));

    const results = await loadInvestigationResults();

    // Without validation, this might return a result with missing fields.
    // With Zod validation, this should be 0.
    // For reproduction, we assert the current behavior if we want to prove it fails,
    // or just write the test for the desired behavior.
    // I will write the test for the DESIRED behavior.
    expect(results).toHaveLength(0);
  });

  it('should filter out files with wrong types', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['wrong_types.json']);
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
      analysis: {
        positivePoints: 'should be an array', // Wrong type
        negativePoints: [],
        useCases: [],
        userStories: [],
        userImpression: 'Good',
        sources: [],
        competitiveAnalysis: [],
        recommendation: {
          targetUsers: [],
          pros: [],
          cons: [],
          score: 10
        }
      }
    }));

    const results = await loadInvestigationResults();
    expect(results).toHaveLength(0);
  });

  it('should load valid investigation files', async () => {
    (fs.readdir as jest.Mock).mockResolvedValue(['valid.json']);
    const validData = {
      analysis: {
        positivePoints: ['p1'],
        negativePoints: ['n1'],
        useCases: ['u1'],
        userStories: [{
          userType: 'type1',
          scenario: 'scenario1',
          experience: 'exp1',
          sentiment: 'positive'
        }],
        userImpression: 'Good',
        sources: [{ name: 's1' }],
        competitiveAnalysis: [{
          name: 'comp1',
          priceComparison: 'cheaper',
          featureComparison: ['f1'],
          differentiators: ['d1']
        }],
        recommendation: {
          targetUsers: ['t1'],
          pros: ['p1'],
          cons: ['c1'],
          score: 10
        }
      }
    };
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validData));

    const results = await loadInvestigationResults();
    expect(results).toHaveLength(1);
    expect(results[0]?.investigation.analysis.positivePoints).toEqual(['p1']);
  });
});
