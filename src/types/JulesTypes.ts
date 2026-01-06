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

/**
 * 詳細スペック情報（スマートフォン、PC、イヤホン等の技術仕様）
 */
export interface DisplaySpec {
  size?: string;          // e.g., "6.7インチ"
  resolution?: string;    // e.g., "2796×1290"
  type?: string;          // e.g., "OLED", "液晶"
  refreshRate?: string;   // e.g., "120Hz"
}

export interface BatterySpec {
  capacity?: string;      // e.g., "4600mAh"
  charging?: string;      // e.g., "25W急速充電対応"
  playbackTime?: string;  // For earphones: e.g., "8時間"
}

export interface CameraSpec {
  main?: string;          // e.g., "48MP"
  ultrawide?: string;     // e.g., "12MP"
  telephoto?: string;     // e.g., "12MP"
  front?: string;         // e.g., "12MP"
}

export interface DimensionsSpec {
  height?: string;
  width?: string;
  depth?: string;
  weight?: string;
}

export interface TechnicalSpecs {
  // スマートフォン・タブレット・PC
  os?: string | null;                  // e.g., "Android 14", "iOS 17"
  cpu?: string | null;                 // e.g., "Snapdragon 8 Gen 3", "A17 Pro"
  gpu?: string | null;                 // e.g., "NVIDIA RTX 4070"
  ram?: string | null;                 // e.g., "8GB"
  storage?: string | null;             // e.g., "256GB"
  display?: DisplaySpec | null;
  battery?: BatterySpec | null;
  camera?: CameraSpec | null;
  dimensions?: DimensionsSpec | null;
  connectivity?: string[] | null;      // e.g., ["5G", "Wi-Fi 6E", "Bluetooth 5.3"]

  // イヤホン・ヘッドホン
  driver?: string | null;              // e.g., "10mm ダイナミック"
  codec?: string[] | null;             // e.g., ["SBC", "AAC", "LDAC"]
  noiseCancel?: string | null;         // e.g., "ANC対応"

  // 家電・その他
  power?: string | null;               // e.g., "1200W"
  capacity?: string | null;            // e.g., "3L"

  other?: string[] | null;             // e.g., ["防水IP68", "FeliCa", "eSIM対応"]

  // 靴（シューズ）
  width?: string | null;               // e.g., "2E", "4E"
  weight?: string | null;              // e.g., "270g"
  material?: string | {
    upper?: string;
    outsole?: string;
    insole?: string;
  } | null;
  midsole?: string | null;
  cushioningTech?: string[] | null;
  heelCounter?: string | null;
  modelNumber?: string | null;
  model?: string | null;               // Alias for modelNumber
  category?: string | null;            // Category within specs

  // 素材の詳細（各名称のバリエーションに対応）
  upperMaterial?: string | null;
  midsoleMaterial?: string | null;
  outsoleMaterial?: string | null;
  outerSole?: string | null;           // Alias for outsoleMaterial
  insoleMaterial?: string | null;
  innerSole?: string | null;           // Alias for insoleMaterial
  insole?: string | null;

  // その他
  countryOfOrigin?: string | null;
  heelHeight?: string | null;
  loadCapacity?: string | { [key: string]: string } | null; // e.g., "5kg" or { rack: "5kg", hook: "500g" }
  attachments?: string | string[] | null;                    // e.g., "フック×2" or ["フック×2", "マグネット"]

  // 高頻度出現フィールド（動的調査結果より）
  features?: string[] | null;            // e.g., ["クルエルティフリー", "防水"]
  color?: string | null;                 // e.g., "ブラック"
  productType?: string | null;           // e.g., "おしゃれ着用洗濯洗剤"
  output?: string | { [key: string]: string } | null;   // 電源出力
  input?: string | { [key: string]: string } | null;    // 電源入力
  cableLength?: string | null;           // e.g., "1.5m"
  packageContents?: string | string[] | null;  // 同梱物
  ports?: string | string[] | { [key: string]: unknown } | null;  // ポート情報
  certifications?: string[] | null;      // e.g., ["PSE", "MFi"]
  ingredients?: string | string[] | null;  // 成分
  compatibility?: string | string[] | null;  // 互換性情報
  compatibleDevices?: string | string[] | null;  // 対応機器
  compatibleModels?: string | string[] | null;   // 対応モデル

  // 未知のフィールドを許容（動的レンダリング対応）
  [key: string]: unknown;
}

export interface InvestigationResult {
  sessionId: string;
  product: Product;
  analysis: {
    productName?: string;           // 正式な製品名（検索タグ等を除いた簡潔な名前）
    parentAsin?: string;           // 親ASIN（バリエーション商品の識引用）
    positivePoints: string[];
    negativePoints: string[];
    useCases: string[];
    competitiveAnalysis: CompetitiveProduct[];
    userStories: UserStory[];      // New: Specific user stories
    userImpression: string;        // New: Overall impression summary
    sources: SourceReference[];    // New: Information sources
    lastInvestigated?: string;     // New: ISO Date string of last investigation
    productDescription?: string;   // New: Brief product description (1-2 sentences)
    productUsage?: string[];       // New: Main usage/purpose (3-5 items)
    recommendation: {
      targetUsers: string[];
      pros: string[];
      cons: string[];
      score: number;
      scoreRationale?: string;
    };
    technicalSpecs?: TechnicalSpecs;  // 詳細スペック情報（カテゴリ依存）
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