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
        return Promise.reject(error as Error);
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
        return Promise.reject(error as Error);
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
        score: 0,
        scoreRationale: ''
      }
    };
  }

  /**
   * 調査プロンプトを生成
   */
  formatInvestigationPrompt(product: Product): string {
    // JSTで現在の日付を取得 (YYYY-MM-DD)
    const today = new Date().toLocaleDateString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '-');

    // ブランド情報の取得（ProductDetail型の場合）
    const brand = 'brand' in product ? (product as any).brand : undefined;
    const brandInfo = brand ? `- ブランド: ${brand}` : '';
    const parentAsinInfo = product.parentAsin ? `- 親ASIN: ${product.parentAsin}` : '';

    const prompt = `【基本ルール】
- 全ての出力は日本語で記述すること
- 認証情報は絶対にログ・ファイル・コミット・PR説明文に含めないこと
- コミット対象は \`data/investigations/${product.asin}.json\` のみ
- 作業前に必ずブランチを確認し、 \`main\` ブランチにいる場合は適切な作業用ブランチ（例: \`investigate-${product.asin}\`）を自身で作成・選別して切り替えること
- **重要：状態の消失を防ぐため、ファイル作成からステージングまでは \`&&\` で連結して一気に実行すること**
  - 例：\`python [調査スクリプト] > data/investigations/${product.asin}.json && git add data/investigations/${product.asin}.json && git status\`
- ファイル作成後は以下の順序で操作すること：
  1. \`git diff data/investigations/${product.asin}.json\` （add前）または \`git diff --staged\` （add後）で内容を確認
  2. \`git status\` でファイルが "Changes to be committed" に含まれていることを確認
- **提出（作業完了）の直前には必ず再度 \`git status\` を実行し、意図した変更がステージングされていることを目視で最終確認すること**

---

## 作業開始前の必須手順

**以下の手順を必ず最初に実行してください：**

1. **現在の状態を確認し、必要に応じてブランチを切り替える**
   \`\`\`bash
   git branch --show-current
   \`\`\`
   - \`main\` ブランチにいる場合、または既存の適切なブランチがない場合は、直ちに新しいブランチを作成して切り替えてください：
     \`\`\`bash
     git checkout -b investigate-${product.asin}
     \`\`\`
   - すでに作業用ブランチにいる場合は、そのまま継続してください。

2. **既存の調査データを確認**
   \`\`\`bash
   cat data/investigations/${product.asin}.json 2>/dev/null || echo "新規調査"
   \`\`\`
   - ファイルが存在する場合: 既存データをベースに更新してください
   - ファイルが存在しない場合: 新規調査を行ってください

2. **既存データがある場合の更新ルール**
   - 既存の「良い点」「悪い点」が現在も有効か検証し、維持または更新
   - 新しいレビューや競合商品の情報を追加
   - \`lastInvestigated\` フィールドを \`${today}\` に更新

---

【PA-API利用】
環境変数（AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG）で認証。
エンドポイント: https://webservices.amazon.co.jp/paapi5/getitems（リージョン: us-west-2）

調査用スクリプト（編集・コミット不要）:
- 商品詳細: \`python scripts/paapi_get_item.py ${product.asin}\` → product_info.json
- 競合検索: \`python scripts/paapi_search_items.py "キーワード"\` → search_results.json

**調査対象**: 商品「${product.title}」
現在の日付: ${today}

【最優先事項：調査の継続と完了】
レビューや情報が見つからなくても**絶対に調査を中断しないこと**。Amazon 403エラー時もGoogle検索で継続。
禁止: 「調査不能」報告、カテゴリ一般論、「〇〇市場の分析」のようなタイトル
必須: 商品仕様・機能からの推測分析、競合比較による立ち位置分析、JSON形式での出力

----

以下の観点で調査・分析を行ってください：

0. **商品概要と使い方**（サイト上部に表示する最重要情報）
   - **productName**: 正式な商品名（検索タグやSEOキーワードを除いた簡潔な名前）
     例：「Syncwire 3.5mm 4極オーディオ延長ケーブル 1.2m (2本セット)」
     ※ Amazonの商品タイトルには「【2本セット】【マイク対応】延長ケーブル ヘッドホン...」のような検索用タグが含まれることがありますが、ここでは「商品本来の名前」を記載してください
   - **productDescription**: この商品は何か、1-2文で簡潔に説明（例：「〇〇は、△△用の□□です。」）
   - **productUsage**: 主な使い方・用途を3-5項目で箇条書き
   - これはサイトの最上部に表示される情報なので、ユーザーが商品を理解しやすい説明にしてください

1. ユーザーレビュー分析（"Voice of the Customer"）
   ⇒ Amazon以外のレビューサイト（価格.com、みんなのレビュー等）も積極的に調査
   - 具体的な使用体験と満足ポイント（単なる機能列挙ではなく、体験として記述）
   - 問題点と改善要望
   - 使用シーン：どのような場面で活用されているか

2. ユーザーストーリーと実体験
   - 購入背景・生活変化・具体的エピソード（成功・失敗両方）
   - 出典明記: 実レビュー→出典記載 / 推測→experienceに「（推測）」明記
   - **userStoriesに実体験記載＆「レビュー不在」記載は矛盾 → 絶対禁止**

3. 競合商品との比較
   - 同カテゴリの主要競合商品3-5点
   - 価格、機能、品質の比較
   - 差別化ポイントの特定
   - **【必須】各競合商品のASINを必ず特定してください**（アフィリエイトリンク生成に使用）
   - **PA-APIのSearchItemsエンドポイントを使用して競合商品を検索し、ASINを取得してください**
   - ASINが見つからない場合は "asin": null と記載

4. 購買推奨度
   - どのようなユーザーに適しているか
   - 購入時の注意点
   - コストパフォーマンス評価
   - スコア算出（後述の基準に従うこと）

5. 情報ソース
   - 具体的サイト名・記事タイトル・URL（「Category Analysis」等の抽象名は禁止）
   - 例：「価格.com: [商品名] クチコミ」「The Verge Review」など

商品情報：
- ASIN: ${product.asin}
- 商品名: ${product.title}
${brandInfo}
${parentAsinInfo}
- カテゴリ: ${product.category}
- 価格: ${product.price.formatted}
- 仕様・詳細:
${Object.entries(product.specifications).map(([key, value]) => `  - ${key}: ${value}`).join('\n')}

【スコア算出の標準化ガイドライン】
総合評価スコア（0-100点）は、以下の「標準化ルーブリック」に厳格に従って算出してください。個人の感覚ではなく、定量的・論理的な計算過程を \`scoreRationale\` に明記することが必須です。

1. **基本点: 70点**
   - 全ての商品は70点（「期待通りで、標準的に満足できるレベル」）から計算を開始します。

2. **加減点カテゴリと配分幅**:
   - **性能・機能 (-10 〜 +10点)**: スペック、実用性、使い勝手
   - **コストパフォーマンス (-15 〜 +15点)**: 価格対性能、競合との価格差（最重視）
   - **品質・デザイン (-5 〜 +5点)**: ビルドクオリティ、質感、美しさ
   - **ユーザー満足度 (-10 〜 +10点)**: レビュー、信頼性、サポート体制
   - **独自の強み・先進性 (0 〜 +10点)**: 他にない革新的な機能、独自の価値

3. **\`scoreRationale\` の記述形式 (厳守)**:
   以下のフォーマットで、計算過程を一行ずつ記述してください。
   \`\`\`
   [基本点: 70]
   [加点: +XX] (理由を簡潔に記述)
   [減点: -XX] (理由を簡潔に記述)
   ...
   [合計: XX] (最終的なスコア)
   \`\`\`

- 素晴らしい商品には95点以上、重大な欠陥がある商品には厳しく低い点数をつけてください。
- 加減点がないカテゴリは省略して構いませんが、合計点は必ず一致させてください。

    調査結果は以下のJSON形式で構造化して提供してください。
    なお、ファイル名は "data/investigations/${product.asin}.json" としてください：
    \`\`\`json
{
  "analysis": {
    "productName": "正式な商品名（検索タグを除いた簡潔な名前）",
    "parentAsin": "${product.parentAsin || product.asin}",
    "productDescription": "この商品が何かを1-2文で簡潔に説明",
    "productUsage": ["使い方1", "使い方2", "使い方3"],
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
        "name": "具体的な記事タイトルまたはサイト名（例：The Verge Review）。抽象的な名称（Category Analysis等）は避けること。",
        "url": "https://...（可能な限り具体的なURLを記載。ない場合のみnull）",
        "credibility": "信頼性評価"
      }
    ],
    "lastInvestigated": "YYYY-MM-DD",
    "competitiveAnalysis": [
      {
        "name": "競合商品名",
        "asin": "B0XXXXXXXX または null（ASINが特定できる場合は必ず記載）",
        "priceComparison": "価格比較の説明",
        "featureComparison": ["機能比較1", "機能比較2"],
        "differentiators": ["差別化ポイント1", "差別化ポイント2"]
      }
    ],
    "recommendation": {
      "targetUsers": ["推奨ユーザー1", "推奨ユーザー2"],
      "pros": ["購入メリット1", "購入メリット2"],
      "cons": ["購入時の注意点1", "購入時の注意点2"],
      "score": 0,
      "scoreRationale": "ここになぜこのスコアにしたのか、加点・減点の理由を具体的に記述してください（例：機能は完璧だが価格が高すぎるため-10点、など）"
    }
  }
}
\`\`\`

**【technicalSpecs: 詳細スペック抽出】**
上記JSONの "recommendation" の後に "technicalSpecs" フィールドも追加してください。
商品カテゴリに応じて、以下のような詳細スペック情報を収集・構造化してください。
PA-APIの features テキストとWeb調査を組み合わせて情報を取得し、該当しない項目は null を設定してください。

出力例（スマートフォンの場合）:
\`\`\`json
"technicalSpecs": {
  "os": "Android 14",
  "cpu": "Snapdragon 8 Gen 3",
  "ram": "8GB",
  "storage": "256GB",
  "display": { "size": "6.7インチ", "resolution": "2796×1290", "type": "OLED" },
  "battery": { "capacity": "4600mAh", "charging": "25W急速充電" },
  "camera": { "main": "48MP", "ultrawide": "12MP" },
  "dimensions": { "height": "160.9mm", "width": "77.6mm", "depth": "8.25mm", "weight": "221g" },
  "connectivity": ["5G", "Wi-Fi 6E", "Bluetooth 5.3"],
  "other": ["防水IP68", "FeliCa"]
}
\`\`\`

カテゴリ別の収集項目:
- スマートフォン/タブレット: os, cpu, ram, storage, display, battery, camera, connectivity
- PC/ノートパソコン: cpu, ram, storage, display, battery, gpu
- イヤホン/ヘッドホン: driver, codec, battery, connectivity, noiseCancel
- 家電商品: dimensions, power, capacity, その他機能
`;

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