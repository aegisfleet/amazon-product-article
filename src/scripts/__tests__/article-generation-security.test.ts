import fs from 'fs/promises';
import { GeneratedArticle } from '../../article/ArticleGenerator';
import { saveArticle } from '../article-generation-cli';

// Mock Logger to prevent console noise
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
jest.mock('fs/promises');
jest.mock('path', () => {
  const originalPath = jest.requireActual('path');
  return {
    ...originalPath,
    join: jest.fn((...args) => originalPath.join(...args)),
  };
});

describe('saveArticle Security', () => {
  const mockArticle: GeneratedArticle = {
    content: 'test content',
    metadata: {} as any,
    wordCount: 100,
    sections: [],
    affiliateLinks: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  it('should reject ASIN with path traversal characters (../)', async () => {
    const maliciousAsin = '../etc/passwd';
    await expect(saveArticle(mockArticle, maliciousAsin))
      .rejects
      .toThrow('Invalid ASIN format');

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should reject ASIN with path traversal characters (..\\)', async () => {
    const maliciousAsin = '..\\windows\\system32';
    await expect(saveArticle(mockArticle, maliciousAsin))
      .rejects
      .toThrow('Invalid ASIN format');

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should reject ASIN that is too long', async () => {
    const longAsin = 'A'.repeat(11);
    await expect(saveArticle(mockArticle, longAsin))
      .rejects
      .toThrow('Invalid ASIN format');

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should reject ASIN that is too short', async () => {
    const shortAsin = 'A'.repeat(9);
    await expect(saveArticle(mockArticle, shortAsin))
      .rejects
      .toThrow('Invalid ASIN format');

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should reject ASIN with non-alphanumeric characters', async () => {
    const invalidAsin = 'B07DZZJ2B.';
    await expect(saveArticle(mockArticle, invalidAsin))
      .rejects
      .toThrow('Invalid ASIN format');

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should accept valid 10-digit ASIN', async () => {
    const validAsin = 'B07DZZJ2B9';
    await expect(saveArticle(mockArticle, validAsin)).resolves.not.toThrow();

    expect(fs.writeFile).toHaveBeenCalled();
    const filePath = (fs.writeFile as jest.Mock).mock.calls[0][0];
    expect(filePath).toContain(`${validAsin}.md`);
  });
});
