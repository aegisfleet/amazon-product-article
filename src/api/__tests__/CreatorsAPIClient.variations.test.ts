import type { CreatorsAPIResponse } from '../../types/CreatorsAPITypes';
import { CreatorsAPIClient } from '../CreatorsAPIClient';

describe('CreatorsAPIClient getVariations', () => {
  let client: CreatorsAPIClient;

  beforeEach(() => {
    client = new CreatorsAPIClient();
    client.authenticate('app-id', 'cred-id', 'cred-secret', 'tag-22');
  });

  it('should throw error for invalid parent ASIN', async () => {
    await expect(client.getVariations('')).rejects.toThrow('Invalid parent ASIN');
    await expect(client.getVariations('INVALID_ASIN_LENGTH')).rejects.toThrow('Invalid parent ASIN');
  });

  it('should collect child ASINs across multiple pages', async () => {
    const page1Response: CreatorsAPIResponse = {
      variationsResult: {
        items: [{ asin: 'B00GH7PGKE' }, { asin: 'B0BD818NQK' }],
        variationSummary: {
          pageCount: 2,
          variationCount: 3,
        },
      },
    };

    const page2Response: CreatorsAPIResponse = {
      variationsResult: {
        items: [{ asin: 'B0DNYF76M4' }],
        variationSummary: {
          pageCount: 2,
          variationCount: 3,
        },
      },
    };

    let callCount = 0;
    jest.spyOn(client as any, 'makeRequest').mockImplementation(async (req: any) => {
      callCount++;
      if (req.variationPage === 1) return page1Response;
      if (req.variationPage === 2) return page2Response;
      return { variationsResult: { items: [] } };
    });

    // sleepを即座に解決するようにモック
    jest.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    const childAsins = await client.getVariations('B0C7L74HJZ');

    expect(callCount).toBe(2);
    expect(childAsins).toEqual(['B00GH7PGKE', 'B0BD818NQK', 'B0DNYF76M4']);
  });

  it('should handle empty variationsResult gracefully', async () => {
    jest.spyOn(client as any, 'makeRequest').mockResolvedValue({
      variationsResult: {
        items: [],
      },
    });

    const childAsins = await client.getVariations('B0C7L74HJZ');
    expect(childAsins).toEqual([]);
  });
});
