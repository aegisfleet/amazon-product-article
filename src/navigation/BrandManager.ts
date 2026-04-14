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
    fs.writeFileSync(this.configPath, JSON.stringify(this.brandGroups, null, 2), 'utf-8');
  }

  /**
   * 集計されたトップブランドを既存の定義にマージする
   */
  public mergeTopBrands(topBrands: BrandCount[]): void {
    // 既存のブランドを正規化した名前でマップ化しておく (normalized -> original key)
    const normalizedExisting = new Map<string, string>();
    for (const key of Object.keys(this.brandGroups)) {
      normalizedExisting.set(BrandManager.normalizeBrandName(key).toLowerCase(), key);
      
      // matcher.value が設定されている場合はそれも考慮する
      const matcher = this.brandGroups[key]?.matcher;
      if (matcher) {
        if (matcher.value) {
          normalizedExisting.set(BrandManager.normalizeBrandName(matcher.value).toLowerCase(), key);
        }
        // regex の場合はテストして一致すればマップに追加
        if (matcher.type === 'regex' && matcher.value) {
          try {
            const regex = new RegExp(matcher.value, 'i');
            // この正規化マップ作成時に、将来現れる可能性がある名前をすべて網羅はできないが、
            // 少なくとも既存の matcher.value に含まれる単語は考慮できる。
          } catch (e) {
            // Invalid regex, skip
          }
        }
      }
    }

    for (const brand of topBrands) {
      const normalizedName = BrandManager.normalizeBrandName(brand.name);
      const normalizedKey = normalizedName.toLowerCase();

      // すでに存在するか正規化名でチェック
      let existingKey = normalizedExisting.get(normalizedKey);

      // さらに、全ての既存ブランドのマッチャー（特に regex）に対してチェック
      if (!existingKey) {
        for (const [key, entry] of Object.entries(this.brandGroups)) {
          const matcher = entry.matcher;
          if (matcher && matcher.type === 'regex' && matcher.value) {
            try {
              const regex = new RegExp(matcher.value, 'i');
              if (regex.test(brand.name) || regex.test(normalizedName)) {
                existingKey = key;
                break;
              }
            } catch (e) { /* skip invalid regex */ }
          }
        }
      }

      if (!existingKey) {
        // 新規追加（表示名はカッコを除去したものにする）
        const displayName = normalizedName;
        const slug = this.generateSlug(displayName);
        
        // 既存の slug と重複しないようにチェック
        let finalSlug = slug;
        let counter = 1;
        const existingSlugs = new Set(Object.values(this.brandGroups).map(b => b.slug));
        while (existingSlugs.has(finalSlug)) {
          finalSlug = `${slug}-${counter++}`;
        }

        this.brandGroups[displayName] = {
          slug: finalSlug,
          icon: '🏷️',
          description: `${displayName}の商品一覧`,
          matcher: {
            type: 'brand',
            value: brand.name // 元の名称（カッコあり含む）をマッチャーに設定
          }
        };

        // 追加したものを既知リストに加える
        normalizedExisting.set(normalizedKey, displayName);
      } else {
        // 既に存在するブランドページがある場合
        // 必要に応じて matcher を拡張するなどは将来の課題とするが、
        // 現状は既存の定義を優先してスキップする。
      }
    }
  }

  public static normalizeBrandName(name: string): string {
    // 括弧書き（例：Apple(アップル) -> Apple）を除去
    return name.replace(/\s*[\(（].*?[\)）]\s*$/g, '').trim();
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
