import axios from 'axios';
import { GeminiDecisionClient } from '../GeminiDecisionClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GeminiDecisionClient', () => {
  const dummyApiKey = 'AIzaSyDummyKeyForTest12345';
  let mockPost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPost = jest.fn();
    mockedAxios.create.mockReturnValue({
      post: mockPost,
    } as unknown as ReturnType<typeof axios.create>);
  });

  test('should throw error when API key is empty', () => {
    expect(() => new GeminiDecisionClient({ apiKey: '' })).toThrow('Gemini API key is required');
  });

  test('should successfully call decisions endpoint and return response', async () => {
    const mockResponseData = {
      answers: {
        category_choice: {
          choice: 'pc-workstation',
          confidence: 0.95,
          probabilities: {
            'pc-workstation': 0.95,
            'mobile-accessories': 0.05,
          },
        },
      },
    };

    mockPost.mockResolvedValueOnce({ data: mockResponseData, status: 200 });

    const client = new GeminiDecisionClient({ apiKey: dummyApiKey });
    const result = await client.decide({
      input: 'Dell 27インチ 4Kモニター',
      questions: {
        category_choice: {
          type: 'choice',
          instructions: 'カテゴリを選択してください',
          criteria: {
            'pc-workstation': 'PC本体やモニター',
            'mobile-accessories': 'スマホ周辺機器',
          },
        },
      },
    });

    expect(result).toEqual(mockResponseData);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/decisions',
      expect.objectContaining({
        model: 'gemini-decision-1',
        input: 'Dell 27インチ 4Kモニター',
      }),
    );
  });

  test('should retry on HTTP 429 and succeed on next attempt', async () => {
    const rateLimitError = {
      isAxiosError: true,
      response: { status: 429, data: { error: { message: 'Resource exhausted' } } },
      message: 'Request failed with status code 429',
    };

    const mockResponseData = {
      answers: {
        category_choice: {
          choice: 'smartphone-tablet',
          confidence: 0.9,
        },
      },
    };

    mockPost.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce({ data: mockResponseData, status: 200 });

    const client = new GeminiDecisionClient({
      apiKey: dummyApiKey,
      initialDelayMs: 10,
    });

    const result = await client.decide({
      input: 'iPad mini',
      questions: {
        category_choice: {
          type: 'choice',
          instructions: 'カテゴリを選択',
          criteria: {
            'smartphone-tablet': 'タブレット',
          },
        },
      },
    });

    expect(result).toEqual(mockResponseData);
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});
