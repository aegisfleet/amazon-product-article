/**
 * Google Jules API types and interfaces
 *
 * 公式APIドキュメント: https://jules.google/docs/api/reference/
 *
 * ※ 迷ったら上記ドキュメントを参照してください
 */

import type { Product } from './Product';

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
  name: string; // e.g., "sources/github/owner/repo"
  id: string; // e.g., "github/owner/repo"
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
  source: string; // e.g., "sources/github/owner/repo"
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
  name: string; // e.g., "sessions/31415926535897932384"
  id: string; // e.g., "31415926535897932384"
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
  userType: string; // e.g., "Commuter", "Runner", "Parent"
  scenario: string;
  experience: string;
  sentiment: 'positive' | 'negative' | 'mixed';
}

export interface SourceReference {
  name: string;
  url?: string | null;
  tier?: 'high' | 'medium' | 'low';
  evidenceType?: 'primary' | 'secondary';
  publishedAt?: string;
  author?: string;
  conflictOfInterest?: 'none' | 'possible' | 'disclosed' | 'unknown';
  notes?: string;
}

/**
 * 詳細スペック情報（スマートフォン、PC、イヤホン等の技術仕様）
 */
export interface DisplaySpec {
  size?: string; // e.g., "6.7インチ"
  resolution?: string; // e.g., "2796×1290"
  type?: string; // e.g., "OLED", "液晶"
  refreshRate?: string; // e.g., "120Hz"
}

export interface BatterySpec {
  capacity?: string; // e.g., "4600mAh"
  charging?: string; // e.g., "25W急速充電対応"
  playbackTime?: string; // For earphones: e.g., "8時間"
}

export interface CameraSpec {
  main?: string; // e.g., "48MP"
  ultrawide?: string; // e.g., "12MP"
  telephoto?: string; // e.g., "12MP"
  front?: string; // e.g., "12MP"
}

export interface DimensionsSpec {
  height?: string;
  width?: string;
  depth?: string;
  weight?: string;
}

// 共通の型エイリアス（Lint警告対応）
type NullableString = string | null;
type StringOrArray = string | string[] | null;
type StringOrNumber = string | number | null;
type MaterialValue = string | { upper?: string; outsole?: string; insole?: string } | null;
type GeneralOutput = string | { [key: string]: string } | null;
type PortsInfo = string | string[] | { [key: string]: unknown } | null;
type LoadCapacityValue = string | { [key: string]: string } | null;

export interface TechnicalSpecs {
  // スマートフォン・タブレット・PC
  os?: NullableString; // e.g., "Android 14", "iOS 17"
  cpu?: NullableString; // e.g., "Snapdragon 8 Gen 3", "A17 Pro"
  gpu?: NullableString; // e.g., "NVIDIA RTX 4070"
  ram?: NullableString; // e.g., "8GB"
  storage?: NullableString; // e.g., "256GB"
  display?: DisplaySpec | null;
  battery?: BatterySpec | null;
  camera?: CameraSpec | null;
  dimensions?: DimensionsSpec | null;
  connectivity?: StringOrArray; // e.g., ["5G", "Wi-Fi 6E", "Bluetooth 5.3"]

  // イヤホン・ヘッドホン
  driver?: NullableString; // e.g., "10mm ダイナミック"
  codec?: StringOrArray; // e.g., ["SBC", "AAC", "LDAC"]
  noiseCancel?: NullableString; // e.g., "ANC対応"

  // 家電・その他
  power?: NullableString; // e.g., "1200W"
  capacity?: NullableString; // e.g., "3L"

  other?: StringOrArray; // e.g., ["防水IP68", "FeliCa", "eSIM対応"]

  // 靴（シューズ）
  width?: NullableString; // e.g., "2E", "4E"
  weight?: NullableString; // e.g., "270g"
  material?: MaterialValue;
  midsole?: NullableString;
  cushioningTech?: StringOrArray;
  heelCounter?: NullableString;
  modelNumber?: NullableString;
  model?: NullableString; // Alias for modelNumber
  category?: NullableString; // Category within specs

  // 素材の詳細（各名称のバリエーションに対応）
  upperMaterial?: NullableString;
  midsoleMaterial?: NullableString;
  outsoleMaterial?: NullableString;
  outerSole?: NullableString; // Alias for outsoleMaterial
  insoleMaterial?: NullableString;
  innerSole?: NullableString; // Alias for insoleMaterial
  insole?: NullableString;

  // その他
  countryOfOrigin?: NullableString;
  heelHeight?: NullableString;
  loadCapacity?: LoadCapacityValue; // e.g., "5kg" or { rack: "5kg", hook: "500g" }
  attachments?: StringOrArray; // e.g., "フック×2" or ["フック×2", "マグネット"]

