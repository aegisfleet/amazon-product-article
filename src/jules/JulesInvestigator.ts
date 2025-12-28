/**
 * Jules_Investigator - Google Jules APIを使用した商品調査の実行
 * 
 * 公式APIドキュメント: https://jules.google/docs/api/reference/
 * ※ 迷ったら上記ドキュメントを参照してください
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  ActivitiesResponse,
  InvestigationContext,
  InvestigationResult,
  JulesCredentials,
  JulesError,
  JulesSessionRequest,
  JulesSessionResponse,
  JulesSourcesResponse,
  SessionActivity,
  SessionStatus,
  SourceContext
} from '../types/JulesTypes';
import { Product } from '../types/Product';
import { Logger } from '../utils/Logger';

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1alpha';

export class JulesInvestigator {
  private client: AxiosInstance;
  private credentials: JulesCredentials;
  private logger: Logger;

  constructor(credentials: JulesCredentials) {
    this.credentials = credentials;
    this.logger = Logger.getInstance();

    this.client = axios.create({
      baseURL: JULES_API_BASE_URL,
      timeout: 30000,
      headers: {
        'X-Goog-Api-Key': credentials.apiKey,
        'Content-Type': 'application/json'
      }
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.info('Jules API Request', {
          method: config.method,
          url: config.url
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
   * 利用可能なソース（GitHubリポジトリ）を一覧取得
   */
  async listSources(): Promise<JulesSourcesResponse> {
    try {
      const response = await this.client.get<JulesSourcesResponse>('/sources');
      this.logger.info('Jules sources retrieved', { count: response.data.sources.length });
      return response.data;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to list Jules sources', julesError);
      throw new Error(`Failed to list sources: ${julesError.message}`);
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
        requirePlanApproval: false  // 自動承認
      };

      const response = await this.client.post<JulesSessionResponse>(
        '/sessions',
        request
      );

      const sessionId = response.data.id;
      this.logger.info('Jules session created successfully', { sessionId, name: response.data.name });

      return sessionId;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to create Jules session', julesError);
      throw new Error(`Jules session creation failed: ${julesError.message}`);
    }
  }

  /**
   * セッション情報を取得
   */
  async getSession(sessionId: string): Promise<JulesSessionResponse> {
    try {
      const response = await this.client.get<JulesSessionResponse>(
        `/sessions/${sessionId}`
      );
      return response.data;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to get session', { sessionId, error: julesError });
      throw new Error(`Failed to get session: ${julesError.message}`);
    }
  }

  /**
   * セッションのアクティビティを取得
   */
  async listActivities(sessionId: string, pageSize = 30): Promise<SessionActivity[]> {
    try {
      const response = await this.client.get<ActivitiesResponse>(
        `/sessions/${sessionId}/activities`,
        { params: { pageSize } }
      );
      return response.data.activities;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to list activities', { sessionId, error: julesError });
      throw new Error(`Failed to list activities: ${julesError.message}`);
    }
  }

  /**
   * セッションにメッセージを送信
   */
  async sendMessage(sessionId: string, prompt: string): Promise<void> {
    try {
      await this.client.post(
        `/sessions/${sessionId}:sendMessage`,
        { prompt }
      );
      this.logger.info('Message sent to session', { sessionId });
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to send message', { sessionId, error: julesError });
      throw new Error(`Failed to send message: ${julesError.message}`);
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
      throw new Error(`Failed to approve plan: ${julesError.message}`);
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
      const latestActivity = activities[activities.length - 1];

      let status: SessionStatus['status'] = 'processing';
      if (hasOutput) {
        status = 'completed';
      } else if (latestActivity?.type === 'AGENT_MESSAGE') {
        status = 'processing';
      }

      return {
        sessionId,
        status,
        currentStep: latestActivity?.content?.substring(0, 100) ?? undefined
      };
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to get session status', { sessionId, error: julesError });
      throw new Error(`Session status retrieval failed: ${julesError.message}`);
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
        .filter(a => a.type === 'AGENT_MESSAGE')
        .map(a => a.content || '')
        .join('\n');

      // 簡易的な分析結果パース（実際にはより洗練されたパースが必要）
      const result: InvestigationResult = {
        sessionId,
        product,
        analysis: this.parseAnalysisFromContent(agentMessages),
        generatedAt: new Date(),
        rawResponse: agentMessages
      };

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
   * コンテンツから分析結果をパース
   */
  private parseAnalysisFromContent(content: string): InvestigationResult['analysis'] {
    // JSONブロックを抽出して解析を試みる
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as { analysis?: InvestigationResult['analysis'] };
        if (parsed.analysis) {
          return parsed.analysis;
        }
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
        score: 0
      }
    };
  }

  /**
   * 調査プロンプトを生成
   */
  formatInvestigationPrompt(product: Product): string {
    // PA-API v5ではレビューデータ取得不可のため外部収集を依頼
    const prompt = `商品「${product.title}」について以下の観点で詳細調査を実施してください：

⚠️ 重要：Amazon PA-APIの制限により、評価・レビュー数データは取得できていません。
外部の情報源（価格.com、レビューブログ、SNS等）から実際のユーザーレビューを収集・分析してください。

【最優先事項：調査の継続と完了】
もし特定の商品（型番: ${(product as any).asins ? (product as any).asins.join('/') : product.asin}）に関する具体的なレビューや情報が見つからない場合でも、
**絶対に調査を中断したり、ユーザーに判断を仰ぐための質問（「オプションA/B/C」の提示など）を出力したりしないでください。**

その場合は、直ちに**「該当カテゴリ（${product.category}）の一般論としての市場分析」**に切り替えてください。
具体的には：
1. この種の製品（${product.category}）を購入するユーザーが一般的に重視するポイントを挙げる
2. 同価格帯の一般的な競合製品と比較した際の、この商品の（スペック上の）強み・弱みを分析する
3. 「一般的なユーザーの声」として、このカテゴリの製品によくある肯定・否定意見を記載する
4. JSONの "sources" フィールドには、具体的なURLの代わりに "General Market Knowledge" または "Category Analysis" と記載する

**あなたの出力は、最終的に必ず指定されたJSON形式である必要があります。**
「調査できませんでした」という報告のみや、選択肢の提示のみで終わることは避けてください。
不完全な情報であっても、可能な限り推測や一般的知見を交えて、指定されたJSON構造を埋めてください。

----

以下の観点で調査・分析を行ってください：

1. ユーザーレビュー分析（"Voice of the Customer"）
   ⇒ Amazon以外のレビューサイト（価格.com、みんなのレビュー等）も積極的に調査
   - 具体的な使用体験と満足ポイント（単なる機能列挙ではなく、体験として記述）
   - 問題点と改善要望
   - 使用シーン：どのような場面で活用されているか

2. ユーザーストーリーと実体験
   - 実際のユーザーがどのような背景で商品を購入し、どのように生活が変わったか
   - 具体的なエピソードや感想（「通勤時間が楽しくなった」「家事が楽になった」など）
   - 良い体験だけでなく、失敗談や苦労した点も含める

3. 競合商品との比較
   - 同カテゴリの主要競合商品3-5点
   - 価格、機能、品質の比較
   - 差別化ポイントの特定

4. 購買推奨度
   - どのようなユーザーに適しているか
   - 購入時の注意点
   - コストパフォーマンス評価

5. 情報ソース
   - 調査に使用した情報の出典（レビューサイト、ブログ、SNSなど）

重要：Amazonの商品ページへのアクセスが拒否される（403エラー等）場合でも調査を諦めないでください。
以下の「商品名」や「型番/仕様」を使用してGoogle検索を行い、ブログ記事、レビューサイト、YouTube動画、競合他社の販売ページなどから情報を収集してください。
「Amazonにアクセスできなかったため調査不能」という結論は避けてください。

商品情報：
- ASIN: ${product.asin}
- 商品名: ${product.title}
- カテゴリ: ${product.category}
- 価格: ${product.price.formatted}
- 仕様・詳細:
${Object.entries(product.specifications).map(([key, value]) => `  - ${key}: ${value}`).join('\n')}

調査結果は以下のJSON形式で構造化して提供してください。
なお、ファイル名は "data/investigations/${product.asin}.json" としてください：
\`\`\`json
{
  "analysis": {
    "positivePoints": ["具体的な良い点1", "具体的な良い点2"],
    "negativePoints": ["具体的な問題点1", "具体的な問題点2"],
    "useCases": ["使用シーン1", "使用シーン2"],
    "userStories": [
      {
        "userType": "ユーザー属性（例：30代会社員、主婦、学生）",
        "scenario": "使用シチュエーション",
        "experience": "具体的な体験談・ストーリー",
        "sentiment": "positive" | "negative" | "mixed"
      }
    ],
    "userImpression": "ユーザーの総評・全体的な感想のまとめ",
    "sources": [
      {
        "name": "情報源の名前",
        "url": "URL（もしあれば）",
        "credibility": "信頼性評価"
      }
    ],
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
}
\`\`\``;

    return prompt;
  }

  /**
   * 調査セッションを開始（非同期用：即座にセッションIDを返す）
   * GitHub Actions ワークフローで使用 - Julesが非同期でPRを作成する
   */
  async startInvestigation(
    product: Product,
    sourceContext: SourceContext
  ): Promise<{ sessionId: string; sessionName: string; product: Product }> {
    const context: InvestigationContext = {
      product,
      focusAreas: ['user_reviews', 'competitive_analysis', 'purchase_recommendation'],
      analysisDepth: 'detailed',
      includeCompetitors: true
    };

    const prompt = this.formatInvestigationPrompt(product);
    const sessionId = await this.createSession(prompt, context, sourceContext);
    const session = await this.getSession(sessionId);

    this.logger.info('Investigation session started (async mode)', {
      sessionId,
      sessionName: session.name,
      productAsin: product.asin
    });

    return {
      sessionId,
      sessionName: session.name,
      product
    };
  }

  /**
   * 完全な調査プロセスを実行（セッション作成から結果取得まで）
   * ローカル実行用 - 完了まで待機する
   */
  async conductInvestigation(
    product: Product,
    sourceContext: SourceContext,
    maxWaitTime: number = 300000
  ): Promise<InvestigationResult> {
    const context: InvestigationContext = {
      product,
      focusAreas: ['user_reviews', 'competitive_analysis', 'purchase_recommendation'],
      analysisDepth: 'detailed',
      includeCompetitors: true
    };

    const prompt = this.formatInvestigationPrompt(product);
    const sessionId = await this.createSession(prompt, context, sourceContext);

    // セッション完了まで待機
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.monitorSession(sessionId);

      if (status.status === 'completed') {
        return await this.retrieveResults(sessionId, product);
      } else if (status.status === 'failed') {
        throw new Error(`Investigation failed: ${status.error}`);
      }

      // 10秒待機してから再チェック
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    throw new Error(`Investigation timeout after ${maxWaitTime}ms`);
  }

  /**
   * APIエラーを処理
   */
  private handleApiError(error: unknown): JulesError {
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
          message: 'Jules API authentication failed. Check your API key.',
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
    if (error instanceof Error) {
      if (error.message.includes('ECONNABORTED') || error.message.includes('ENOTFOUND')) {
        return {
          code: 'NETWORK_ERROR',
          message: 'Network error connecting to Jules API',
          details: error.message,
          retryable: true
        };
      }

      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: error,
        retryable: false
      };
    }

    // その他のエラー
    return {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown Jules API error',
      details: error,
      retryable: false
    };
  }
}