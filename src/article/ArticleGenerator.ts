/**
 * Article_Generator - 調査結果からMarkdown記事として生成するコンポーネント
 */

import { ReviewAnalysisResult } from '../analysis/ReviewAnalyzer';
import { InvestigationResult } from '../types/JulesTypes';
import { Product } from '../types/Product';
import { Logger } from '../utils/Logger';

export interface ArticleMetadata {
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  manufacturer?: string;
  tags: string[];
  publishDate: Date;
  asin: string;
  priceRange: string;
  rating?: number;
  featured: boolean;
  mobileOptimized: boolean;
  seoKeywords: string[];
}

export interface ArticleTemplate {
  sections: {
    introduction: TemplateSection;
    userReviews: TemplateSection;
    competitiveAnalysis: TemplateSection;
    recommendation: TemplateSection;
    conclusion: TemplateSection;
  };
  qualityRequirements: {
    minWordCount: number;
    requiredElements: string[];
    styleGuidelines: StyleRule[];
  };
}

export interface TemplateSection {
  title: string;
  minWordCount: number;
  requiredElements: string[];
  structure: string;
}

export interface StyleRule {
  rule: string;
  description: string;
  example?: string;
}

export interface GeneratedArticle {
  content: string;
  metadata: ArticleMetadata;
  wordCount: number;
  sections: ArticleSection[];
  affiliateLinks: AffiliateLink[];
}

export interface ArticleSection {
  title: string;
  content: string;
  wordCount: number;
  requiredElements: string[];
}

export interface AffiliateLink {
  asin: string;
  url: string;
  text: string;
  position: number;
}

export class ArticleGenerator {
  private logger: Logger;
  private defaultTemplate: ArticleTemplate;

  constructor() {
    this.logger = Logger.getInstance();
    this.defaultTemplate = this.createDefaultTemplate();
  }

