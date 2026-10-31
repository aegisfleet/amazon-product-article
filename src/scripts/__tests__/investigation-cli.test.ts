import fs from 'node:fs/promises';
import path from 'node:path';
import { setGitHubOutput } from '../../utils/github-actions';
import { generateInvestigationPromptsFromSession, type PromptManifest } from '../investigation-cli';

jest.mock('node:fs/promises');
jest.mock('../../utils/github-actions', () => ({
  setGitHubOutput: jest.fn(),
}));

describe('generateInvestigationPromptsFromSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  it('should generate prompt files and manifest.json for valid products', async () => {
    const mockSession = {
      results: [
        {
          products: [
            {
              asin: 'B08N5WRWNW',
              title: 'Test Product 1',
              category: '家電',
              price: { amount: 2980, currency: 'JPY', formatted: '￥2,980' },
              images: { primary: 'https://example.com/img1.jpg', thumbnails: [] },
              specifications: { color: 'Black' },
              rating: { average: 4.5, count: 100 },
            },
            {
              asin: 'INVALID_ASIN',
              title: 'Invalid Product',
              category: '家電',
              price: { amount: 1000, currency: 'JPY', formatted: '￥1,000' },
              images: { primary: 'https://example.com/img2.jpg', thumbnails: [] },
              specifications: {},
              rating: { average: 4.0, count: 10 },
            },
          ],
        },
      ],
    };

    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockSession));

    const count = await generateInvestigationPromptsFromSession(5, false);

    expect(count).toBe(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(2); // 1 prompt file + 1 manifest.json

    const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find((call: [string, string]) =>
      call[0].endsWith(path.join('data', 'prompts', 'manifest.json')),
    ) as [string, string] | undefined;

    expect(manifestCall).toBeDefined();
    const manifest = JSON.parse(manifestCall![1]) as PromptManifest;
    expect(manifest.totalProducts).toBe(1);
    expect(manifest.items).toEqual([
      {
        asin: 'B08N5WRWNW',
        title: 'Test Product 1',
        promptFile: 'data/prompts/B08N5WRWNW.txt',
      },
    ]);

    expect(setGitHubOutput).toHaveBeenCalledWith('prompts-generated', '1');
    expect(setGitHubOutput).toHaveBeenCalledWith('has-prompts', 'true');
  });

  it('should output 0 and has-prompts=false when no products exist', async () => {
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ results: [] }));

    const count = await generateInvestigationPromptsFromSession(3, false);

    expect(count).toBe(0);
    expect(setGitHubOutput).toHaveBeenCalledWith('prompts-generated', '0');
    expect(setGitHubOutput).toHaveBeenCalledWith('has-prompts', 'false');
  });
});
