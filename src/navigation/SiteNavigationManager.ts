/**
 * Site_Navigation_Manager - サイトナビゲーションとフィルタリング機能の管理
 */

import { ArticleMetadata } from '../article/ArticleGenerator';
import {
    Breadcrumb,
    Category,
    CategoryFilter,
    CategoryIndex,
    FilterInterface,
    FilterParams,
    FilterResult,
    KeywordFilter,
    ManufacturerFilter,
    NavigationMenuItem,
    PriceRangeFilter,
    RatingFilter
} from '../types/NavigationTypes';
import { Logger } from '../utils/Logger';

export class SiteNavigationManager {
    private logger: Logger;
    private categoryIndex: CategoryIndex;
    private articles: ArticleMetadata[];

    constructor() {
        this.logger = Logger.getInstance();
        this.articles = [];
        this.categoryIndex = {
            categories: [],
            totalArticles: 0,
            lastUpdated: new Date(),
            featuredArticles: []
        };
    }

    /**
     * カテゴリインデックスを生成
     */
    generateCategoryIndex(articles: ArticleMetadata[]): CategoryIndex {
        this.logger.info(`Generating category index from ${articles.length} articles`);

        this.articles = articles;
        const categoryMap = new Map<string, Category>();

        for (const article of articles) {
            const categoryId = this.slugify(article.category);

            if (!categoryMap.has(categoryId)) {
                categoryMap.set(categoryId, {
                    id: categoryId,
                    name: article.category,
                    description: `${article.category}カテゴリの商品レビュー`,
                    subcategories: [],
                    articleCount: 0,
                    featuredProducts: []
                });
            }

            const category = categoryMap.get(categoryId)!;
            category.articleCount++;

            // サブカテゴリの処理
            if (article.subcategory) {
                const subId = this.slugify(article.subcategory);
                let sub = category.subcategories.find(s => s.id === subId);

                if (!sub) {
                    sub = {
                        id: subId,
                        name: article.subcategory,
                        description: `${article.subcategory}の商品レビュー`,
                        subcategories: [],
                        articleCount: 0,
                        featuredProducts: []
                    };
                    category.subcategories.push(sub);
                }
                sub.articleCount++;
            }

            // フィーチャー商品の追加
            if (article.featured && category.featuredProducts.length < 5) {
                category.featuredProducts.push(article.asin);
            }
        }

        // フィーチャー記事の選定
        const featuredArticles = articles
            .filter(a => a.featured)
            .slice(0, 10);

        this.categoryIndex = {
            categories: Array.from(categoryMap.values()),
            totalArticles: articles.length,
            lastUpdated: new Date(),
            featuredArticles
        };

        this.logger.info(`Category index generated with ${this.categoryIndex.categories.length} categories`);
        return this.categoryIndex;
    }

    /**
     * フィルタリングインターフェースを作成
     */
    createFilterableInterface(
        categories: Category[],
        manufacturers: string[]
    ): FilterInterface {
        this.logger.info('Creating filterable interface');

        const categoryFilters = this.createCategoryFilters(categories);
        const manufacturerFilters = this.createManufacturerFilters(manufacturers);
        const priceRanges = this.createPriceRangeFilters();
        const ratings = this.createRatingFilters();
        const keywords = this.createKeywordFilters();

        return {
            categories: categoryFilters,
            manufacturers: manufacturerFilters,
            priceRanges,
            ratings,
            keywords
        };
    }

    /**
     * ナビゲーションメニューを更新
     */
    async updateNavigationMenu(newArticle: ArticleMetadata): Promise<NavigationMenuItem[]> {
        this.logger.info(`Updating navigation menu for article: ${newArticle.title}`);

        // 記事リストに追加
        this.articles.push(newArticle);

        // カテゴリインデックスを再生成
        this.generateCategoryIndex(this.articles);

        // メニュー構造を生成
        const menu = this.generateNavigationMenu();

        return menu;
    }

    /**
     * サイトマップを生成
     */
    async generateSitemap(): Promise<string> {
        this.logger.info('Generating sitemap');

        const baseUrl = 'https://example.github.io/amazon-product-article';
        const now = new Date().toISOString();

        const urls: Array<{ loc: string; priority: string; changefreq: string }> = [
            { loc: baseUrl, priority: '1.0', changefreq: 'daily' }
        ];

        // カテゴリページ
        for (const category of this.categoryIndex.categories) {
            urls.push({
                loc: `${baseUrl}/categories/${category.id}/`,
                priority: '0.8',
                changefreq: 'weekly'
            });

            for (const sub of category.subcategories) {
                urls.push({
                    loc: `${baseUrl}/categories/${category.id}/${sub.id}/`,
                    priority: '0.7',
                    changefreq: 'weekly'
                });
            }
        }

        // 記事ページ
        for (const article of this.articles) {
            const slug = this.slugify(article.title);
            const date = article.publishDate.toISOString().split('T')[0];
            urls.push({
                loc: `${baseUrl}/articles/${date}-${slug}.html`,
                priority: article.featured ? '0.9' : '0.6',
                changefreq: 'monthly'
            });
        }

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

        return sitemap;
    }

