import axios from 'axios';
import { Logger } from '../../utils/Logger';
import { JulesInvestigator } from '../JulesInvestigator';

jest.mock('axios');
jest.mock('../../utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

describe('JulesInvestigator', () => {
  let investigator: JulesInvestigator;
  let mockGet: jest.Mock;
  let mockPost: jest.Mock;
  let mockLoggerError: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGet = jest.fn();
    mockPost = jest.fn();

    // Setup axios create mock
    (axios.create as jest.Mock).mockReturnValue({
      get: mockGet,
      post: mockPost,
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    mockLoggerError = Logger.getInstance().error as jest.Mock;

    investigator = new JulesInvestigator({ apiKey: 'test-api-key' });
  });

  describe('listSources', () => {
    it('should successfully list sources', async () => {
      const mockSources = {
        sources: [
          { id: '1', name: 'source1' },
          { id: '2', name: 'source2' },
        ],
      };
      mockGet.mockResolvedValueOnce({ data: mockSources });

      const result = await investigator.listSources();

      expect(mockGet).toHaveBeenCalledWith('/sources');
      expect(result).toEqual(mockSources);
    });

    it('should throw and log error when listSources fails with standard Error', async () => {
      const error = new Error('Network failure');
      mockGet.mockRejectedValueOnce(error);
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValueOnce(false);

      const handleApiErrorSpy = jest.spyOn(investigator as any, 'handleApiError');

      await expect(investigator.listSources()).rejects.toHaveProperty('code', 'UNKNOWN_ERROR');

      expect(handleApiErrorSpy).toHaveBeenCalledWith(error);
      expect(mockLoggerError).toHaveBeenCalledWith('Failed to list sources', {
        error: expect.objectContaining({
          code: 'UNKNOWN_ERROR',
        }),
      });
    });

    it('should handle AxiosError correctly', async () => {
      const axiosError = new Error('Rate limited');
      (axiosError as any).response = { status: 429, data: { message: 'Too Many Requests' } };

      mockGet.mockRejectedValueOnce(axiosError);
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValueOnce(true);

      const handleApiErrorSpy = jest.spyOn(investigator as any, 'handleApiError');

      await expect(investigator.listSources()).rejects.toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');

      expect(handleApiErrorSpy).toHaveBeenCalledWith(axiosError);
      expect(mockLoggerError).toHaveBeenCalledWith('Failed to list sources', {
        error: expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      });
    });
  });
});
