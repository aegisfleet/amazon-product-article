/**
 * Jules_Investigator - Google Jules APIを使用した商品調査の実行
 *
 * 公式APIドキュメント: https://jules.google/docs/api/reference/
 * ※ 迷ったら上記ドキュメントを参照してください
 */

import axios, { type AxiosInstance } from 'axios';
import { InvestigationFileSchema } from '../schemas/InvestigationSchema';
import type {
  ActivitiesResponse,
  InvestigationContext,
  InvestigationResult,
  JulesCredentials,
  JulesSessionRequest,
  JulesSessionResponse,
  JulesSourcesResponse,
  SessionActivity,
  SessionStatus,
  SourceContext,
} from '../types/JulesTypes';
import { JulesApiError } from '../types/JulesTypes';
import type { Product } from '../types/Product';
import { Logger } from '../utils/Logger';
import { formatInvestigationPrompt, formatRecommendationPrompt } from './prompts';

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1alpha';

export class JulesInvestigator {
  private readonly client: AxiosInstance;
  private readonly logger: Logger;

  constructor(credentials: JulesCredentials) {
    this.logger = Logger.getInstance();

    this.client = axios.create({
      baseURL: JULES_API_BASE_URL,
      timeout: 30000,
      headers: {
        'X-Goog-Api-Key': credentials.apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.info('Jules API Request', {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          this.logger.error('Jules API Request Error', {
            message: error.message,
            code: error.code,
            config: {
              method: error.config?.method,
              url: error.config?.url,
            },
          });
        } else {
          this.logger.error('Jules API Request Error', error);
        }
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      },
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.info('Jules API Response', {
          status: response.status,
          statusText: response.statusText,
        });
        return response;
      },
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          this.logger.error('Jules API Response Error', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data as unknown,
          });
        } else {
          this.logger.error('Jules API Response Unexpected Error', error);
        }
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  }

  /**
   * 利用可能なソース（GitHubリポジトリ）を一覧取得
   */
  async listSources(): Promise<JulesSourcesResponse> {
    try {
      const response = await this.client.get<JulesSourcesResponse>('/sources');
      this.logger.info('Jules sources retrieved', { count: response.data.sources.length });
      return response.data;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to list sources', { error: julesError });
      throw julesError;
    }
  }

  /**
   * 商品調査セッションを作成
   */
  async createSession(prompt: string, context: InvestigationContext, sourceContext: SourceContext): Promise<string> {
    try {
      const request: JulesSessionRequest = {
        prompt,
        sourceContext,
        title: `Product Investigation: ${context.product.title}`,
        automationMode: 'AUTO_CREATE_PR',
        requirePlanApproval: false, // 自動承認
      };

      const response = await this.client.post<JulesSessionResponse>('/sessions', request);

      const sessionId = response.data.id;
      this.logger.info('Jules session created successfully', { sessionId, name: response.data.name });

      return sessionId;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to create Jules session', julesError);
      throw julesError;
    }
  }

