import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { Logger } from '../../utils/Logger';
import type { DecisionRequest, DecisionResponse } from './types';

export interface GeminiDecisionClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  initialDelayMs?: number;
}

export class GeminiDecisionClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly client: AxiosInstance;
  private readonly logger = Logger.getInstance();

  constructor(options: GeminiDecisionClientOptions) {
    if (!options.apiKey?.trim()) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.model = options.model || 'gemini-decision-1';
    this.maxRetries = options.maxRetries ?? 3;
    this.initialDelayMs = options.initialDelayMs ?? 1000;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      timeout: 30000,
    });
  }

  public async decide(request: DecisionRequest): Promise<DecisionResponse> {
    const payload = {
      model: request.model || this.model,
      input: request.input,
      questions: request.questions,
    };

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const response = await this.client.post<DecisionResponse>('/decisions', payload);
        return response.data;
      } catch (error) {
        attempt++;
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const isRateLimit = status === 429;
        const isServerError = typeof status === 'number' && status >= 500 && status < 600;

        if ((isRateLimit || isServerError) && attempt <= this.maxRetries) {
          const jitter = Math.floor(Math.random() * 200);
          const delay = this.initialDelayMs * 2 ** (attempt - 1) + jitter;
          this.logger.warn(
            `Decisions API returned HTTP ${status}. Retrying attempt ${attempt}/${this.maxRetries} after ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // 機密情報（APIキー等）が含まれないようサニタイズしたメッセージでエラーをスロー
        const statusInfo = status ? `HTTP ${status}` : 'Network error';
        const errorData = axiosError.response?.data;
        const errorDetail =
          typeof errorData === 'object' && errorData !== null && 'error' in errorData
            ? JSON.stringify((errorData as Record<string, unknown>).error)
            : axiosError.message;

        this.logger.error(`Decisions API request failed (${statusInfo}): ${errorDetail}`);
        throw new Error(`Decisions API request failed (${statusInfo}): ${errorDetail}`, { cause: error });
      }
    }

    throw new Error(`Decisions API failed after ${this.maxRetries} retries`);
  }
}