    /**
     * フィルタリングを適用
     */
    applyFilters(params: FilterParams): FilterResult {
        this.logger.info('Applying filters', params);

        let filtered = [...this.articles];

        // カテゴリフィルタ
        if (params.category) {
            filtered = filtered.filter(a =>
                this.slugify(a.category) === params.category
            );
        }

        // サブカテゴリフィルタ
        if (params.subcategory) {
            filtered = filtered.filter(a =>
                a.subcategory && this.slugify(a.subcategory) === params.subcategory
            );
        }

        // メーカーフィルタ
        if (params.manufacturer) {
            filtered = filtered.filter(a =>
                a.manufacturer && a.manufacturer.toLowerCase() === params.manufacturer?.toLowerCase()
            );
        }

        // 価格帯フィルタ
        if (params.priceRange) {
            filtered = filtered.filter(a => {
                // priceRangeはarticleの属性として使用
                return a.priceRange === params.priceRange;
            });
        }

        // レーティングフィルタ
        if (params.minRating !== undefined) {
            filtered = filtered.filter(a =>
                a.rating !== undefined && a.rating >= params.minRating!
            );
        }

        // キーワードフィルタ
        if (params.keywords && params.keywords.length > 0) {
            filtered = filtered.filter(a =>
                params.keywords!.some(kw =>
                    a.title.toLowerCase().includes(kw.toLowerCase()) ||
                    a.description.toLowerCase().includes(kw.toLowerCase()) ||
                    a.tags.some(t => t.toLowerCase().includes(kw.toLowerCase()))
                )
            );
        }

        // ソート
        if (params.sortBy) {
            filtered = this.sortArticles(filtered, params.sortBy, params.sortOrder || 'desc');
        }

        // 利用可能なフィルタを更新
        const availableFilters = this.createFilterableInterface(
            this.categoryIndex.categories,
            this.extractManufacturers(filtered)
        );

        return {
            articles: filtered,
            totalCount: filtered.length,
            appliedFilters: params,
            availableFilters
        };
    }

    /**
     * パンくずリストを生成
     */
    generateBreadcrumbs(path: string): Breadcrumb[] {
        const breadcrumbs: Breadcrumb[] = [
            { label: 'ホーム', url: '/' }
        ];

        const parts = path.split('/').filter(p => p);
        let currentPath = '';

        for (const part of parts) {
            currentPath += `/${part}`;
            const label = this.formatBreadcrumbLabel(part);
            breadcrumbs.push({ label, url: currentPath });
        }

        return breadcrumbs;
    }

    /**
     * 関連記事を取得
     */
    getRelatedArticles(article: ArticleMetadata, limit: number = 5): ArticleMetadata[] {
        this.logger.info(`Getting related articles for: ${article.title}`);

        return this.articles
            .filter(a =>
                a.asin !== article.asin && // 自分自身を除外
                (a.category === article.category || // 同じカテゴリ
                    a.tags.some(t => article.tags.includes(t))) // 共通タグ
            )
            .sort((a, b) => {
                // 共通タグが多い順
                const aCommonTags = a.tags.filter(t => article.tags.includes(t)).length;
                const bCommonTags = b.tags.filter(t => article.tags.includes(t)).length;
                return bCommonTags - aCommonTags;
            })
            .slice(0, limit);
    }

    // === Private methods ===

    /**
     * カテゴリフィルタを作成
     */
    private createCategoryFilters(categories: Category[]): CategoryFilter[] {
        return categories.map(cat => ({
            category: cat.name,
            count: cat.articleCount,
            subcategories: cat.subcategories.map(sub => ({
                name: sub.name,
                count: sub.articleCount
            }))
        }));
    }

    /**
     * メーカーフィルタを作成
     */
    private createManufacturerFilters(_manufacturers: string[]): ManufacturerFilter[] {
        const manufacturerMap = new Map<string, { count: number; categories: Set<string> }>();

        for (const article of this.articles) {
            if (article.manufacturer) {
                const mfr = article.manufacturer;
                if (!manufacturerMap.has(mfr)) {
                    manufacturerMap.set(mfr, { count: 0, categories: new Set() });
                }
                const entry = manufacturerMap.get(mfr)!;
                entry.count++;
                entry.categories.add(article.category);
            }
        }

        return Array.from(manufacturerMap.entries()).map(([name, data]) => ({
            name,
            count: data.count,
            categories: Array.from(data.categories)
        }));
    }

