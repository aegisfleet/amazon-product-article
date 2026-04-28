/**
 * JulesCategoryOrganizer - Google Jules APIを使用したカテゴリ整理の実行
 *
 * 「その他」に分類されている（=categorygroups.jsonに未登録の）カテゴリを
 * 適切な親カテゴリに分類するためのJulesセッションを作成する
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import axios, { type AxiosInstance } from 'axios';
import type {
  JulesCredentials,
  JulesError,
  JulesSessionRequest,
  JulesSessionResponse,
  SourceContext,
} from '../types/JulesTypes';
import { Logger } from '../utils/Logger';

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1alpha';

/**
 * カテゴリグループの型定義
 */
interface CategoryGroup {
  name?: string; // 新形式用
  slug: string;
  categories?: string[]; // 旧形式用
  children?: string[]; // 新形式用
  visible?: boolean;
  priority?: number;
}

interface CategoryGroups {
  [parentCategory: string]: CategoryGroup;
}

interface StandardCategoryGroups {
  categoryGroups: CategoryGroup[];
}

/**
 * キャッシュエントリの型定義
 */
interface CacheEntry {
  data: {
    categoryInfo?: {
      main: string;
    };
  };
  status: string;
}

interface ProductCache {
  [asin: string]: CacheEntry;
}

/**
 * 整理結果のセッション情報
 */
export interface OrganizationSession {
  sessionId: string;
  sessionName: string;
  unregisteredCategories: string[];
  startedAt: Date;
}

export class JulesCategoryOrganizer {
  private readonly client: AxiosInstance;
  private readonly logger: Logger;
  private categoryGroupsCache: CategoryGroup[] | null = null;
  private productCacheCache: Set<string> | null = null;

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
        this.logger.info('Jules API Request (CategoryOrganizer)', {
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
          this.logger.error('Jules API Response Error (Non-Axios)', error);
        }
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  }

  /**
   * categorygroups.jsonを読み込む
   */
  async loadCategoryGroups(): Promise<CategoryGroup[]> {
    if (this.categoryGroupsCache) {
      return this.categoryGroupsCache;
    }

    const filePath = path.join(process.cwd(), 'data', 'categorygroups.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as CategoryGroups | StandardCategoryGroups | CategoryGroup[];

      let groups: CategoryGroup[] = [];
      if (Array.isArray(data)) {
        groups = data;
      } else if ('categoryGroups' in data && Array.isArray(data.categoryGroups)) {
        groups = data.categoryGroups;
      } else {
        // Legacy format: { "ParentName": { "slug": "...", "categories": [...] } }
        groups = Object.entries(data as CategoryGroups).map(([name, group]) => ({
          name,
          ...group,
        }));
      }
      this.categoryGroupsCache = groups;
    } catch (error) {
      this.logger.error('Failed to load category groups', error);
      throw error;
    }

    return this.categoryGroupsCache;
  }

  /**
   * categorygroups.jsonに登録されている全カテゴリを取得
   */
  async getRegisteredCategories(): Promise<Set<string>> {
    const groups = await this.loadCategoryGroups();
    const registered = new Set<string>();

    for (const group of groups) {
      const categories = group.children || group.categories || [];
      for (const category of categories) {
        registered.add(category);
      }
    }

    return registered;
  }

  /**
   * 商品キャッシュから全カテゴリを収集
   */
  async collectCategoriesFromCache(): Promise<Set<string>> {
    if (this.productCacheCache) {
      return this.productCacheCache;
    }

    const cachePath = path.join(process.cwd(), 'data', 'cache', 'paapi-product-cache.json');

    let content: string;
    try {
      content = await fs.readFile(cachePath, 'utf-8');
    } catch (error) {
      // Check for ENOENT (file not found)
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'ENOENT'
      ) {
        this.logger.warn('Product cache not found');
        this.productCacheCache = new Set<string>();
        return this.productCacheCache;
      }
      throw error;
    }

    const cache = JSON.parse(content) as ProductCache;
    const categories = new Set<string>();

    // Use for...in loop instead of Object.values to avoid creating a large intermediate array
    for (const key in cache) {
      const entry = cache[key];
      if (!entry) continue;

      const category = entry.data?.categoryInfo?.main;
      if (category && category !== 'その他' && category !== 'null') {
        categories.add(category);
      }
    }

