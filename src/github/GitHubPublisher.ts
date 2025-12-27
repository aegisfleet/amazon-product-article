/**
 * GitHub_Publisher - GitHub Pagesへの記事公開とサイト管理
 */

import { ArticleMetadata } from '../article/ArticleGenerator';
import {
  ArticleCommit,
  ArticleIndexEntry,
  DeploymentStatus,
  GitHubConfig,
  SiteIndex
} from '../types/GitHubTypes';
import { Logger } from '../utils/Logger';

export class GitHubPublisher {
  private logger: Logger;
  private config: GitHubConfig;
  private siteIndex: SiteIndex;

  constructor(config?: Partial<GitHubConfig>) {
    this.logger = Logger.getInstance();
    const token = config?.token ?? process.env.GITHUB_TOKEN;
    this.config = {
      owner: config?.owner || process.env.GITHUB_REPOSITORY_OWNER || '',
      repo: config?.repo || process.env.GITHUB_REPOSITORY?.split('/')[1] || '',
      branch: config?.branch || 'main',
      ...(token !== undefined && { token })
    };
    this.siteIndex = {
      articles: [],
      categories: [],
      lastUpdated: new Date()
    };
  }

  /**
   * 記事をコミット
   */
  async commitArticle(article: string, metadata: ArticleMetadata): Promise<ArticleCommit> {
    this.logger.info(`Committing article: ${metadata.title}`);

    const path = this.generateArticlePath(metadata);
    const message = this.generateCommitMessage(metadata);

    const commit: ArticleCommit = {
      path,
      content: article,
      message
    };

    try {
      // 実際の実装ではGitHub APIを使用
      await this.simulateCommit(commit);

      this.logger.info(`Article committed to ${path}`);
      return commit;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to commit article: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * サイトインデックスを更新
   */
  async updateSiteIndex(newArticle: ArticleMetadata): Promise<SiteIndex> {
    this.logger.info('Updating site index');

    // 新しい記事をインデックスに追加
    const entry: ArticleIndexEntry = {
      path: this.generateArticlePath(newArticle),
      title: newArticle.title,
      description: newArticle.description,
      category: newArticle.category,
      asin: newArticle.asin,
      publishDate: newArticle.publishDate
    };

    this.siteIndex.articles.push(entry);
    this.updateCategoryCount(newArticle.category, newArticle.subcategory);
    this.siteIndex.lastUpdated = new Date();

    // インデックスファイルを生成
    await this.generateIndexFile();

    return this.siteIndex;
  }

  /**
   * GitHub Pagesへデプロイ
   */
  async deployToPages(): Promise<DeploymentStatus> {
    this.logger.info('Deploying to GitHub Pages');

    const status: DeploymentStatus = {
      status: 'pending',
      environment: 'github-pages',
      createdAt: new Date()
    };

    try {
      // GitHub Pagesデプロイメントをトリガー
      await this.triggerDeployment();

      status.status = 'in_progress';
      status.updatedAt = new Date();

      // デプロイメント完了を待機（シミュレーション）
      await this.waitForDeployment();

      status.status = 'success';
      status.url = `https://${this.config.owner}.github.io/${this.config.repo}`;
      status.updatedAt = new Date();

      this.logger.info(`Deployment successful: ${status.url}`);
      return status;
    } catch (error) {
      status.status = 'failure';
      status.updatedAt = new Date();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Deployment failed: ${errorMessage}`);

      return status;
    }
  }

  /**
   * モバイルCSSを生成
   */
  generateMobileCSS(): string {
    this.logger.info('Generating mobile-optimized CSS');

    return `/* Mobile-First Responsive CSS for Amazon Product Articles */

/* Base styles - Mobile First */
:root {
  --primary-color: #ff9900;
  --text-color: #333333;
  --bg-color: #ffffff;
  --border-color: #e0e0e0;
  --shadow: 0 2px 4px rgba(0,0,0,0.1);
  --radius: 8px;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--bg-color);
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

/* Container */
.container {
  width: 100%;
  max-width: 100%;
  padding: 16px;
  margin: 0 auto;
}

/* Typography */
h1 {
  font-size: 1.5rem;
  line-height: 1.3;
  margin-bottom: 1rem;
}

h2 {
  font-size: 1.25rem;
  line-height: 1.4;
  margin-top: 2rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--primary-color);
}

h3 {
  font-size: 1.1rem;
  line-height: 1.4;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

p {
  margin-bottom: 1rem;
}

/* Links */
a {
  color: var(--primary-color);
  text-decoration: none;
}

a:hover, a:active {
  text-decoration: underline;
}

/* Affiliate Button */
.affiliate-button {
  display: block;
  width: 100%;
  padding: 16px 24px;
  background-color: var(--primary-color);
  color: white;
  text-align: center;
  font-weight: bold;
  border-radius: var(--radius);
  text-decoration: none;
  margin: 1rem 0;
  min-height: 48px;
  touch-action: manipulation;
}

.affiliate-button:hover, .affiliate-button:active {
  background-color: #e68a00;
  text-decoration: none;
}

/* Product Card */
.product-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 1rem;
  box-shadow: var(--shadow);
}

.product-image {
  width: 100%;
  height: auto;
  border-radius: calc(var(--radius) / 2);
  margin-bottom: 1rem;
}

.product-price {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--primary-color);
}

/* Rating */
.rating {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
}

.stars {
  color: var(--primary-color);
}

/* Pros/Cons Lists */
.pros-cons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pros, .cons {
  padding: 1rem;
  border-radius: var(--radius);
}

.pros {
  background-color: #e6f7e6;
  border-left: 4px solid #28a745;
}

.cons {
  background-color: #fff3e6;
  border-left: 4px solid #fd7e14;
}

.pros h4, .cons h4 {
  margin: 0 0 0.5rem 0;
}

.pros ul, .cons ul {
  margin: 0;
  padding-left: 1.5rem;
}

.pros li, .cons li {
  margin-bottom: 0.5rem;
}

/* Comparison Table */
.comparison-table {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.comparison-table table {
  width: 100%;
  min-width: 300px;
  border-collapse: collapse;
}

.comparison-table th,
.comparison-table td {
  padding: 12px 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.comparison-table th {
  background-color: #f5f5f5;
  font-weight: bold;
}

/* Disclosure */
.disclosure {
  font-size: 0.875rem;
  color: #666;
  padding: 1rem;
  background-color: #f9f9f9;
  border-radius: var(--radius);
  margin-top: 2rem;
}

/* Tablet and Desktop */
@media (min-width: 768px) {
  .container {
    max-width: 720px;
    padding: 24px;
  }

  h1 {
    font-size: 2rem;
  }

  h2 {
    font-size: 1.5rem;
  }

  .pros-cons {
    flex-direction: row;
  }

  .pros, .cons {
    flex: 1;
  }

  .affiliate-button {
    width: auto;
    display: inline-block;
    padding: 16px 32px;
  }
}

@media (min-width: 1024px) {
  .container {
    max-width: 960px;
  }
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  :root {
    --text-color: #e0e0e0;
    --bg-color: #1a1a1a;
    --border-color: #333333;
  }

  .product-card {
    background-color: #2a2a2a;
  }

  .comparison-table th {
    background-color: #2a2a2a;
  }

  .disclosure {
    background-color: #2a2a2a;
    color: #999;
  }

  .pros {
    background-color: #1a3d1a;
  }

  .cons {
    background-color: #3d2a1a;
  }
}

/* Print Styles */
@media print {
  .affiliate-button {
    display: none;
  }

  .container {
    max-width: 100%;
  }
}
`;
  }

  /**
   * カテゴリページを更新
   */
  async updateCategoryPages(category: string): Promise<void> {
    this.logger.info(`Updating category page: ${category}`);

    const categoryEntry = this.siteIndex.categories.find(c => c.name === category);
    if (!categoryEntry) {
      this.logger.warn(`Category ${category} not found in index`);
      return;
    }

    const categoryArticles = this.siteIndex.articles.filter(a => a.category === category);
    const categoryPage = this.generateCategoryPage(category, categoryArticles);

    await this.simulateCommit({
      path: `categories/${this.slugify(category)}/index.md`,
      content: categoryPage,
      message: `Update category page: ${category}`
    });
  }

  /**
   * フィルタブルインデックスを生成
   */
  async generateFilterableIndex(): Promise<string> {
    this.logger.info('Generating filterable index');

    const categories = this.siteIndex.categories;
    const articles = this.siteIndex.articles;

    const indexContent = `---
layout: home
title: "Amazon商品レビュー一覧"
description: "厳選されたAmazon商品の詳細レビュー・比較記事"
---

# 商品レビュー一覧

<div id="filter-container">
  <select id="category-filter" class="filter-select">
    <option value="">すべてのカテゴリ</option>
${categories.map(c => `    <option value="${c.slug}">${c.name} (${c.count})</option>`).join('\n')}
  </select>
</div>

<div id="articles-list">
${articles.map(a => `
## [${a.title}](${a.path})

${a.description}

カテゴリ: ${a.category} | 公開日: ${a.publishDate.toISOString().split('T')[0]}

---
`).join('\n')}
</div>

<script>
document.getElementById('category-filter').addEventListener('change', function() {
  // フィルタリングロジック
  const category = this.value;
  const articles = document.querySelectorAll('#articles-list > *');
  // 実装省略
});
</script>
`;

    await this.simulateCommit({
      path: 'index.md',
      content: indexContent,
      message: 'Update filterable index'
    });

    return indexContent;
  }

  /**
   * サイトマップを生成
   */
  async generateSitemap(): Promise<string> {
    this.logger.info('Generating sitemap');

    const baseUrl = `https://${this.config.owner}.github.io/${this.config.repo}`;
    const now = new Date().toISOString();

    const urls = [
      { loc: baseUrl, priority: '1.0' },
      ...this.siteIndex.categories.map(c => ({
        loc: `${baseUrl}/categories/${c.slug}/`,
        priority: '0.8'
      })),
      ...this.siteIndex.articles.map(a => ({
        loc: `${baseUrl}/${a.path.replace('.md', '.html')}`,
        priority: '0.6'
      }))
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    await this.simulateCommit({
      path: 'sitemap.xml',
      content: sitemap,
      message: 'Update sitemap'
    });

    return sitemap;
  }

  // === Private methods ===

  /**
   * 記事パスを生成
   */
  private generateArticlePath(metadata: ArticleMetadata): string {
    const date = metadata.publishDate.toISOString().split('T')[0];
    const slug = this.slugify(metadata.title);
    return `articles/${date}-${slug}.md`;
  }

  /**
   * コミットメッセージを生成
   */
  private generateCommitMessage(metadata: ArticleMetadata): string {
    return `Add article: ${metadata.title}\n\nCategory: ${metadata.category}\nASIN: ${metadata.asin}`;
  }

  /**
   * カテゴリカウントを更新
   */
  private updateCategoryCount(category: string, subcategory?: string): void {
    let categoryEntry = this.siteIndex.categories.find(c => c.name === category);

    if (!categoryEntry) {
      categoryEntry = {
        name: category,
        slug: this.slugify(category),
        count: 0,
        subcategories: []
      };
      this.siteIndex.categories.push(categoryEntry);
    }

    categoryEntry.count++;

    if (subcategory && categoryEntry.subcategories) {
      let subEntry = categoryEntry.subcategories.find(s => s.name === subcategory);
      if (!subEntry) {
        subEntry = {
          name: subcategory,
          slug: this.slugify(subcategory),
          count: 0
        };
        categoryEntry.subcategories.push(subEntry);
      }
      subEntry.count++;
    }
  }

  /**
   * インデックスファイルを生成
   */
  private async generateIndexFile(): Promise<void> {
    const content = JSON.stringify(this.siteIndex, null, 2);
    await this.simulateCommit({
      path: 'data/site-index.json',
      content,
      message: 'Update site index'
    });
  }

  /**
   * カテゴリページを生成
   */
  private generateCategoryPage(category: string, articles: ArticleIndexEntry[]): string {
    return `---
layout: category
title: "${category}の商品レビュー"
description: "${category}カテゴリの厳選商品レビュー一覧"
category: "${category}"
---

# ${category}の商品レビュー

${articles.length}件の商品レビューがあります。

${articles.map(a => `
## [${a.title}](/${a.path.replace('.md', '.html')})

${a.description}

公開日: ${a.publishDate.toISOString().split('T')[0]}
`).join('\n---\n')}
`;
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

  /**
   * コミットをシミュレート
   */
  private async simulateCommit(commit: ArticleCommit): Promise<void> {
    this.logger.debug(`Simulating commit: ${commit.path}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * デプロイメントをトリガー
   */
  private async triggerDeployment(): Promise<void> {
    this.logger.debug('Triggering deployment');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * デプロイメント完了を待機
   */
  private async waitForDeployment(): Promise<void> {
    this.logger.debug('Waiting for deployment');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