  /**
   * 調査結果からMarkdown記事を生成
   */
  async generateArticle(
    product: Product,
    investigation: InvestigationResult,
    reviewAnalysis?: ReviewAnalysisResult,
    template?: ArticleTemplate
  ): Promise<GeneratedArticle> {
    this.logger.info('Starting article generation', {
      productAsin: product.asin,
      sessionId: investigation.sessionId
    });

    try {
      const articleTemplate = template || this.defaultTemplate;
      const metadata = this.generateSEOMetadata(product, investigation);

      const sections = await this.generateSections(
        product,
        investigation,
        reviewAnalysis,
        articleTemplate
      );

      const content = this.assembleArticle(sections, metadata);
      const mobileOptimizedContent = this.createMobileOptimizedLayout(content);
      const contentWithAffiliateLinks = this.insertAffiliateLinks(mobileOptimizedContent, product.asin);

      const affiliateLinks = this.extractAffiliateLinks(contentWithAffiliateLinks);
      const wordCount = this.calculateWordCount(contentWithAffiliateLinks);

      const article: GeneratedArticle = {
        content: contentWithAffiliateLinks,
        metadata,
        wordCount,
        sections,
        affiliateLinks
      };

      this.logger.info('Article generation completed', {
        productAsin: product.asin,
        wordCount,
        sectionsCount: sections.length,
        affiliateLinksCount: affiliateLinks.length
      });

      return article;
    } catch (error) {
      this.logger.error('Failed to generate article', error);
      throw new Error(`Article generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * SEOメタデータを生成
   */
  generateSEOMetadata(product: Product, investigation: InvestigationResult): ArticleMetadata {
    const title = `${product.title}の詳細レビュー：ユーザーの本音と競合比較`;
    const description = `${product.title}の実際のユーザーレビューを分析し、競合商品との比較を通じて購買判断をサポート`;

    const tags = this.generateTags(product, investigation);
    const seoKeywords = this.generateSEOKeywords(product, investigation);
    const priceRange = this.determinePriceRange(product.price.amount);
    const subcategory = this.determineSubcategory(product);
    const manufacturer = this.extractManufacturer(product);

    const metadata: ArticleMetadata = {
      title,
      description,
      category: product.category,
      tags,
      publishDate: new Date(),
      asin: product.asin,
      priceRange,
      rating: product.rating.average,
      featured: this.shouldBeFeatured(product, investigation),
      mobileOptimized: true,
      seoKeywords
    };

    if (subcategory) {
      metadata.subcategory = subcategory;
    }

    if (manufacturer) {
      metadata.manufacturer = manufacturer;
    }

    return metadata;
  }

  /**
   * モバイル最適化レイアウトを作成
   */
  createMobileOptimizedLayout(content: string): string {
    // モバイルファーストのレスポンシブデザイン対応
    let mobileContent = content;

    // 長い段落を分割
    mobileContent = mobileContent.replace(/(.{200,}?)([。！？])/g, '$1$2\n\n');

    // テーブルをモバイル対応形式に変換
    mobileContent = this.convertTablesToMobileFriendly(mobileContent);

    // 画像にモバイル対応クラスを追加
    mobileContent = mobileContent.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '![${1}](${2}){: .mobile-responsive-image}'
    );

    // リストアイテムを読みやすく調整
    mobileContent = this.optimizeListsForMobile(mobileContent);

    return mobileContent;
  }

  /**
   * アフィリエイトリンクを挿入
   */
  insertAffiliateLinks(content: string, asin: string): string {
    const affiliateTag = process.env.AMAZON_AFFILIATE_TAG || 'your-affiliate-tag';
    const affiliateUrl = `https://www.amazon.co.jp/dp/${asin}?tag=${affiliateTag}`;

    // 商品名の後にアフィリエイトリンクを挿入
    let contentWithLinks = content.replace(
      /(## 商品詳細・購入)/,
      `$1\n\n[**${asin}をAmazonで確認する**](${affiliateUrl}){: .affiliate-link .mobile-friendly-button}\n`
    );

    // 記事の最後にアフィリエイト開示を追加
    contentWithLinks += '\n\n---\n*本記事にはアフィリエイトリンクが含まれています。商品購入時に当サイトが収益を得る場合があります。*';

    return contentWithLinks;
  }

  /**
   * 記事セクションを生成
   */
  private async generateSections(
    product: Product,
    investigation: InvestigationResult,
    reviewAnalysis: ReviewAnalysisResult | undefined,
    template: ArticleTemplate
  ): Promise<ArticleSection[]> {
    const sections: ArticleSection[] = [];

    // 導入部
    sections.push(await this.generateIntroductionSection(product, investigation, template.sections.introduction));

    // 商品概要
    sections.push(await this.generateProductOverviewSection(product));

    // ユーザーレビュー分析
    sections.push(await this.generateUserReviewsSection(investigation, reviewAnalysis, template.sections.userReviews));

    // 競合商品との比較
    sections.push(await this.generateCompetitiveAnalysisSection(investigation, template.sections.competitiveAnalysis));

    // 購入推奨度
    sections.push(await this.generateRecommendationSection(investigation, template.sections.recommendation));

    // 商品詳細・購入
    sections.push(await this.generatePurchaseSection(product));

    // 情報ソース（もしあれば）
    if (investigation.analysis.sources && investigation.analysis.sources.length > 0) {
      sections.push(await this.generateSourcesSection(investigation));
    }

    return sections;
  }

  /**
   * 情報ソースセクションを生成
   */
  private async generateSourcesSection(investigation: InvestigationResult): Promise<ArticleSection> {
    const sources = investigation.analysis.sources
      .map(source => `- [${source.name}](${source.url || '#'}) ${source.credibility ? `(${source.credibility})` : ''}`)
      .join('\n');

    const content = `## 参考情報ソース

本記事の作成にあたり、以下の情報を参照しました：

${sources}`;

    return {
      title: '参考情報ソース',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['情報ソース一覧']
    };
  }

  /**
   * 導入部セクションを生成
   */
  private async generateIntroductionSection(
    product: Product,
    investigation: InvestigationResult,
    template: TemplateSection
  ): Promise<ArticleSection> {
    const content = `# ${product.title}の詳細レビュー

${product.title}について、実際のユーザーレビューを詳細に分析し、競合商品との比較を通じて、あなたの購買判断をサポートします。

この記事では、${investigation.analysis.positivePoints.length}件のポジティブな評価と${investigation.analysis.negativePoints.length}件の改善点を分析し、どのような方にこの商品が適しているかを明確にお伝えします。

## この記事で分かること

- 実際のユーザーが感じた良い点・気になる点
- 競合商品との具体的な比較
- あなたに適した商品かどうかの判断基準
- 購入時に注意すべきポイント`;

    return {
      title: '導入部',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements
    };
  }

  /**
   * 商品概要セクションを生成
   */
  private async generateProductOverviewSection(product: Product): Promise<ArticleSection> {
    const specifications = Object.entries(product.specifications)
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join('\n');

    const content = `## 商品概要

### 基本情報

- **商品名**: ${product.title}
- **価格**: ${product.price.formatted}
- **カテゴリ**: ${product.category}
- **平均評価**: ${product.rating.average}点 (${product.rating.count}件のレビュー)
- **在庫状況**: ${product.availability}

### 主な仕様

${specifications}

![${product.title}](${product.images.primary}){: .product-main-image .mobile-responsive}`;

    return {
      title: '商品概要',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['基本情報', '仕様', '画像']
    };
  }

  /**
   * ユーザーレビューセクションを生成
   */
  private async generateUserReviewsSection(
    investigation: InvestigationResult,
    reviewAnalysis: ReviewAnalysisResult | undefined,
    template: TemplateSection
  ): Promise<ArticleSection> {
    const positivePoints = investigation.analysis.positivePoints
      .map(point => `- ${point}`)
      .join('\n');

    const negativePoints = investigation.analysis.negativePoints
      .map(point => `- ${point}`)
      .join('\n');

    const useCases = investigation.analysis.useCases
      .map(useCase => `- ${useCase}`)
      .join('\n');

    // ユーザーストーリーの生成
    const userStories = investigation.analysis.userStories && investigation.analysis.userStories.length > 0
      ? `### 🗣️ 購入者の生の声（ユーザーストーリー）
${investigation.analysis.userImpression ? `\n> **${investigation.analysis.userImpression}**\n` : ''}
${investigation.analysis.userStories.map(story => `#### ${story.userType}の体験談 (${story.scenario})

> "${story.experience}"
> 
> (評価: ${story.sentiment === 'positive' ? '満足' : story.sentiment === 'negative' ? '不満' : '普通'})`).join('\n\n')}`
      : '';

    const content = `## ユーザーレビュー分析

### 👍 ユーザーが評価している点

${positivePoints}

### 👎 ユーザーが気になると感じている点

${negativePoints}

### 💡 実際の使用シーン

${useCases}

${userStories}

${reviewAnalysis ? this.generateSentimentAnalysis(reviewAnalysis) : ''}`;

    return {
      title: 'ユーザーレビュー分析',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements
    };
  }

  /**
   * 競合分析セクションを生成
   */
  private async generateCompetitiveAnalysisSection(
    investigation: InvestigationResult,
    template: TemplateSection
  ): Promise<ArticleSection> {
    const competitiveAnalysis = investigation.analysis.competitiveAnalysis
      .map(competitor => {
        const features = competitor.featureComparison
          .map(feature => `  - ${feature}`)
          .join('\n');

        const differentiators = competitor.differentiators
          .map(diff => `  - ${diff}`)
          .join('\n');

        return `### ${competitor.name}との比較

**価格比較**: ${competitor.priceComparison}

**機能比較**:
${features}

**差別化ポイント**:
${differentiators}`;
      })
      .join('\n\n');

    const content = `## 競合商品との比較

${competitiveAnalysis}

### 総合的な競合優位性

${investigation.analysis.recommendation.pros.map(pro => `- ✅ ${pro}`).join('\n')}

${investigation.analysis.recommendation.cons.map(con => `- ❌ ${con}`).join('\n')}`;

    return {
      title: '競合商品との比較',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements
    };
  }

  /**
   * 推奨度セクションを生成
   */
  private async generateRecommendationSection(
    investigation: InvestigationResult,
    template: TemplateSection
  ): Promise<ArticleSection> {
    const targetUsers = investigation.analysis.recommendation.targetUsers
      .map(user => `- ${user}`)
      .join('\n');

    const score = investigation.analysis.recommendation.score;
    const scoreText = this.getScoreDescription(score);

    const content = `## 購入推奨度

### 総合評価: ${score}点/100点 (${scoreText})

### こんな方におすすめ

${targetUsers}

### 購入時の注意点

${investigation.analysis.recommendation.cons.map(con => `- ⚠️ ${con}`).join('\n')}

### コストパフォーマンス評価

この商品は${scoreText}の評価となりました。特に${investigation.analysis.recommendation.pros[0] || '品質面'}での優位性が認められます。

${score >= 80 ? '自信を持っておすすめできる商品です。' :
        score >= 60 ? '用途を限定すれば良い選択肢となります。' :
          '購入前に他の選択肢も検討することをおすすめします。'}`;

    return {
      title: '購入推奨度',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements
    };
  }

  /**
   * 購入セクションを生成
   */
  private async generatePurchaseSection(product: Product): Promise<ArticleSection> {
    const content = `## 商品詳細・購入

### 商品情報

- **ASIN**: ${product.asin}
- **現在価格**: ${product.price.formatted}
- **在庫状況**: ${product.availability}

### 購入前チェックリスト

- [ ] 使用目的と商品特性の適合性を確認
- [ ] 予算と価格の妥当性を検討
- [ ] 配送日程と必要時期の確認
- [ ] 返品・交換ポリシーの確認

*最新の価格や在庫状況は、購入前に必ずAmazonの商品ページでご確認ください。*`;

    return {
      title: '商品詳細・購入',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['商品情報', '購入前チェックリスト']
    };
  }

  /**
   * 記事を組み立て
   */
  private assembleArticle(sections: ArticleSection[], metadata: ArticleMetadata): string {
    const frontMatter = this.generateFrontMatter(metadata);
    const sectionsContent = sections.map(section => section.content).join('\n\n');

    return `${frontMatter}\n\n${sectionsContent}`;
  }

  /**
   * フロントマターを生成
   */
  private generateFrontMatter(metadata: ArticleMetadata): string {
    return `---
title: "${metadata.title}"
description: "${metadata.description}"
date: ${metadata.publishDate.toISOString().split('T')[0]}
category: "${metadata.category}"
${metadata.subcategory ? `subcategory: "${metadata.subcategory}"` : ''}
${metadata.manufacturer ? `manufacturer: "${metadata.manufacturer}"` : ''}
asin: "${metadata.asin}"
price_range: "${metadata.priceRange}"
${metadata.rating ? `rating: ${metadata.rating}` : ''}
tags: [${metadata.tags.map(tag => `"${tag}"`).join(', ')}]
keywords: [${metadata.seoKeywords.map(keyword => `"${keyword}"`).join(', ')}]
featured: ${metadata.featured}
mobile_optimized: ${metadata.mobileOptimized}
---`;
  }

  /**
   * デフォルトテンプレートを作成
   */
  private createDefaultTemplate(): ArticleTemplate {
    return {
      sections: {
        introduction: {
          title: '導入部',
          minWordCount: 200,
          requiredElements: ['商品名', '記事の目的', '読者への価値提案'],
          structure: '商品紹介 → 記事の目的 → 読者メリット'
        },
        userReviews: {
          title: 'ユーザーレビュー分析',
          minWordCount: 800,
          requiredElements: ['ポジティブポイント', 'ネガティブポイント', '使用シーン'],
          structure: '良い点 → 気になる点 → 実際の使用例'
        },
        competitiveAnalysis: {
          title: '競合商品との比較',
          minWordCount: 600,
          requiredElements: ['競合商品', '機能比較', '差別化ポイント'],
          structure: '競合商品紹介 → 機能比較 → 優位性分析'
        },
        recommendation: {
          title: '購入推奨度',
          minWordCount: 400,
          requiredElements: ['推奨ユーザー', '注意点', 'コスパ評価'],
          structure: '総合評価 → 推奨ユーザー → 購入判断'
        },
        conclusion: {
          title: '商品詳細・購入',
          minWordCount: 200,
          requiredElements: ['商品情報', '購入リンク', 'チェックリスト'],
          structure: '商品詳細 → 購入案内 → 注意事項'
        }
      },
      qualityRequirements: {
        minWordCount: 2000,
        requiredElements: [
          '商品概要',
          'ユーザーレビュー分析',
          '競合比較',
          '購入推奨度',
          'アフィリエイト開示'
        ],
        styleGuidelines: [
          {
            rule: 'mobile_first',
            description: 'モバイルファーストのレスポンシブデザイン',
            example: '短い段落、読みやすいフォント、タップしやすいボタン'
          },
          {
            rule: 'seo_optimized',
            description: 'SEO最適化されたコンテンツ構造',
            example: '適切な見出し構造、キーワード配置、メタデータ'
          },
          {
            rule: 'user_focused',
            description: 'ユーザーの購買判断を支援する内容',
            example: '具体的な使用例、明確な推奨理由、注意点の明示'
          }
        ]
      }
    };
  }

  // Helper methods
  private generateTags(product: Product, investigation: InvestigationResult): string[] {
    const tags = ['商品レビュー', product.category];

    if (investigation.analysis.recommendation.score >= 80) {
      tags.push('おすすめ');
    }

    if (product.price.amount < 5000) {
      tags.push('お手頃価格');
    }

    return tags;
  }

  private generateSEOKeywords(product: Product, _investigation: InvestigationResult): string[] {
    const titleWords = product.title.split(' ');
    const firstWord = titleWords.length > 0 ? titleWords[0]! : product.title;

    return [
      firstWord, // 商品名の最初の単語
      'レビュー',
      '比較',
      product.category,
      '口コミ'
    ];
  }

  private determinePriceRange(amount: number): string {
    if (amount < 3000) return 'low';
    if (amount < 10000) return 'medium';
    if (amount < 30000) return 'high';
    return 'premium';
  }

  private determineSubcategory(product: Product): string | undefined {
    // 簡易的なサブカテゴリ判定
    const title = product.title.toLowerCase();
    if (title.includes('スマートフォン') || title.includes('iphone')) return 'smartphones';
    if (title.includes('ノートパソコン') || title.includes('laptop')) return 'laptops';
    return undefined;
  }

  private extractManufacturer(product: Product): string | undefined {
    const title = product.title;
    const manufacturers = ['Apple', 'Sony', 'Samsung', 'Nintendo', 'Microsoft'];

    for (const manufacturer of manufacturers) {
      if (title.includes(manufacturer)) {
        return manufacturer;
      }
    }

    return undefined;
  }

  private shouldBeFeatured(product: Product, investigation: InvestigationResult): boolean {
    return product.rating.average >= 4.0 &&
      investigation.analysis.recommendation.score >= 80 &&
      product.rating.count >= 100;
  }

  private convertTablesToMobileFriendly(content: string): string {
    // テーブルをカード形式に変換（簡易実装）
    return content.replace(
      /\|([^|]+)\|([^|]+)\|/g,
      '<div class="mobile-card"><strong>$1</strong>: $2</div>'
    );
  }

  private optimizeListsForMobile(content: string): string {
    // リストアイテムにモバイル対応クラスを追加
    return content.replace(
      /^- (.+)$/gm,
      '- <span class="mobile-list-item">$1</span>'
    );
  }

  private extractAffiliateLinks(content: string): AffiliateLink[] {
    const links: AffiliateLink[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let position = 0;

    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1];
      const linkUrl = match[2];

      if (linkText && linkUrl && linkUrl.includes('amazon.co.jp') && linkUrl.includes('tag=')) {
        const asinMatch = linkUrl.match(/\/dp\/([A-Z0-9]{10})/);
        if (asinMatch && asinMatch[1]) {
          links.push({
            asin: asinMatch[1],
            url: linkUrl,
            text: linkText,
            position: position++
          });
        }
      }
    }

    return links;
  }

  private calculateWordCount(content: string): number {
    // 日本語文字数カウント（簡易実装）
    return content.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/g, '').length;
  }

  private generateSentimentAnalysis(reviewAnalysis: ReviewAnalysisResult): string {
    const sentiment = reviewAnalysis.overallSentiment;
    const sentimentText = sentiment.overall > 0.3 ? 'ポジティブ' :
      sentiment.overall < -0.3 ? 'ネガティブ' : '中立';

    return `
### 📊 レビュー傾向分析

**総合的な評価傾向**: ${sentimentText} (${(sentiment.overall * 100).toFixed(1)}%)

**側面別評価**:
- 品質: ${(sentiment.aspects.quality * 100).toFixed(1)}%
- 価格: ${(sentiment.aspects.value * 100).toFixed(1)}%
- 使いやすさ: ${(sentiment.aspects.usability * 100).toFixed(1)}%
- サポート: ${(sentiment.aspects.support * 100).toFixed(1)}%
- 信頼性: ${(sentiment.aspects.reliability * 100).toFixed(1)}%

**信頼度**: ${(sentiment.confidence * 100).toFixed(1)}%`;
  }

  private getScoreDescription(score: number): string {
    if (score >= 90) return '非常に優秀';
    if (score >= 80) return '優秀';
    if (score >= 70) return '良好';
    if (score >= 60) return '普通';
    if (score >= 50) return 'やや不足';
    return '要検討';
  }
}