import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from '@11ty/gray-matter';
import * as yaml from 'js-yaml';

export class ProductCounter {
  private readonly contentPath: string;
  private readonly categoryProductMap: Map<string, Set<string>>;

  constructor(contentPath: string) {
    this.contentPath = contentPath;
    this.categoryProductMap = new Map<string, Set<string>>();
  }

  public countProductsByCategory(): Map<string, number> {
    this.categoryProductMap.clear();

    if (!fs.existsSync(this.contentPath)) {
      return new Map();
    }

    this.scanDirectory(this.contentPath);

    // Return a count map for compatibility if needed
    const result = new Map<string, number>();
    for (const [category, products] of this.categoryProductMap.entries()) {
      result.set(category, products.size);
    }
    return result;
  }

  private scanDirectory(dir: string): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.lstatSync(filePath);

      if (stat.isDirectory()) {
        this.scanDirectory(filePath);
      } else if (stat.isFile() && file.endsWith('.md')) {
        const categories = this.extractCategories(filePath);
        for (const category of categories) {
          if (!this.categoryProductMap.has(category)) {
            this.categoryProductMap.set(category, new Set());
          }
          this.categoryProductMap.get(category)!.add(filePath);
        }
      }
    }
  }

  public getProductCount(category: string): number {
    return this.getProductIds(category).size;
  }

  public getProductIds(category: string): Set<string> {
    const normalized = ProductCounter.normalizeCategory(category);
    const direct = this.categoryProductMap.get(normalized);
    if (direct && direct.size > 0) {
      return direct;
    }
    // Case-insensitive fallback
    const lower = normalized.toLowerCase();
    for (const [cat, ids] of this.categoryProductMap.entries()) {
      if (cat.toLowerCase() === lower) {
        return ids;
      }
    }
    return new Set();
  }

  private static normalizeCategory(category: string): string {
    return category.trim().replaceAll(/\s+/g, ' ');
  }

  private extractCategories(filePath: string): string[] {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = matter(fileContent, {
        engines: {
          yaml: {
            parse: (str: string) => yaml.load(str) as Record<string, unknown>,
            stringify: (obj: unknown) => yaml.dump(obj),
          },
        },
      });

      if (parsed.data && Array.isArray(parsed.data.categories)) {
        const normalizedCategories = parsed.data.categories
          .map((c: unknown) => ProductCounter.normalizeCategory(String(c)))
          .filter((s: string) => s.length > 0);
        return Array.from(new Set(normalizedCategories));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to parse frontmatter for ${filePath}: ${message}`);
    }
    return [];
  }
}
