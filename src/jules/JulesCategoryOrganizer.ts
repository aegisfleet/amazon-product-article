/**
 * JulesCategoryOrganizer - カテゴリ整理対象抽出およびプロンプト生成
 *
 * 「その他／全般」に分類されている（=categorygroups.jsonに未登録の）カテゴリを
 * 適切な親カテゴリに分類するためのプロンプトを生成する
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Logger } from '../utils/Logger';

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

export class JulesCategoryOrganizer {
  private readonly logger: Logger;
  private categoryGroupsCache: CategoryGroup[] | null = null;
  private productCacheCache: Set<string> | null = null;

  constructor() {
    this.logger = Logger.getInstance();
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
   * カテゴリが有効な分類対象であるかを判定
   */
  private isValidCategory(category?: string | null): category is string {
    return Boolean(category && category !== 'その他／全般' && category !== 'null');
  }

  /**
   * キャッシュオブジェクトから有効なカテゴリを抽出してSetに追加
   */
  private extractCategories(data: ProductCache, target: Set<string>): void {
    for (const key of Object.keys(data)) {
      const entry = data[key];
      const category = entry?.data?.categoryInfo?.main;
      if (this.isValidCategory(category)) {
        target.add(category);
      }
    }
  }

  /**
   * 単一のシャードファイルを読み込んでカテゴリを抽出
   */
  private async loadShardCategories(filePath: string, categories: Set<string>): Promise<void> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as ProductCache;
      this.extractCategories(parsed, categories);
    } catch {
      // 破損したシャードはスキップ
    }
  }

  /**
   * シャード分割されたキャッシュ群から全カテゴリを収集
   */
  private async loadCategoriesFromShards(shardsDir: string): Promise<Set<string> | null> {
    try {
      const files = await fs.readdir(shardsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      if (jsonFiles.length === 0) {
        return null;
      }

      const categories = new Set<string>();
      await Promise.all(jsonFiles.map((file) => this.loadShardCategories(path.join(shardsDir, file), categories)));
      return categories;
    } catch {
      // shardsDirが存在しないか読み取り失敗時はフォールバックのためnullを返す
      return null;
    }
  }

  /**
   * エラーがENOENT（ファイル未検出）であるかを判定
   */
  private isFileNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ENOENT'
    );
  }

  /**
   * レガシーの単一キャッシュファイルから全カテゴリを収集
   */
  private async loadCategoriesFromLegacy(legacyPath: string): Promise<Set<string>> {
    let content: string;
    try {
      content = await fs.readFile(legacyPath, 'utf-8');
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        this.logger.warn('Product cache not found');
        return new Set<string>();
      }
      throw error;
    }

    const cache = JSON.parse(content) as ProductCache;
    const categories = new Set<string>();
    this.extractCategories(cache, categories);
    return categories;
  }

  /**
   * 商品キャッシュから全カテゴリを収集
   */
  async collectCategoriesFromCache(): Promise<Set<string>> {
    if (this.productCacheCache) {
      return this.productCacheCache;
    }

    const cacheDir = path.join(process.cwd(), 'data', 'cache');
    const shardsDir = path.join(cacheDir, 'paapi');
    const legacyPath = path.join(cacheDir, 'paapi-product-cache.json');

    const shardCategories = await this.loadCategoriesFromShards(shardsDir);
    const categories = shardCategories ?? (await this.loadCategoriesFromLegacy(legacyPath));

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

2. **編集対象の限定**
   - \`data/categorygroups.json\` 以外のファイルは絶対に変更しない。

3. **自律性を伴う完遂の義務・アドバイス/確認要求の完全禁止 (最重要)**
   - あなたには提示された全ての未登録カテゴリを分類し、タスクを完遂する責任がある。
   - システムは完全自動・非同期バッチで実行されており、ユーザー（人間）からの回答や指示は一切得られない。
   - 「このまま進めてよろしいでしょうか？」「指示をお願いします」といった**ユーザーへの確認・アドバイス要求・待機は厳禁**である。
   - 分類先が不明確な場合でも、類似カテゴリへの割り当てや「その他／全般」への分類を自律的に判断して行い、作業を中断しないこと。

4. **セルフ検証による自己完結**
   - 「コードレビュー」や「事前検証（Pre-commit steps）」とは、人間へのレビュー依頼ではなく**あなた自身によるセルフ検証（git diff の確認・構文チェック）**を意味する。
   - セルフ検証が完了したら、人間に確認を求めず直ちにセッションを終了すること。

---

## 作業手順

1. **現状確認**
   - \`cat data/categorygroups.json\` で現在の内容を把握する。

2. **カテゴリの分類**
   - 以下の未登録カテゴリ（${unregisteredCategories.length}件）を、\`data/categorygroups.json\` 内の適切な親カテゴリの \`children\` 配列（古い形式の場合は \`categories\` 配列）に追加する。
   - 適した親カテゴリがない場合は「その他／全般」に追加する。
   - 新しい親カテゴリは作成しない。

3. **セルフ検証と完了**
   - \`jq empty data/categorygroups.json\` でJSON構文が正しいことを確認する。
   - \`git diff data/categorygroups.json\` で意図した差分のみが含まれていることをセルフチェックする。
   - 不要なファイルが作成されていないことを確認し、自律的に完遂する。

---

## 整理対象の未登録カテゴリ

${unregisteredList}

---

## 分類時の判断基準・フォールバック

- カテゴリ名から商品の用途・特性を推測する。
- 既存の親カテゴリにある類似カテゴリを参考にする。
- それでも判断が難しい場合は、作業を止めずに「その他／全般」に分類すること。

---

## 完了の条件

- すべての未登録カテゴリが \`data/categorygroups.json\` に振り分けられている。
- JSON構文が正しく保存されている（ソートとフォーマット整形は後続スクリプトでも自動実行される）。
- 不要なファイルが作成されていない。
- ユーザーへの確認待機をせず、自律的に作業を完了している。
`;
  }
}
