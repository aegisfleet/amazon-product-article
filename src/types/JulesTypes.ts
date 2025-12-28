/**
 * Google Jules API types and interfaces
 * 
 * 公式APIドキュメント: https://jules.google/docs/api/reference/
 * 
 * ※ 迷ったら上記ドキュメントを参照してください
 */

import { Product } from './Product';

/**
 * Jules API認証情報
 * APIキーのみで認証（X-Goog-Api-Key ヘッダーで渡す）
 */
export interface JulesCredentials {
  apiKey: string;
}

/**
 * GitHub リポジトリソース
 */
export interface JulesSource {
  name: string;        // e.g., "sources/github/owner/repo"
  id: string;          // e.g., "github/owner/repo"
  githubRepo: {
    owner: string;
    repo: string;
  };
}

/**
 * ソース一覧レスポンス
 */
export interface JulesSourcesResponse {
  sources: JulesSource[];
  nextPageToken?: string;
}

/**
 * GitHub リポジトリコンテキスト
 */
export interface GitHubRepoContext {
  startingBranch: string;
}

/**
 * ソースコンテキスト
 */
export interface SourceContext {
  source: string;  // e.g., "sources/github/owner/repo"
  githubRepoContext: GitHubRepoContext;
}

/**
 * 自動化モード
 */
export type AutomationMode = 'AUTOMATION_MODE_UNSPECIFIED' | 'AUTO_CREATE_PR' | 'AUTO_MERGE_PR';

/**
 * セッション作成リクエスト
 */
export interface JulesSessionRequest {
  prompt: string;
  sourceContext: SourceContext;
  title?: string;
  automationMode?: AutomationMode;
  requirePlanApproval?: boolean;
}

/**
 * プルリクエスト出力
 */
export interface PullRequestOutput {
  url: string;
  title: string;
  description: string;
}

/**
 * セッション出力
 */
export interface SessionOutput {
  pullRequest?: PullRequestOutput;
}

/**
 * セッションレスポンス
 */
export interface JulesSessionResponse {
  name: string;        // e.g., "sessions/31415926535897932384"
  id: string;          // e.g., "31415926535897932384"
  title: string;
  sourceContext: SourceContext;
  prompt: string;
  outputs?: SessionOutput[];
}

/**
 * セッション一覧レスポンス
 */
export interface JulesSessionsResponse {
  sessions: JulesSessionResponse[];
  nextPageToken?: string;
}

/**
 * アクティビティタイプ
 */
export type ActivityType = 'ACTIVITY_TYPE_UNSPECIFIED' | 'USER_MESSAGE' | 'AGENT_MESSAGE' | 'PLAN' | 'PROGRESS';

/**
 * セッションアクティビティ
 */
export interface SessionActivity {
  name: string;
  type: ActivityType;
  content?: string;
  createdTime?: string;
}

/**
 * アクティビティ一覧レスポンス
 */
export interface ActivitiesResponse {
  activities: SessionActivity[];
  nextPageToken?: string;
}

// --- 既存の型定義（商品調査用）---

export interface InvestigationContext {
  product: Product;
  focusAreas: string[];
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
  includeCompetitors: boolean;
}

export interface SessionStatus {
  sessionId: string;
  status: 'created' | 'processing' | 'completed' | 'failed' | 'timeout';
  progress?: number | undefined;
  currentStep?: string | undefined;
  estimatedTimeRemaining?: number | undefined;
  error?: string | undefined;
}

export interface CompetitiveProduct {
  name: string;
  asin?: string;
  priceComparison: string;
  featureComparison: string[];
  differentiators: string[];
}

export interface UserStory {
  userType: string;  // e.g., "Commuter", "Runner", "Parent"
  scenario: string;
  experience: string;
  sentiment: 'positive' | 'negative' | 'mixed';
}

export interface SourceReference {
  name: string;
  url?: string;
  credibility?: string;
}

export interface InvestigationResult {
  sessionId: string;
  product: Product;
  analysis: {
    positivePoints: string[];
    negativePoints: string[];
    useCases: string[];
    competitiveAnalysis: CompetitiveProduct[];
    userStories: UserStory[];      // New: Specific user stories
    userImpression: string;        // New: Overall impression summary
    sources: SourceReference[];    // New: Information sources
    lastInvestigated?: string;     // New: ISO Date string of last investigation
    recommendation: {
      targetUsers: string[];
      pros: string[];
      cons: string[];
      score: number;
    };
  };
  generatedAt: Date;
  rawResponse?: string;
}

export interface JulesError {
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
}

export interface JulesApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: JulesError;
  requestId?: string;
}