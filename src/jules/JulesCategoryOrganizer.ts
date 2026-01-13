/**
 * JulesCategoryOrganizer - Google Jules APIを使用したカテゴリ整理の実行
 *
 * 「その他」に分類されている（=categorygroups.jsonに未登録の）カテゴリを
 * 適切な親カテゴリに分類するためのJulesセッションを作成する
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
    JulesCredentials,
    JulesError,
    JulesSessionRequest,
    JulesSessionResponse,
    SourceContext
} from '../types/JulesTypes';
import { Logger } from '../utils/Logger';

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1alpha';

/**
 * カテゴリグループの型定義
 */
interface CategoryGroup {
    slug: string;
    categories: string[];
}

interface CategoryGroups {
    [parentCategory: string]: CategoryGroup;
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
                this.logger.info('Jules API Request (CategoryOrganizer)', {
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
     * categorygroups.jsonを読み込む
     */
    loadCategoryGroups(): CategoryGroups {
        const filePath = path.join(process.cwd(), 'data', 'categorygroups.json');
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as CategoryGroups;
    }

    /**
     * categorygroups.jsonに登録されている全カテゴリを取得
     */
    getRegisteredCategories(): Set<string> {
        const groups = this.loadCategoryGroups();
        const registered = new Set<string>();

        for (const group of Object.values(groups)) {
            for (const category of group.categories) {
                registered.add(category);
            }
        }

        return registered;
    }

    /**
     * 商品キャッシュから全カテゴリを収集
     */
    collectCategoriesFromCache(): Set<string> {
        const cachePath = path.join(process.cwd(), 'data', 'cache', 'paapi-product-cache.json');

        if (!fs.existsSync(cachePath)) {
            this.logger.warn('Product cache not found');
            return new Set<string>();
        }

        const content = fs.readFileSync(cachePath, 'utf-8');
        const cache = JSON.parse(content) as ProductCache;
        const categories = new Set<string>();

        for (const entry of Object.values(cache)) {
            const category = entry.data?.categoryInfo?.main;
            if (category && category !== 'その他' && category !== 'null') {
                categories.add(category);
            }
        }

        return categories;
    }

    /**
     * categorygroups.jsonに未登録のカテゴリを取得
     */
    getUnregisteredCategories(): string[] {
        const allCategories = this.collectCategoriesFromCache();
        const registered = this.getRegisteredCategories();

        const unregistered: string[] = [];
        for (const category of allCategories) {
            if (!registered.has(category)) {
                unregistered.push(category);
            }
        }

        // デフォルトのUnicode順でソート
        return unregistered.sort();
    }

    /**
     * カテゴリ整理用のプロンプトを生成
     */
    formatOrganizationPrompt(unregisteredCategories: string[]): string {
        // 未登録カテゴリ一覧
        const unregisteredList = unregisteredCategories.map(c => `- ${c}`).join('\n');

        // JSTで現在の日付を取得
        const formatter = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const parts = formatter.formatToParts(new Date());
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        const today = `${year}-${month}-${day}`;

        return `【カテゴリ整理タスク】

あなたはプロフェッショナルな商品カテゴリ整理アシスタントです。
リポジトリ内の \`data/categorygroups.json\` を編集し、未登録のカテゴリを適切な親カテゴリに分類してください。

現在の日付: ${today}

---

## 🚨 最重要ルール (厳守)

1. **一時的なスクリプトの作成禁止**
   - Pythonスクリプト (\`.py\`) や Node.jsスクリプト (\`.js\`) を作成して作業を行わないでください。
   - すべての操作は標準的なファイル編集ツールと、指定されたコマンドのみで行ってください。

2. **\`npm run sort:categories\` の実行必須**
   - カテゴリの追加・移動を行った後は、必ずこのコマンドを最後に一度だけ実行してください。
   - これ以外の方法（手動ソート、独自スクリプト、jq等）でソートを行わないでください。

3. **編集対象の限定**
   - \`data/categorygroups.json\` 以外のファイルは絶対に変更しないでください。

---

## 作業手順

1. **現状確認**
   - \`cat data/categorygroups.json\` で現在の内容を把握してください。

2. **カテゴリの分類**
   - 以下の未登録カテゴリ（${unregisteredCategories.length}件）を、\`data/categorygroups.json\` 内の適切な親カテゴリの \`categories\` 配列に追加してください。
   - 適した親カテゴリがない場合は「その他」に追加してください。
   - 新しい親カテゴリは作成しないでください。

3. **ソートの実行**
   - 編集が完了したら、以下のコマンドを実行して終了してください：
     \`\`\`bash
     npm run sort:categories
     \`\`\`

---

## 整理対象の未登録カテゴリ

${unregisteredList}

---

## 分類時の判断基準

- カテゴリ名から商品の用途・特性を推測してください。
- 既存の親カテゴリにある類似カテゴリを参考にしてください。
- 判断に迷う場合は、\`data/cache/paapi-product-cache.json\` を参照して商品情報（タイトル等）を確認可能です。

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
                requirePlanApproval: false
            };

            const response = await this.client.post<JulesSessionResponse>(
                '/sessions',
                request
            );

            const sessionId = response.data.id;
            this.logger.info('Jules category organization session created', {
                sessionId,
                name: response.data.name
            });

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
     * カテゴリ整理を開始（非同期）
     */
    async startOrganization(sourceContext: SourceContext): Promise<OrganizationSession> {
        const unregisteredCategories = this.getUnregisteredCategories();

        if (unregisteredCategories.length === 0) {
            this.logger.info('No unregistered categories found');
            throw new Error('No unregistered categories to organize');
        }

        this.logger.info(`Found ${unregisteredCategories.length} unregistered categories`, {
            categories: unregisteredCategories.slice(0, 10) // Log first 10
        });

        const prompt = this.formatOrganizationPrompt(unregisteredCategories);
        const sessionId = await this.createSession(prompt, sourceContext);
        const session = await this.getSession(sessionId);

        return {
            sessionId,
            sessionName: session.name,
            unregisteredCategories,
            startedAt: new Date()
        };
    }

    /**
     * APIエラーを処理
     */
    private handleApiError(error: unknown): JulesError {
        if (error instanceof AxiosError) {
            const status = error.response?.status;
            const data = error.response?.data;

            if (status === 429) {
                return {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Jules API rate limit exceeded',
                    details: data,
                    retryable: true
                };
            }

            if (status === 401 || status === 403) {
                return {
                    code: 'AUTHENTICATION_ERROR',
                    message: 'Jules API authentication failed. Check your API key.',
                    details: data,
                    retryable: false
                };
            }

            if (status && status >= 500) {
                return {
                    code: 'SERVER_ERROR',
                    message: 'Jules API server error',
                    details: data,
                    retryable: true
                };
            }

            return {
                code: 'HTTP_ERROR',
                message: `Jules API HTTP error: ${status}`,
                details: data,
                retryable: false
            };
        }

        if (error instanceof Error) {
            return {
                code: 'UNKNOWN_ERROR',
                message: error.message,
                details: error,
                retryable: false
            };
        }

        return {
            code: 'UNKNOWN_ERROR',
            message: 'Unknown Jules API error',
            details: error,
            retryable: false
        };
    }
}
