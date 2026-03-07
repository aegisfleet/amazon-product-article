import matter from 'gray-matter';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class ProductCounter {
    private readonly contentPath: string;
    private readonly categoryCountMap: Map<string, number>;

    constructor(contentPath: string) {
        this.contentPath = contentPath;
        this.categoryCountMap = new Map<string, number>();
    }

    public countProductsByCategory(): Map<string, number> {
        this.categoryCountMap.clear();

        if (!fs.existsSync(this.contentPath)) {
            return this.categoryCountMap;
        }

        this.scanDirectory(this.contentPath);
        return this.categoryCountMap;
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
                    const currentCount = this.categoryCountMap.get(category) || 0;
                    this.categoryCountMap.set(category, currentCount + 1);
                }
            }
        }
    }

    public getProductCount(category: string): number {
        return this.categoryCountMap.get(category.trim()) || 0;
    }

    private extractCategories(filePath: string): string[] {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const parsed = matter(fileContent);

            if (parsed.data && Array.isArray(parsed.data.categories)) {
                const normalizedCategories = parsed.data.categories
                    .map((c: any) => String(c).trim())
                    .filter((s: string) => s.length > 0);
                return Array.from(new Set(normalizedCategories));
            }
        } catch (e: any) {
            console.warn(`Failed to parse frontmatter for ${filePath}: ${e?.message ?? 'parse error'}`);
        }
        return [];
    }
}