  /**
   * セッション情報を取得
   */
  async getSession(sessionId: string): Promise<JulesSessionResponse> {
    try {
      const response = await this.client.get<JulesSessionResponse>(`/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to get session', { sessionId, error: julesError });
      throw julesError;
    }
  }

  /**
   * セッションのアクティビティを取得
   */
  async listActivities(sessionId: string, pageSize = 30): Promise<SessionActivity[]> {
    try {
      const response = await this.client.get<ActivitiesResponse>(`/sessions/${sessionId}/activities`, {
        params: { pageSize },
      });
      return response.data.activities;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to list activities', { sessionId, error: julesError });
      throw julesError;
    }
  }

  /**
   * セッションにメッセージを送信
   */
  async sendMessage(sessionId: string, prompt: string): Promise<void> {
    try {
      await this.client.post(`/sessions/${sessionId}:sendMessage`, { prompt });
      this.logger.info('Message sent to session', { sessionId });
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to send message', { sessionId, error: julesError });
      throw julesError;
    }
  }

  /**
   * プランを承認
   */
  async approvePlan(sessionId: string): Promise<void> {
    try {
      await this.client.post(`/sessions/${sessionId}:approvePlan`);
      this.logger.info('Plan approved for session', { sessionId });
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to approve plan', { sessionId, error: julesError });
      throw julesError;
    }
  }

  /**
   * セッションのステータスを監視（アクティビティから推定）
   */
  async monitorSession(sessionId: string): Promise<SessionStatus> {
    try {
      const session = await this.getSession(sessionId);
      const activities = await this.listActivities(sessionId);

      // セッション出力があれば完了
      const hasOutput = session.outputs && session.outputs.length > 0;

      // 最新のアクティビティを確認
      const latestActivity = activities.at(-1);

      let status: SessionStatus['status'] = 'processing';
      if (hasOutput) {
        status = 'completed';
      }

      return {
        sessionId,
        status,
        currentStep: latestActivity?.content?.substring(0, 100) ?? undefined,
      };
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to get session status', { sessionId, error: julesError });
      throw julesError;
    }
  }

  /**
   * 調査結果を取得（セッション出力とアクティビティから構築）
   */
  async retrieveResults(sessionId: string, product: Product): Promise<InvestigationResult> {
    try {
      const activities = await this.listActivities(sessionId, 100);

      // エージェントメッセージから分析結果を抽出
      const agentMessages = activities
        .filter((a) => a.type === 'AGENT_MESSAGE')
        .map((a) => a.content || '')
        .join('\n');

      // 簡易的な分析結果パース（実際にはより洗練されたパースが必要）
      const result: InvestigationResult = {
        sessionId,
        product,
        analysis: this.parseAnalysisFromContent(agentMessages),
        generatedAt: new Date(),
        rawResponse: agentMessages,
      };

      this.logger.info('Investigation results retrieved successfully', {
        sessionId,
        analysisPoints: result.analysis.positivePoints.length + result.analysis.negativePoints.length,
      });

      return result;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to retrieve investigation results', { sessionId, error: julesError });
      throw julesError;
    }
  }

  /**
   * コンテンツから分析結果をパース
   */
  private parseAnalysisFromContent(content: string): InvestigationResult['analysis'] {
    // JSONブロックを抽出して解析を試みる
    const jsonRegex = /```json\n([\s\S]*?)```/;
    const jsonMatch = jsonRegex.exec(content);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as unknown;
        // InvestigationFileSchema は { analysis: ... } という構造を期待しているため、
        // 入力がその構造を持っているか確認してからパースする
        const isObjectWithAnalysis = typeof parsed === 'object' && parsed !== null && 'analysis' in parsed;
        const dataToValidate = isObjectWithAnalysis ? parsed : { analysis: parsed };
        const validation = InvestigationFileSchema.safeParse(dataToValidate);

        if (validation.success) {
          return validation.data.analysis as InvestigationResult['analysis'];
        }
        this.logger.warn('JSON analysis does not match schema, using fallback', validation.error);
      } catch {
        this.logger.warn('Failed to parse JSON analysis, using fallback');
      }
    }

    // フォールバック: デフォルト構造を返す
    return {
      positivePoints: [],
      negativePoints: [],
      useCases: [],
      competitiveAnalysis: [],
      userStories: [],
      userImpression: '',
      sources: [],
      recommendation: {
        targetUsers: [],
        pros: [],
        cons: [],
        score: 0,
        scoreRationale: '',
      },
    };
  }

  /**
   * 調査セッションを開始（非同期用：即座にセッションIDを返す）
   * GitHub Actions ワークフローで使用 - Julesが非同期でPRを作成する
   */
  async startInvestigation(
    product: Product,
    sourceContext: SourceContext,
  ): Promise<{ sessionId: string; sessionName: string; product: Product }> {
    const context: InvestigationContext = {
      product,
      focusAreas: ['user_reviews', 'competitive_analysis', 'purchase_recommendation'],
      analysisDepth: 'detailed',
      includeCompetitors: true,
    };

    const prompt = formatInvestigationPrompt(product);
    const sessionId = await this.createSession(prompt, context, sourceContext);
    const session = await this.getSession(sessionId);

    this.logger.info('Investigation session started (async mode)', {
      sessionId,
      sessionName: session.name,
      productAsin: product.asin,
    });

    return {
      sessionId,
      sessionName: session.name,
      product,
    };
  }

  /**
   * 本日の注目商品10選調査を開始
   * Jules がトレンドを探索し、data/recommendations/today.json を作成・コミットする
   */
  async startRecommendationInvestigation(
    sourceContext: SourceContext,
  ): Promise<{ sessionId: string; sessionName: string }> {
    const prompt = formatRecommendationPrompt();
    const request: JulesSessionRequest = {
      prompt,
      sourceContext,
      title: "Today's Recommended Products Investigation",
      automationMode: 'AUTO_CREATE_PR',
      requirePlanApproval: false, // 自動承認
    };

    try {
      const response = await this.client.post<JulesSessionResponse>('/sessions', request);
      const sessionId = response.data.id;
      const sessionName = response.data.name;

      this.logger.info('Recommendation investigation session started', {
        sessionId,
        sessionName,
      });

      return { sessionId, sessionName };
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to start recommendation investigation', julesError);
      throw julesError;
    }
  }

  /**
   * 完全な調査プロセスを実行（セッション作成から結果取得まで）
   * ローカル実行用 - 完了まで待機する
   */
  async conductInvestigation(
    product: Product,
    sourceContext: SourceContext,
    maxWaitTime: number = 300000,
  ): Promise<InvestigationResult> {
    const context: InvestigationContext = {
      product,
      focusAreas: ['user_reviews', 'competitive_analysis', 'purchase_recommendation'],
      analysisDepth: 'detailed',
      includeCompetitors: true,
    };

    const prompt = formatInvestigationPrompt(product);
    const sessionId = await this.createSession(prompt, context, sourceContext);

    // セッション完了まで待機
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.monitorSession(sessionId);

      if (status.status === 'completed') {
        return await this.retrieveResults(sessionId, product);
      } else if (status.status === 'failed') {
        // status.error は JulesError.message に相当すると想定
        throw new JulesApiError({
          code: 'INVESTIGATION_FAILED',
          message: status.error || 'Investigation failed',
          retryable: false
        });
      }

      // 10秒待機してから再チェック
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    throw new JulesApiError({
      code: 'INVESTIGATION_TIMEOUT',
      message: `Investigation timeout after ${maxWaitTime}ms`,
      retryable: true
    });
  }

  /**
   * APIエラーを処理
   */
  private handleApiError(error: unknown): JulesApiError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as unknown;

      // レート制限エラー
      if (status === 429) {
        return new JulesApiError({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Jules API rate limit exceeded',
          details: data as Record<string, unknown>,
          retryable: true,
        }, error);
      }

      // 認証エラー
      if (status === 401 || status === 403) {
        return new JulesApiError({
          code: 'AUTHENTICATION_ERROR',
          message: 'Jules API authentication failed. Check your API key.',
          details: data as Record<string, unknown>,
          retryable: false,
        }, error);
      }

      // サーバーエラー
      if (status && status >= 500) {
        return new JulesApiError({
          code: 'SERVER_ERROR',
          message: 'Jules API server error',
          details: data as Record<string, unknown>,
          retryable: true,
        }, error);
      }

      // その他のHTTPエラー
      return new JulesApiError({
        code: 'HTTP_ERROR',
        message: `Jules API HTTP error: ${status}`,
        details: data as Record<string, unknown>,
        retryable: false,
      }, error);
    }

    // ネットワークエラーやタイムアウト
    if (error instanceof Error) {
      if (error.message.includes('ECONNABORTED') || error.message.includes('ENOTFOUND')) {
        return new JulesApiError({
          code: 'NETWORK_ERROR',
          message: 'Network error connecting to Jules API',
          details: error.message,
          retryable: true,
        }, error);
      }

      return new JulesApiError({
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: {
          name: error.name,
          message: error.message,
        },
        retryable: false,
      }, error);
    }

    // その他のエラー
    return new JulesApiError({
      code: 'UNKNOWN_ERROR',
      message: 'Unknown Jules API error',
      details: String(error),
      retryable: false,
    }, error);
  }
}
