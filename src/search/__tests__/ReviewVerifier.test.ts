import axios from 'axios';
import { ReviewVerifier } from '../ReviewVerifier';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Create a mock instance for axios.create()
const mockAxiosInstance = {
    get: jest.fn(),
    interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
    },
};

mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

describe('ReviewVerifier', () => {
    let verifier: ReviewVerifier;

    beforeEach(() => {
        jest.clearAllMocks();
        verifier = new ReviewVerifier();
    });

    it('should verify reviews successfully with standard format', async () => {
        const html = `
      <html>
        <body>
          <span class="a-icon-alt">5つ星のうち4.6</span>
          <span>1,234個の評価</span>
        </body>
      </html>
    `;

        mockAxiosInstance.get.mockResolvedValue({ data: html });

        const result = await verifier.verifyReviews('TESTASIN');

        expect(result).not.toBeNull();
        expect(result?.rating).toBe(4.6);
        expect(result?.count).toBe(1234);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith(expect.stringContaining('TESTASIN'));
    });

    it('should verify reviews with global ratings text', async () => {
        const html = `
      <html>
        <body>
          <span class="a-icon-alt">5つ星のうち4.0</span>
          <span>500 global ratings</span>
        </body>
      </html>
    `;

        mockAxiosInstance.get.mockResolvedValue({ data: html });

        const result = await verifier.verifyReviews('TESTASIN');

        expect(result).not.toBeNull();
        expect(result?.rating).toBe(4.0);
        expect(result?.count).toBe(500);
    });

    it('should verify reviews using ID fallback', async () => {
        const html = `
      <html>
        <body>
          <span class="a-icon-alt">5つ星のうち3.5</span>
          <span id="acrCustomerReviewText">100 ratings</span>
        </body>
      </html>
    `;

        mockAxiosInstance.get.mockResolvedValue({ data: html });

        const result = await verifier.verifyReviews('TESTASIN');

        expect(result).not.toBeNull();
        expect(result?.rating).toBe(3.5);
        expect(result?.count).toBe(100);
    });

    it('should return null when verification fails (no review data)', async () => {
        const html = `
      <html>
        <body>
          <span>No reviews</span>
        </body>
      </html>
    `;

        mockAxiosInstance.get.mockResolvedValue({ data: html });

        const result = await verifier.verifyReviews('TESTASIN');

        expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
        mockAxiosInstance.get.mockRejectedValue(new Error('Network Error'));

        const result = await verifier.verifyReviews('TESTASIN');

        expect(result).toBeNull();
    });
});
