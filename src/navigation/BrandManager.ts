import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BrandCount } from './BrandCounter';

export interface BrandMatcher {
  type: string;
  value: string;
}

export interface BrandEntry {
  slug: string;
  icon?: string;
  description?: string;
  matcher?: BrandMatcher;
}

export type BrandGroups = Record<string, BrandEntry>;

export class BrandManager {
  private readonly configPath: string;
  private brandGroups: BrandGroups = {};

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  public load(): void {
    if (fs.existsSync(this.configPath)) {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      this.brandGroups = JSON.parse(raw) as BrandGroups;
    }
  }

  public save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, `${JSON.stringify(this.brandGroups, null, 2)}\n`, 'utf-8');
  }

  /**
   * 集計されたトップブランドを既存の定義にマージする
   */
  public mergeTopBrands(topBrands: BrandCount[]): void {
    const normalizedMap = this.createNormalizedMap();

    for (const brand of topBrands) {
      const normalizedName = BrandManager.normalizeBrandName(brand.name);
      const existingKey = this.findExistingKey(brand.name, normalizedName, normalizedMap);

      if (!existingKey) {
        this.registerBrand(brand.name, normalizedName, normalizedMap);
      }
    }
  }

  /**
   * 既存ブランドから正規化名マップを作成する
   */
  private createNormalizedMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const key of Object.keys(this.brandGroups)) {
      map.set(BrandManager.normalizeBrandName(key).toLowerCase(), key);

      const matcher = this.brandGroups[key]?.matcher;
      if (matcher?.value) {
        map.set(BrandManager.normalizeBrandName(matcher.value).toLowerCase(), key);
      }
    }
    return map;
  }

  /**
   * ブランド名が既存の定義に一致するか確認する
   */
  private findExistingKey(
    brandName: string,
    normalizedName: string,
    normalizedMap: Map<string, string>,
  ): string | null {
    const normalizedKey = normalizedName.toLowerCase();

    // 1. 正規化名マップから検索
    const directMatch = normalizedMap.get(normalizedKey);
    if (directMatch) return directMatch;

    // 2. 正規表現マッチャーとの照合
    return this.findKeyByRegex(brandName, normalizedName);
  }

  /**
   * 正規表現マッチャーを使用して既存ブランドキーを検索する
   */
  private findKeyByRegex(brandName: string, normalizedName: string): string | null {
    for (const [key, entry] of Object.entries(this.brandGroups)) {
      const matcher = entry.matcher;
      if ((matcher?.type === 'regex' || matcher?.type === 'brand') && matcher.value) {
        try {
          const regex = new RegExp(matcher.value, 'i');
          if (regex.test(brandName) || regex.test(normalizedName)) {
            return key;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn(`Invalid regex pattern for "${key}": ${message}`);
        }
      }
    }
    return null;
  }

  /**
   * 新しいブランドを登録する
   */
  private registerBrand(brandName: string, normalizedName: string, normalizedMap: Map<string, string>): void {
    const slug = this.generateUniqueSlug(this.generateSlug(normalizedName));

    this.brandGroups[normalizedName] = {
      slug,
      icon: '🏷️',
      description: `${normalizedName}の商品一覧`,
      matcher: {
        type: 'brand',
        value: brandName,
      },
    };

    // マップを更新して以降の重複を防ぐ
    normalizedMap.set(normalizedName.toLowerCase(), normalizedName);
  }

  /**
   * 重複しないスラッグを生成する
   */
  private generateUniqueSlug(baseSlug: string): string {
    let finalSlug = baseSlug;
    let counter = 1;
    const existingSlugs = new Set(Object.values(this.brandGroups).map((b) => b.slug));

    while (existingSlugs.has(finalSlug)) {
      finalSlug = `${baseSlug}-${counter++}`;
    }
    return finalSlug;
  }

  public static normalizeBrandName(name: string): string {
    // 括弧書き（例：Apple(アップル) -> Apple）を除去
    return name.replaceAll(/\s*[(（].*?[)）]\s*$/g, '').trim();
  }
  public getBrandGroups(): BrandGroups {
    return this.brandGroups;
  }

  /**
   * ブランド名からスラッグを生成する
   */
  private generateSlug(name: string): string {
    // 小文字化して記号をハイフンに
    return name
      .toLowerCase()
      .trim()
      .replaceAll(/[()（）]/g, '-') // カッコをハイフンに
      .replaceAll(/[^a-z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g, '-') // 英数字・ひらがな・カタカナ・漢字・ハイフン以外をハイフンに
      .replaceAll(/-+/g, '-') // 連続するハイフンを1つに
      .replaceAll(/^-|-$/g, ''); // 先頭と末尾のハイフンを削除
  }
}
