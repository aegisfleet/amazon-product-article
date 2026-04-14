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
    for (const brand of topBrands) {
      // すでに存在するかチェック（部分一致ではなく完全一致。既存は matcher で柔軟に対応しているはず）
      if (!this.brandGroups[brand.name]) {
        // 新規追加
        const slug = this.generateSlug(brand.name);
        
        // 既存の slug と重複しないようにチェック
        let finalSlug = slug;
        let counter = 1;
        const existingSlugs = new Set(Object.values(this.brandGroups).map(b => b.slug));
        while (existingSlugs.has(finalSlug)) {
          finalSlug = `${slug}-${counter++}`;
        }

        this.brandGroups[brand.name] = {
          slug: finalSlug,
          icon: '🏷️',
          description: `${brand.name}の商品一覧`,
          matcher: {
            type: 'brand',
            value: brand.name
          }
        };
      }
    }
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
