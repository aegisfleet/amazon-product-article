/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion */
import axios from 'axios';
import {
  extractAsinFromUrl,
  fetchUserRequestsFromGas,
  findExistingInvestigation,
  isProductAlreadyInvestigated,
  updateUserRequestsInGas,
} from '../user-requests-helper';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('user-requests-helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('extractAsinFromUrl', () => {
    it.each([
      ['standard /dp/ URL', 'https://www.amazon.co.jp/dp/B08N5WRWNW', 'B08N5WRWNW'],
      ['/gp/product/ URL with query params', 'https://www.amazon.co.jp/gp/product/B09XYZ1234?th=1&psc=1', 'B09XYZ1234'],
      [
        'title-included URL',
        'https://www.amazon.co.jp/Apple-iPhone-13-128GB-Midnight/dp/B09G9FPG2B/ref=sr_1_1',
        'B09G9FPG2B',
      ],
      ['query param ?asin=', 'https://www.amazon.co.jp/item?asin=B07PGL2ZSL', 'B07PGL2ZSL'],
    ])('should extract ASIN from %s', async (_desc, url, expectedAsin) => {
      const asin = await extractAsinFromUrl(url);
      expect(asin).toBe(expectedAsin);
    });

    it('should resolve short URL (link.amazon) and extract ASIN', async () => {
      mockedAxios.head.mockResolvedValueOnce({
        status: 301,
        headers: {
          location: 'https://www.amazon.co.jp/dp/B09G9FPG2B',
        },
      } as any);

      const asin = await extractAsinFromUrl('https://link.amazon/B0eEc3A5l');
      expect(asin).toBe('B09G9FPG2B');
    });

    it.each([
      ['non-Amazon URL', 'https://google.com/test'],
      ['empty string', ''],
      ['invalid URL string', 'invalid-url-string'],
    ])('should return null for %s', async (_desc, invalidUrl) => {
      expect(await extractAsinFromUrl(invalidUrl)).toBeNull();
    });
  });

  describe('findExistingInvestigation and isProductAlreadyInvestigated', () => {
    it('should return exact match if investigation json exists', async () => {
      const result = await findExistingInvestigation('B0FB8VLFDJ');
      expect(typeof result.exists).toBe('boolean');
      if (result.exists) {
        expect(result.existingAsin).toBe('B0FB8VLFDJ');
        expect(result.matchType).toBe('exact');
      }
    });

    it('should return parent match if parent ASIN investigation exists', async () => {
      // B0CD1DVFRH の親ASINは B0H2HPPR69 であり、B08WMJB5WV が調査済み
      const result = await findExistingInvestigation('B0CD1DVFRH');
      expect(result.exists).toBe(true);
      if (result.matchType === 'parent') {
        expect(result.parentAsin).toBe('B0H2HPPR69');
      }
    });

    it('should return false for non-existent ASIN without parent match', async () => {
      const result = await findExistingInvestigation('NONEXISTENTASIN99');
      expect(result.exists).toBe(false);
      const exists = await isProductAlreadyInvestigated('NONEXISTENTASIN99');
      expect(exists).toBe(false);
    });
  });

  describe('fetchUserRequestsFromGas', () => {
    it('should return requests array when GAS returns success', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          count: 1,
          requests: [
            {
              row: 2,
              timestamp: '2026-08-23 10:00:00',
              url: 'https://www.amazon.co.jp/dp/B08N5WRWNW',
              status: '未処理',
            },
          ],
        },
      });

      const result = await fetchUserRequestsFromGas('https://script.google.com/macros/s/xxx/exec', 'secret-token', 5);
      expect(result).toHaveLength(1);
      expect(result[0]?.row).toBe(2);
      expect(result[0]?.url).toBe('https://www.amazon.co.jp/dp/B08N5WRWNW');
    });

    it('should throw error when GAS returns failure', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Unauthorized',
        },
      });

      await expect(
        fetchUserRequestsFromGas('https://script.google.com/macros/s/xxx/exec', 'bad-token', 5),
      ).rejects.toThrow('GAS API error: Unauthorized');
    });
  });

  describe('updateUserRequestsInGas', () => {
    it('should return updated count on success', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          updatedCount: 2,
        },
      });

      const count = await updateUserRequestsInGas('https://script.google.com/macros/s/xxx/exec', 'secret-token', [
        { row: 2, status: '完了', asin: 'B08N5WRWNW' },
        { row: 3, status: '無効なURL' },
      ]);

      expect(count).toBe(2);
    });

    it('should return 0 immediately if updates array is empty', async () => {
      const count = await updateUserRequestsInGas('https://script.google.com/macros/s/xxx/exec', 'secret-token', []);
      expect(count).toBe(0);
      expect(mockedAxios.post.mock.calls).toHaveLength(0);
    });
  });
});
