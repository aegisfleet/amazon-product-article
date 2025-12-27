/**
 * Jules_Investigator - Google Jules APIを使用した商品調査の実行
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { Product } from '../types/Product';
import {
  JulesCredentials,
  InvestigationContext,
  JulesSessionRequest,
  JulesSessionResponse,
  SessionStatus,
  InvestigationResult,
  JulesError,
  JulesApiResponse
} from '../types/JulesTypes';
import { Logger } from '../utils/Logger';

export class JulesInvestigator {
  private client: AxiosInstance;
  private credentials: JulesCredentials;
  private logger: Logger;

  constructor(credentials: JulesCredentials) {
    this.credentials = credentials;
    this.logger = Logger.getInstance();
    
    this.client = axios.create({
      baseURL: 'https://jules-api.googleapis.com/v1',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
        'X-Project-ID': credentials.projectId
      }
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.info('Jules API Request', {
          method: config.method,
          url: config.url,
          headers: config.headers
        });
        return config;
      },
      (error) => {
        this.logger.error('Jules API Request Error', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.info('Jules API Response', {
          status: response.status,
          statusText: response.statusText
        });
        return response;
      },
      (error) => {
        this.logger.error('Jules API Response Error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * 商品調査セッションを作成
   */
  async createSession(prompt: string, context: InvestigationContext): Promise<string> {
    try {
      const request: JulesSessionRequest = {
        prompt,
        context,
        sessionConfig: {
          maxTokens: 4000,
          temperature: 0.7,
          timeout: 300000 // 5 minutes
        }
      };

      const response = await this.client.post<JulesApiResponse<JulesSessionResponse>>(
        '/sessions',
        request
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(`Failed to create Jules session: ${response.data.error?.message}`);
      }

      const sessionId = response.data.data.sessionId;
      this.logger.info('Jules session created successfully', { sessionId });
      
      return sessionId;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to create Jules session', julesError);
      throw new Error(`Jules session creation failed: ${julesError.message}`);
    }
  }

  /**
   * セッションのステータスを監視
   */
  async monitorSession(sessionId: string): Promise<SessionStatus> {
    try {
      const response = await this.client.get<JulesApiResponse<SessionStatus>>(
        `/sessions/${sessionId}/status`
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(`Failed to get session status: ${response.data.error?.message}`);
      }

      const status = response.data.data;
      this.logger.info('Session status retrieved', { sessionId, status: status.status });
      
      return status;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to get session status', { sessionId, error: julesError });
      throw new Error(`Session status retrieval failed: ${julesError.message}`);
    }
  }

  /**
   * 調査結果を取得
   */
  async retrieveResults(sessionId: string): Promise<InvestigationResult> {
    try {
      const response = await this.client.get<JulesApiResponse<InvestigationResult>>(
        `/sessions/${sessionId}/results`
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(`Failed to retrieve results: ${response.data.error?.message}`);
      }

      const result = response.data.data;
      result.generatedAt = new Date();
      
      this.logger.info('Investigation results retrieved successfully', { 
        sessionId, 
        analysisPoints: result.analysis.positivePoints.length + result.analysis.negativePoints.length 
      });
      
      return result;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to retrieve investigation results', { sessionId, error: julesError });
      throw new Error(`Results retrieval failed: ${julesError.message}`);
    }
  }

  /**
   * 調査プロンプトを生成
   */
  formatInvestigationPrompt(product: Product): string {
    const prompt = `商品「${product.title}」について以下の観点で詳細調査を実施してください：

1. ユーザーレビュー分析
   - 良い点：具体的な使用体験と満足ポイント
   - 悪い点：問題点と改善要望
   - 使用シーン：どのような場面で活用されているか

2. 競合商品との比較
   - 同カテゴリの主要競合商品3-5点
   - 価格、機能、品質の比較
   - 差別化ポイントの特定

3. 購買推奨度
   - どのようなユーザーに適しているか
   - 購入時の注意点
   - コストパフォーマンス評価

商品情報：
- ASIN: ${product.asin}
- カテゴリ: ${product.category}
- 価格: ${product.price.formatted}
- 評価: ${product.rating.average}/5 (${product.rating.count}件のレビュー)
- 仕様: ${Object.entries(product.specifications).map(([key, value]) => `${key}: ${value}`).join(', ')}

調査結果は以下のJSON形式で構造化して提供してください：
{
  "analysis": {
    "positivePoints": ["具体的な良い点1", "具体的な良い点2", ...],
    "negativePoints": ["具体的な問題点1", "具体的な問題点2", ...],
    "useCases": ["使用シーン1", "使用シーン2", ...],
    "competitiveAnalysis": [
      {
        "name": "競合商品名",
        "priceComparison": "価格比較の説明",
        "featureComparison": ["機能比較1", "機能比較2"],
        "differentiators": ["差別化ポイント1", "差別化ポイント2"]
      }
    ],
    "recommendation": {
      "targetUsers": ["推奨ユーザー1", "推奨ユーザー2"],
      "pros": ["購入メリット1", "購入メリット2"],
      "cons": ["購入時の注意点1", "購入時の注意点2"],
      "score": 85
    }
  }
}`;

    return prompt;
  }

  /**
   * 完全な調査プロセスを実行（セッション作成から結果取得まで）
   */
  async conductInvestigation(product: Product, maxWaitTime: number = 300000): Promise<InvestigationResult> {
    const context: InvestigationContext = {
      product,
      focusAreas: ['user_reviews', 'competitive_analysis', 'purchase_recommendation'],
      analysisDepth: 'detailed',
      includeCompetitors: true
    };

    const prompt = this.formatInvestigationPrompt(product);
    const sessionId = await this.createSession(prompt, context);

    // セッション完了まで待機
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.monitorSession(sessionId);
      
      if (status.status === 'completed') {
        return await this.retrieveResults(sessionId);
      } else if (status.status === 'failed') {
        throw new Error(`Investigation failed: ${status.error}`);
      }

      // 5秒待機してから再チェック
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error(`Investigation timeout after ${maxWaitTime}ms`);
  }

  /**
   * APIエラーを処理
   */
  private handleApiError(error: any): JulesError {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;

      // レート制限エラー
      if (status === 429) {
        return {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Jules API rate limit exceeded',
          details: data,
          retryable: true
        };
      }

      // 認証エラー
      if (status === 401 || status === 403) {
        return {
          code: 'AUTHENTICATION_ERROR',
          message: 'Jules API authentication failed',
          details: data,
          retryable: false
        };
      }

      // サーバーエラー
      if (status && status >= 500) {
        return {
          code: 'SERVER_ERROR',
          message: 'Jules API server error',
          details: data,
          retryable: true
        };
      }

      // その他のHTTPエラー
      return {
        code: 'HTTP_ERROR',
        message: `Jules API HTTP error: ${status}`,
        details: data,
        retryable: false
      };
    }

    // ネットワークエラーやタイムアウト
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error connecting to Jules API',
        details: error.message,
        retryable: true
      };
    }

    // その他のエラー
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'Unknown Jules API error',
      details: error,
      retryable: false
    };
  }
}