  // 高頻度出現フィールド（動的調査結果より）
  features?: StringOrArray; // e.g., ["クルエルティフリー", "防水"]
  color?: NullableString; // e.g., "ブラック"
  productType?: NullableString; // e.g., "おしゃれ着用洗濯洗剤"
  output?: GeneralOutput; // 電源出力
  input?: GeneralOutput; // 電源入力
  cableLength?: NullableString; // e.g., "1.5m"
  packageContents?: StringOrArray; // 同梱物
  ports?: PortsInfo; // ポート情報
  certifications?: StringOrArray; // e.g., ["PSE", "MFi"]
  ingredients?: StringOrArray; // 成分
  compatibility?: StringOrArray; // 互換性情報
  compatibleDevices?: StringOrArray; // 対応機器
  compatibleModels?: StringOrArray; // 対応モデル

  // 書籍・メディア
  pages?: StringOrNumber;
  publicationDate?: NullableString;
  isbn?: NullableString;
  language?: NullableString;
  binding?: NullableString;
  genre?: NullableString;
  author?: NullableString;
  discCount?: StringOrNumber;
  trackList?: StringOrArray;
  regionCode?: NullableString;
  subtitles?: StringOrArray;

  // キッチン・家電・生活用品
  heatingMethod?: NullableString;
  temperature?: NullableString;
  heatResistance?: NullableString;
  coldResistance?: NullableString;
  compatibleHeatSources?: StringOrArray;
  innerPot?: NullableString;
  roastLevel?: NullableString;
  acidity?: NullableString;
  bitterness?: NullableString;
  beanOrigin?: NullableString;
  controls?: StringOrArray;
  duration?: NullableString;
  design?: NullableString;
  colorOptions?: StringOrArray;
  setContents?: StringOrArray;
  assembly_required?: string | boolean | null; // boolean | string のためそのまま

  // AV・音響機器
  polarPattern?: NullableString;
  sensitivity?: NullableString;
  bitDepth?: NullableString;
  sampleRate?: NullableString;
  microphoneType?: NullableString;
  snRatio?: NullableString;
  maxSPL?: NullableString;

  // PC・ネットワーク
  wifiStandard?: NullableString;
  frequencyBands?: StringOrArray;
  antennas?: StringOrNumber;
  processor?: NullableString;
  usbPorts?: StringOrArray;
  transferSpeed?: NullableString;
  connector?: NullableString;
  supportedDrives?: StringOrArray;

  // 食品・ヘルスケア
  dosageForm?: NullableString;
  guaranteedAnalysis?: NullableString;
  servingsPerContainer?: StringOrNumber;
  inactiveIngredients?: StringOrArray;
  contraindications?: StringOrArray;
  dailyDosage?: NullableString;
  flavor?: NullableString;

  // その他
  compatibleTireSizes?: NullableString;
  recommendedAge?: NullableString;
  uvProtection?: NullableString;

  // 未知のフィールドを許容（動的レンダリング対応）
  [key: string]: unknown;
}

export interface InvestigationResult {
  sessionId: string;
  product: Product;
  analysis: {
    productName?: string; // 正式な商品名（検索タグ等を除いた簡潔な名前）
    parentAsin?: string; // 親ASIN（バリエーション商品の識引用）
    positivePoints: string[];
    negativePoints: string[];
    useCases: string[];
    competitiveAnalysis: CompetitiveProduct[];
    userStories: UserStory[]; // New: Specific user stories
    userImpression: string; // New: Overall impression summary
    sources: SourceReference[]; // New: Information sources
    lastInvestigated?: string; // New: ISO Date string of last investigation
    productDescription?: string; // New: Brief product description (1-2 sentences)
    productUsage?: string[]; // New: Main usage/purpose (3-5 items)
    recommendation: {
      targetUsers: string[];
      pros: string[];
      cons: string[];
      score: number;
      scoreRationale?: string;
    };
    technicalSpecs?: TechnicalSpecs; // 詳細スペック情報（カテゴリ依存）
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

/**
 * Jules API Error Class
 * throwing an Error object is required by lint rules.
 */
export class JulesApiError extends Error implements JulesError {
  public readonly code: string;
  public readonly details?: unknown;
  public readonly retryable: boolean;

  constructor(julesError: JulesError, cause?: unknown) {
    super(julesError.message, { cause });
    this.name = 'JulesApiError';
    this.code = julesError.code;
    this.details = julesError.details;
    this.retryable = julesError.retryable;

    // Set the prototype explicitly for extending Error in TypeScript
    Object.setPrototypeOf(this, JulesApiError.prototype);
  }
}

export interface JulesApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: JulesError;
  requestId?: string;
}
