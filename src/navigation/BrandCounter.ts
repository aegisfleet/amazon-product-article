import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import * as yaml from 'js-yaml';

import { BrandManager } from './BrandManager';

export interface BrandCount {
  name: string;
  count: number;
}

export class BrandCounter {
  private readonly contentPath: string;
  private readonly threshold: number;
  private readonly blocklist: Set<string>;
  private brandManager?: BrandManager;

  constructor(contentPath: string, threshold = 10, brandGroupsPath?: string) {
    this.contentPath = contentPath;
    this.threshold = threshold;
    this.blocklist = new Set(['ノーブランド品', 'Generic', 'Generic Brand']);

    if (brandGroupsPath && fs.existsSync(brandGroupsPath)) {
      this.brandManager = new BrandManager(brandGroupsPath);
      this.brandManager.load();
    }
  }

  /**
   * content/articles をスキャンして、条件を満たすブランドをリストアップする
   */
  public getTopBrands(): BrandCount[] {
    const brandCounts = new Map<string, number>();

    if (!fs.existsSync(this.contentPath)) {
      return [];
    }

    this.scanDirectory(this.contentPath, brandCounts);

    return Array.from(brandCounts.entries())
      .filter(([name, count]) => count >= this.threshold && !this.blocklist.has(name))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private scanDirectory(dir: string, brandCounts: Map<string, number>): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.lstatSync(filePath);

      if (stat.isDirectory()) {
        this.scanDirectory(filePath, brandCounts);
      } else if (stat.isFile() && file.endsWith('.md')) {
        const brand = this.extractBrand(filePath);
        if (brand) {
          brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
        }
      }
    }
  }

  private extractBrand(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(content, {
        engines: {
          yaml: {
            parse: (str: string) => yaml.load(str) as Record<string, unknown>,
            stringify: (obj: unknown) => yaml.dump(obj),
          },
        },
      });

      const rawBrand = typeof data.brand === 'string' ? data.brand : null;
      const rawManufacturer = typeof data.manufacturer === 'string' ? data.manufacturer : null;

      const brandCandidate = rawBrand || rawManufacturer;

      if (!brandCandidate) return null;

      const normalizedCandidate = BrandCounter.normalizeBrandName(brandCandidate);

      if (this.brandManager) {
        const matchedKey = this.brandManager.matchBrandKey(
          rawBrand,
          rawManufacturer,
          typeof data.title === 'string' ? data.title : undefined,
        );
        if (matchedKey) {
          return matchedKey;
        }
      }

      return normalizedCandidate;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to extract brand from ${filePath}: ${message}`);
    }
    return null;
  }

  public static normalizeBrandName(name: string): string {
    // 括弧書き（例：Apple(アップル) -> Apple）を除去
    return name.replaceAll(/\s*[(（].*?[)）]\s*$/g, '').trim();
  }
}
