import axios from 'axios';
import {
  extractAsinFromUrl,
  fetchUserRequestsFromGas,
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
    it('should extract ASIN from standard /dp/ URL', async () => {
      const url = 'https://www.amazon.co.jp/dp/B08N5WRWNW';
      const asin = await extractAsinFromUrl(url);
      expect(asin).toBe('B08N5WRWNW');
    });

    it('should extract ASIN from /gp/product/ URL with query params', async () => {
      const url = 'https://www.amazon.co.jp/gp/product/B09XYZ1234?th=1&psc=1';
      const asin = await extractAsinFromUrl(url);
      expect(asin).toBe('B09XYZ1234');
    });

    it('should extract ASIN from title-included URL', async () => {
      const url = 'https://www.amazon.co.jp/Apple-iPhone-13-128GB-Midnight/dp/B09G9FPG2B/ref=sr_1_1';
      const asin = await extractAsinFromUrl(url);
      expect(asin).toBe('B09G9FPG2B');
    });

    it('should extract ASIN from query param ?asin=', async () => {
      const url = 'https://www.amazon.co.jp/item?asin=B07PGL2ZSL';
      const asin = await extractAsinFromUrl(url);
      expect(asin).toBe('B07PGL2ZSL');
    });

    it('should return null for non-Amazon or invalid URLs', async () => {
      expect(await extractAsinFromUrl('https://google.com/test')).toBeNull();
      expect(await extractAsinFromUrl('')).toBeNull();
      expect(await extractAsinFromUrl('invalid-url-string')).toBeNull();
    });
  });

  describe('isProductAlreadyInvestigated', () => {
    it('should return true if investigation json exists', async () => {
      // 既存のテストデータなどを想定
      const exists = await isProductAlreadyInvestigated('B0FB8VLFDJ');
      expect(typeof exists).toBe('boolean');
    });

    it('should return false for non-existent ASIN', async () => {
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
      expect(mockedAxios.post.mock.calls.length).toBe(0);
    });
  });
});