    this.productCacheCache = categories;
    return categories;
  }

  /**
   * categorygroups.jsonに未登録のカテゴリを取得
   */
  async getUnregisteredCategories(): Promise<string[]> {
    const allCategories = await this.collectCategoriesFromCache();
    const registered = await this.getRegisteredCategories();

    const unregistered: string[] = [];
    for (const category of allCategories) {
      if (!registered.has(category)) {
        unregistered.push(category);
      }
    }

    // 日本語ロケールでソート
    return unregistered.sort((a, b) => a.localeCompare(b, 'ja'));
  }

  /**
   * カテゴリ整理用のプロンプトを生成
   */
  formatOrganizationPrompt(unregisteredCategories: string[]): string {
    // 未登録カテゴリ一覧
    const unregisteredList = unregisteredCategories.map((c) => `- ${c}`).join('\n');

    // JSTで現在の日付を取得
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    const today = `${year}-${month}-${day}`;

    return `【カテゴリ整理タスク】

あなたはプロフェッショナルな商品カテゴリ整理アシスタントです。
リポジトリ内の \`data/categorygroups.json\` を編集し、未登録のカテゴリを適切な親カテゴリに分類してください。

現在の日付: ${today}

---

## 🚨 最重要ルール (厳守)

1. **一時的なスクリプトの作成禁止**
    - Pythonスクリプト (\`.py\`) や Node.jsスクリプト (\`.js\`) を作成して作業を行わない。
    - すべての操作は標準的なファイル編集ツールと、指定されたコマンドのみで行う。

2. **\`npm run sort:categories\` の実行必須**
   - カテゴリの追加・移動を行った後は、必ずこのコマンドを最後に一度だけ実行する。
   - これ以外の方法（手動ソート、独自スクリプト、jq等）でソートを行わない。

3. **編集対象の限定**
   - \`data/categorygroups.json\` 以外のファイルは絶対に変更しない。

4. **自律性を伴う完遂の義務**
   - あなたには提示された全ての未登録カテゴリを分類し、タスクを完遂する責任がある。
   - 分類先が不明確な場合でも、類似カテゴリへの割り当てや「その他／全般」への分類を自律的に判断して行い、作業を中断しない。ユーザーへの確認を求めて停止することは厳禁である。

---

## 作業手順

1. **現状確認**
   - \`cat data/categorygroups.json\` で現在の内容を把握する。

2. **カテゴリの分類**
   - 以下の未登録カテゴリ（\${unregisteredCategories.length}件）を、\`data/categorygroups.json\` 内の適切な親カテゴリの \`children\` 配列（古い形式の場合は \`categories\` 配列）に追加する。
   - 適した親カテゴリがない場合は「その他／全般」に追加する。
   - 新しい親カテゴリは作成しない。

3.- **クロスチェック**: 重要な品質・比較優位の主張は、2系統以上の独立ソースで一致確認を行う。
---
     \`\`\`bash
     npm run sort:categories
     \`\`\`

---

## 整理対象の未登録カテゴリ

${unregisteredList}

---

## 分類時の判断基準

- カテゴリ名から商品の用途・特性を推測する。
- 既存の親カテゴリにある類似カテゴリを参考にする。
- 判断に迷う場合は、\`data/cache/paapi-product-cache.json\` を参照して商品情報（タイトル等）を確認できる。

---

## 完了の条件

- すべての未登録カテゴリが \`data/categorygroups.json\` に振り分けられている。
- \`npm run sort:categories\` が実行され、JSONが正規の順序でソートされている。
- 不要なファイルが作成されていない。
`;
  }

  /**
   * カテゴリ整理セッションを作成
   */
  async createSession(prompt: string, sourceContext: SourceContext): Promise<string> {
    try {
      const request: JulesSessionRequest = {
        prompt,
        sourceContext,
        title: `Category Organization: ${new Date().toISOString().split('T')[0]}`,
        automationMode: 'AUTO_CREATE_PR',
        requirePlanApproval: false,
      };

      const response = await this.client.post<JulesSessionResponse>('/sessions', request);

      const sessionId = response.data.id;
      this.logger.info('Jules category organization session created', {
        sessionId,
        name: response.data.name,
      });

      return sessionId;
    } catch (error) {
      const julesError = this.handleApiError(error);
      this.logger.error('Failed to create Jules session', julesError);
      throw new Error(`Jules session creation failed: ${julesError.message}`, { cause: error });
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
      throw new Error(`Failed to get session: ${julesError.message}`, { cause: error });
    }
  }

  /**
   * カテゴリ整理を開始（非同期）
   */
  async startOrganization(sourceContext: SourceContext): Promise<OrganizationSession> {
    const unregisteredCategories = await this.getUnregisteredCategories();

    if (unregisteredCategories.length === 0) {
      this.logger.info('No unregistered categories found');
      throw new Error('No unregistered categories to organize');
    }

    this.logger.info(`Found ${unregisteredCategories.length} unregistered categories`, {
      categories: unregisteredCategories.slice(0, 10), // Log first 10
    });

    const prompt = this.formatOrganizationPrompt(unregisteredCategories);
    const sessionId = await this.createSession(prompt, sourceContext);
    const session = await this.getSession(sessionId);

    return {
      sessionId,
      sessionName: session.name,
      unregisteredCategories,
      startedAt: new Date(),
    };
  }

  /**
   * APIエラーを処理
   */
  private handleApiError(error: unknown): JulesError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data: unknown = error.response?.data;

      if (status === 429) {
        return {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Jules API rate limit exceeded',
          details: data,
          retryable: true,
        };
      }

      if (status === 401 || status === 403) {
        return {
          code: 'AUTHENTICATION_ERROR',
          message: 'Jules API authentication failed. Check your API key.',
          details: data,
          retryable: false,
        };
      }

      if (status && status >= 500) {
        return {
          code: 'SERVER_ERROR',
          message: 'Jules API server error',
          details: data,
          retryable: true,
        };
      }

      return {
        code: 'HTTP_ERROR',
        message: `Jules API HTTP error: ${status}`,
        details: data,
        retryable: false,
      };
    }

    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: {
          name: error.name,
          message: error.message,
        },
        retryable: false,
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown Jules API error',
      details: String(error),
      retryable: false,
    };
  }
}