    /**
     * 価格帯フィルタを作成
     */
    private createPriceRangeFilters(): PriceRangeFilter[] {
        const ranges = [
            { range: 'low', min: 0, max: 5000, label: '〜5,000円' },
            { range: 'medium', min: 5000, max: 20000, label: '5,000〜20,000円' },
            { range: 'high', min: 20000, max: 50000, label: '20,000〜50,000円' },
            { range: 'premium', min: 50000, max: Infinity, label: '50,000円〜' }
        ];

        return ranges.map(r => ({
            range: r.range,
            min: r.min,
            max: r.max,
            count: this.articles.filter(a => a.priceRange === r.range).length
        }));
    }

    /**
     * レーティングフィルタを作成
     */
    private createRatingFilters(): RatingFilter[] {
        return [5, 4, 3, 2, 1].map(stars => ({
            stars,
            count: this.articles.filter(a =>
                a.rating !== undefined && Math.floor(a.rating) === stars
            ).length
        }));
    }

    /**
     * キーワードフィルタを作成
     */
    private createKeywordFilters(): KeywordFilter {
        // 人気キーワードの抽出（タグから）
        const tagCounts = new Map<string, number>();
        for (const article of this.articles) {
            for (const tag of article.tags) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }

        const popular = Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag]) => tag);

        // 最近のキーワード
        const recentArticles = [...this.articles]
            .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime())
            .slice(0, 10);

        const recentTags = new Set<string>();
        for (const article of recentArticles) {
            for (const tag of article.tags.slice(0, 3)) {
                recentTags.add(tag);
            }
        }

        return {
            popular,
            recent: Array.from(recentTags).slice(0, 10)
        };
    }

    /**
     * ナビゲーションメニューを生成
     */
    private generateNavigationMenu(): NavigationMenuItem[] {
        const menu: NavigationMenuItem[] = [
            { id: 'home', label: 'ホーム', url: '/' }
        ];

        // カテゴリメニュー
        const categoryMenu: NavigationMenuItem = {
            id: 'categories',
            label: 'カテゴリ',
            url: '/categories/',
            children: this.categoryIndex.categories.map(cat => ({
                id: cat.id,
                label: cat.name,
                url: `/categories/${cat.id}/`,
                badge: String(cat.articleCount),
                children: cat.subcategories.map(sub => ({
                    id: sub.id,
                    label: sub.name,
                    url: `/categories/${cat.id}/${sub.id}/`
                }))
            }))
        };
        menu.push(categoryMenu);

        // その他のメニュー項目
        menu.push(
            { id: 'new', label: '新着', url: '/new/' },
            { id: 'featured', label: 'おすすめ', url: '/featured/' }
        );

        return menu;
    }

    /**
     * メーカーを抽出
     */
    private extractManufacturers(articles: ArticleMetadata[]): string[] {
        const manufacturers = new Set<string>();
        for (const article of articles) {
            if (article.manufacturer) {
                manufacturers.add(article.manufacturer);
            }
        }
        return Array.from(manufacturers);
    }

    /**
     * 価格帯を解析
     */
    private parsePriceRange(rangeStr: string): { min: number; max: number } {
        const ranges: Record<string, { min: number; max: number }> = {
            'low': { min: 0, max: 5000 },
            'medium': { min: 5000, max: 20000 },
            'high': { min: 20000, max: 50000 },
            'premium': { min: 50000, max: Infinity }
        };
        return ranges[rangeStr] || { min: 0, max: Infinity };
    }

    /**
     * 記事をソート
     */
    private sortArticles(
        articles: ArticleMetadata[],
        sortBy: 'date' | 'rating' | 'price',
        sortOrder: 'asc' | 'desc'
    ): ArticleMetadata[] {
        const sorted = [...articles];

        sorted.sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'date':
                    comparison = a.publishDate.getTime() - b.publishDate.getTime();
                    break;
                case 'rating':
                    comparison = (a.rating || 0) - (b.rating || 0);
                    break;
                case 'price': {
                    // priceRangeで簡易比較
                    const priceOrder = { 'low': 1, 'medium': 2, 'high': 3, 'premium': 4 };
                    comparison = (priceOrder[a.priceRange as keyof typeof priceOrder] || 0) -
                        (priceOrder[b.priceRange as keyof typeof priceOrder] || 0);
                    break;
                }
            }

            return sortOrder === 'desc' ? -comparison : comparison;
        });

        return sorted;
    }

    /**
     * パンくずラベルをフォーマット
     */
    private formatBreadcrumbLabel(part: string): string {
        // スラッグから読みやすいラベルに変換
        return part
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * スラッグを生成
     */
    private slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9ぁ-んァ-ン一-龥]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
}
