import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProductCounter } from './ProductCounter';
import { CategoryGroup, EnhancedCategoryGroup } from './types';

export class CategoryManager {
    private readonly categoryGroupsPath: string;
    private readonly categoryGroups: CategoryGroup[];
    private enhancedCategoryGroups: EnhancedCategoryGroup[];

    constructor(categoryGroupsPath: string) {
        this.categoryGroupsPath = categoryGroupsPath;
        this.categoryGroups = [];
        this.enhancedCategoryGroups = [];
    }

    public addCategoryGroup(group: CategoryGroup): void {
        this.categoryGroups.push(group);
    }

    public getCategoryGroups(): CategoryGroup[] {
        return this.categoryGroups;
    }

    public loadCategoryGroups(): void {
        if (!fs.existsSync(this.categoryGroupsPath)) {
            return;
        }

        const fileContent = fs.readFileSync(this.categoryGroupsPath, 'utf-8');
        let data: unknown;
        try {
            data = JSON.parse(fileContent);
        } catch (e: unknown) {
            throw new Error(`Invalid JSON format in ${this.categoryGroupsPath}`, { cause: e });
        }

        const seenNames = new Set<string>();
        const seenSlugs = new Set<string>();

        if (data && typeof data === 'object') {
            if ('categoryGroups' in data && Array.isArray(data.categoryGroups)) {
                this.parseStandardFormat(data.categoryGroups, seenNames, seenSlugs);
            } else {
                this.parseLegacyFormat(data as Record<string, unknown>, seenNames, seenSlugs);
            }
        }
    }

    private addGroup(group: unknown, seenNames: Set<string>, seenSlugs: Set<string>): void {
        if (typeof group !== 'object' || group === null) {
            throw new Error('Invalid category group: not an object');
        }

        const g = group as Record<string, unknown>;

        if (typeof g.name !== 'string') {
            throw new TypeError(`Missing required field: name in category ${typeof g.slug === 'string' ? g.slug : 'unknown'}`);
        }
        if (typeof g.slug !== 'string') {
            throw new TypeError(`Missing required field: slug in category ${g.name}`);
        }
        if (!Array.isArray(g.children) || !g.children.every(child => typeof child === 'string')) {
            throw new TypeError(`Missing required field: children (string array) in category ${g.name}`);
        }

        if (seenNames.has(g.name)) throw new Error(`Duplicate category name: ${g.name}`);
        if (seenSlugs.has(g.slug)) throw new Error(`Duplicate category slug: ${g.slug}`);

        seenNames.add(g.name);
        seenSlugs.add(g.slug);

        this.categoryGroups.push(g as unknown as CategoryGroup);
    }

    private parseStandardFormat(groups: unknown[], seenNames: Set<string>, seenSlugs: Set<string>): void {
        for (const group of groups) {
            this.addGroup(group, seenNames, seenSlugs);
        }
    }

    private parseLegacyFormat(data: Record<string, unknown>, seenNames: Set<string>, seenSlugs: Set<string>): void {
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'object' && value !== null) {
                const legacyGroup = value as Record<string, unknown>;
                if (typeof legacyGroup.slug === 'string' && Array.isArray(legacyGroup.categories)) {
                    this.addGroup({
                        name: key,
                        slug: legacyGroup.slug,
                        children: legacyGroup.categories
                    }, seenNames, seenSlugs);
                }
            }
        }
    }

    public enhanceCategoryGroups(productCounter: ProductCounter): EnhancedCategoryGroup[] {
        // Clear previous results to ensure idempotency
        this.enhancedCategoryGroups = [];
        this.enhancedCategoryGroups = this.categoryGroups.map(group => {
            const allProductIds = new Set<string>();

            const childrenWithCounts = group.children.map(childName => {
                const ids = productCounter.getProductIds(childName);
                ids.forEach((id) => { allProductIds.add(id); });
                return {
                    name: childName,
                    productCount: ids.size
                };
            });

            const parentIds = productCounter.getProductIds(group.name);
            parentIds.forEach((id) => { allProductIds.add(id); });

            const totalProductCount = allProductIds.size;

            const visible = group.visible ?? true;
            const isVisible = visible && totalProductCount > 0;
            const priority = group.priority ?? 999;
            const enhancedGroup: EnhancedCategoryGroup = {
                name: group.name,
                slug: group.slug,
                visible,
                priority,
                children: group.children,
                productCount: totalProductCount,
                childrenWithCounts,
                isVisible
            };

            if (group.description !== undefined) {
                enhancedGroup.description = group.description;
            }

            return enhancedGroup;
        });

        return this.enhancedCategoryGroups;
    }

    public exportToJSON(outputPath: string): void {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify({ categoryGroups: this.enhancedCategoryGroups }, null, 2));
    }

    public exportToYAML(outputPath: string): void {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const yamlData = {
            parents: {} as Record<string, {
                name: string;
                slug: string;
                description?: string;
                productCount: number;
                isVisible: boolean;
                childrenWithCounts: { name: string; productCount: number; }[];
            }>
        };
        for (const group of this.enhancedCategoryGroups) {
            yamlData.parents[group.name] = {
                name: group.name,
                slug: group.slug,
                ...((group.description !== undefined) && { description: group.description }),
                productCount: group.productCount,
                isVisible: group.isVisible,
                childrenWithCounts: group.childrenWithCounts
            };
        }

        fs.writeFileSync(outputPath, yaml.dump(yamlData));
    }

    /**
     * EnhancedCategoryGroup の情報に基づいて content/parent-category/*.md を同期（生成・削除）する
     */
    public syncParentCategoryMarkdown(parentCategoryDir: string): void {
        if (!fs.existsSync(parentCategoryDir)) {
            fs.mkdirSync(parentCategoryDir, { recursive: true });
        }

        const activeSlugs = new Set<string>();

        for (const group of this.enhancedCategoryGroups) {
            // 表示非表示にかかわらず、カテゴリとして存在するならファイルは作成しておく
            // (Hugoのナビゲーションやパス解決のために、定義されたカテゴリは実体を持つべき)
            const fileName = `${group.slug}.md`;
            activeSlugs.add(fileName);

            const filePath = path.join(parentCategoryDir, fileName);
            const frontMatter = {
                title: group.name,
                description: group.description || `${group.name}カテゴリの商品一覧`,
                layout: "parent-category",
                parent_category: group.name
            };

            const content = `---\n${yaml.dump(frontMatter)}---\n`;

            // 内容が変わっている場合のみ書き込む（または常に書き込んでも良いが、Hugoの検知を考慮）
            let shouldWrite = true;
            if (fs.existsSync(filePath)) {
                const existing = fs.readFileSync(filePath, 'utf-8');
                if (existing === content) {
                    shouldWrite = false;
                }
            }

            if (shouldWrite) {
                fs.writeFileSync(filePath, content);
                console.log(`Generated: ${filePath}`);
            }
        }

        // 不要なファイルの削除
        const files = fs.readdirSync(parentCategoryDir);
        for (const file of files) {
            if (file.endsWith('.md') && !activeSlugs.has(file)) {
                const surplusPath = path.join(parentCategoryDir, file);
                fs.unlinkSync(surplusPath);
                console.log(`Deleted surplus category file: ${surplusPath}`);
            }
        }
    }
}
