/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion */
import axios from 'axios';
import { extractAsinFromUrl, isAsin, parseInputAsin, resolveUrl } from './amazon';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('amazon utility', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAsin', () => {
    it('should validate valid ASINs (case insensitive)', () => {
      expect(isAsin('B0BGJHQCFQ')).toBe(true);
      expect(isAsin('b0bgjhqcfq')).toBe(true);
      expect(isAsin('408781274X')).toBe(true);
    });

    it('should invalidate invalid ASINs', () => {
      expect(isAsin('B0BGJHQCF')).toBe(false);
      expect(isAsin('B0BGJHQCFQQ')).toBe(false);
      expect(isAsin('https://www.amazon.co.jp/')).toBe(false);
    });
  });

  describe('extractAsinFromUrl', () => {
    it('should extract ASIN from standard dp URLs', () => {
      expect(
        extractAsinFromUrl(
          'https://www.amazon.co.jp/%E3%82%AA%E3%83%BC%E3%83%97%E3%83%B3%E3%83%95%E3%82%A1%E3%83%BC%E3%83%A0-%E3%83%89%E3%83%83%E3%82%B0%E3%83%95%E3%83%BC%E3%83%89-%E3%82%BF%E3%83%BC%E3%82%AD%E3%83%BC%EF%BC%86%E3%83%81%E3%82%AD%E3%83%B3-%E3%83%AC%E3%82%B7%E3%83%94-1-81kg/dp/B0BGJHQCFQ/ref=sr_1_1',
        ),
      ).toBe('B0BGJHQCFQ');
    });

    it('should extract ASIN from gp/product URLs', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/gp/product/B0BGJHQCFQ/ref=ox_sc_act_title_1')).toBe(
        'B0BGJHQCFQ',
      );
    });

    it('should extract ASIN from exec/obidos/ASIN URLs', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/exec/obidos/ASIN/B0BGJHQCFQ')).toBe('B0BGJHQCFQ');
    });

    it('should extract ASIN from gp/aw/d mobile URLs', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/gp/aw/d/B0BGJHQCFQ')).toBe('B0BGJHQCFQ');
    });

    it('should extract ASIN from /d/ URLs', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/d/B0BGJHQCFQ')).toBe('B0BGJHQCFQ');
    });

    it('should extract ASIN from product-reviews URLs', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/product-reviews/B0BGJHQCFQ')).toBe('B0BGJHQCFQ');
    });

    it('should extract ASIN from query parameters (asin or pd_rd_i)', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/s?k=test&asin=B0BGJHQCFQ')).toBe('B0BGJHQCFQ');
      expect(extractAsinFromUrl('https://www.amazon.co.jp/dp/other/ref=xyz?pd_rd_i=B0BGJHQCFQ')).toBe('B0BGJHQCFQ');
    });

    it('should extract case-insensitively and return in upper case', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/dp/b0bgjhqcfq')).toBe('B0BGJHQCFQ');
    });

    it('should return null for invalid URLs', () => {
      expect(extractAsinFromUrl('https://www.amazon.co.jp/')).toBeNull();
      expect(extractAsinFromUrl('https://google.com')).toBeNull();
    });
  });

  describe('resolveUrl', () => {
    it('should resolve a redirect using HEAD request', async () => {
      mockedAxios.head.mockResolvedValueOnce({
        status: 301,
        headers: { location: 'https://www.amazon.co.jp/dp/B0BGJHQCFQ' },
      } as any);

      const resolved = await resolveUrl('https://amzn.to/3S68KbB');
      expect(resolved).toBe('https://www.amazon.co.jp/dp/B0BGJHQCFQ');
      expect(mockedAxios.head).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should fallback to GET if HEAD request fails', async () => {
      mockedAxios.head.mockRejectedValueOnce(new Error('Method Not Allowed'));
      mockedAxios.get.mockResolvedValueOnce({
        status: 301,
        headers: { location: 'https://www.amazon.co.jp/dp/B0BGJHQCFQ' },
      } as any);

      const resolved = await resolveUrl('https://amzn.to/3S68KbB');
      expect(resolved).toBe('https://www.amazon.co.jp/dp/B0BGJHQCFQ');
      expect(mockedAxios.head).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if both HEAD and GET fail', async () => {
      mockedAxios.head.mockRejectedValueOnce(new Error('Network Error'));
      mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

      await expect(resolveUrl('https://amzn.to/3S68KbB')).rejects.toThrow('Failed to resolve URL');
    });

    it('should stop and return url when redirect limit is reached', async () => {
      mockedAxios.head.mockResolvedValue({
        status: 302,
        headers: { location: 'https://amzn.to/loop' },
      } as any);

      await expect(resolveUrl('https://amzn.to/loop')).rejects.toThrow('Too many redirects');
    });
  });

  describe('parseInputAsin', () => {
    it('should return ASIN directly if input is an ASIN', async () => {
      const result = await parseInputAsin('B0BGJHQCFQ');
      expect(result).toBe('B0BGJHQCFQ');
      expect(mockedAxios.head).not.toHaveBeenCalled();
    });

    it('should extract ASIN from standard URL without calling HTTP', async () => {
      const result = await parseInputAsin('https://www.amazon.co.jp/dp/B0BGJHQCFQ');
      expect(result).toBe('B0BGJHQCFQ');
      expect(mockedAxios.head).not.toHaveBeenCalled();
    });

    it('should resolve short URL and extract ASIN', async () => {
      mockedAxios.head.mockResolvedValueOnce({
        status: 301,
        headers: { location: 'https://www.amazon.co.jp/dp/B0BGJHQCFQ' },
      } as any);

      const result = await parseInputAsin('https://amzn.asia/d/02UXOkBM');
      expect(result).toBe('B0BGJHQCFQ');
      expect(mockedAxios.head).toHaveBeenCalledTimes(1);
    });

    it('should resolve link.amazon URL and extract ASIN', async () => {
      mockedAxios.head.mockResolvedValueOnce({
        status: 301,
        headers: { location: 'https://www.amazon.co.jp/dp/B00TASIIHU?th=1' },
      } as any);

      const result = await parseInputAsin('https://link.amazon/B009oJ3DU');
      expect(result).toBe('B00TASIIHU');
      expect(mockedAxios.head).toHaveBeenCalledTimes(1);
    });

    it('should throw error if input is not ASIN or Amazon URL', async () => {
      await expect(parseInputAsin('invalid-string')).rejects.toThrow('Invalid ASIN or Amazon URL format');
    });

    it('should throw error if resolved URL does not contain ASIN', async () => {
      mockedAxios.head.mockResolvedValueOnce({
        status: 200,
        headers: {},
      } as any);

      await expect(parseInputAsin('https://amzn.asia/d/nothing')).rejects.toThrow('ASIN could not be found');
    });
  });
});
