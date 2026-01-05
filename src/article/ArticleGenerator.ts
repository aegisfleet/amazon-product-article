/**
 * Article_Generator - 調査結果からMarkdown記事として生成するコンポーネント
 */

import { AffiliateLinkManager } from '../affiliate/AffiliateLinkManager';
import { ReviewAnalysisResult } from '../analysis/ReviewAnalyzer';
import { AffiliateLink } from '../types/AffiliateTypes';
import { InvestigationResult, TechnicalSpecs } from '../types/JulesTypes';
import { Product, ProductDetail } from '../types/Product';
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
  price?: string;
  score?: number;
  rating?: number;
  featured: boolean;
  mobileOptimized: boolean;
  seoKeywords: string[];
  lastInvestigated?: string;
  images?: string[];  // Product image URLs for Hugo front matter
  technicalSpecs?: TechnicalSpecs;  // 詳細スペック情報（カテゴリ依存）
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


export class ArticleGenerator {
  private logger: Logger;
  private defaultTemplate: ArticleTemplate;
  private affiliateManager: AffiliateLinkManager;

  constructor() {
    this.logger = Logger.getInstance();
    this.defaultTemplate = this.createDefaultTemplate();
    this.affiliateManager = new AffiliateLinkManager();
  }

  /**
   * 調査結果からMarkdown記事を生成
   */
  async generateArticle(
    product: Product,
    investigation: InvestigationResult,
    reviewAnalysis?: ReviewAnalysisResult,
    template?: ArticleTemplate,
    affiliatePartnerTag?: string,
    competitorDetails?: Map<string, ProductDetail>
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
        articleTemplate,
        affiliatePartnerTag,
        competitorDetails
      );

      const content = this.assembleArticle(sections, metadata);
      const mobileOptimizedContent = this.createMobileOptimizedLayout(content);

      // AffiliateLinkManagerを使用してリンクを管理
      const contentWithAffiliateLinks = this.insertAffiliateLinks(mobileOptimizedContent, product, affiliatePartnerTag);

      const affiliateLinks = this.extractAffiliateLinks(contentWithAffiliateLinks);
      const wordCount = this.calculateWordCount(contentWithAffiliateLinks);

      // 最後に関連コンプライアンスチェックを実行
      const compliance = this.affiliateManager.checkCompliance(contentWithAffiliateLinks);
      if (!compliance.isCompliant) {
        this.logger.warn('Article generation completed with compliance issues', { issues: compliance.issues });
      }

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
    // productName があればそれを使用、なければ ASIN からフォールバック
    const displayName = investigation.analysis.productName || `Product ${product.asin}`;
    // タイトルをシンプルに商品名のみにする
    const title = displayName;

    // card-excerpt用にproductDescriptionを使用（なければ従来の生成ロジックへフォールバック）
    const description = investigation.analysis.productDescription ||
      `${displayName}の実際のユーザーレビューを分析し、競合商品との比較を通じて購買判断をサポート`;

    const tags = this.generateTags(product, investigation);
    const seoKeywords = this.generateSEOKeywords(product, investigation);
    const priceRange = this.determinePriceRange(product.price.amount);
    const price = product.price.formatted;
    const score = investigation.analysis.recommendation.score;

    // 階層カテゴリ: PA-APIのcategoryInfoがあればそれを使用
    const subcategory = product.categoryInfo?.sub || this.determineSubcategory(product);
    const manufacturer = this.extractManufacturer(product);

    // Product images for Hugo front matter (filter out empty strings)
    const images = product.images.primary ? [product.images.primary] : [];

    const metadata: ArticleMetadata = {
      title,
      description,
      category: product.categoryInfo?.main || product.category,
      tags,
      publishDate: new Date(),
      asin: product.asin,
      priceRange,
      price,
      score,
      // PA-API v5ではレビューデータ取得不可のためrating不使用
      featured: this.shouldBeFeatured(product, investigation),
      mobileOptimized: true,
      seoKeywords,
      ...(investigation.analysis.lastInvestigated && { lastInvestigated: investigation.analysis.lastInvestigated }),
      ...(images.length > 0 && { images })
    };

    if (subcategory) {
      metadata.subcategory = subcategory;
    }

    if (manufacturer) {
      metadata.manufacturer = manufacturer;
    }

    // 詳細スペック情報（technicalSpecs）があれば追加
    if (investigation.analysis.technicalSpecs) {
      metadata.technicalSpecs = investigation.analysis.technicalSpecs;
    }

    return metadata;
  }

  /**
   * モバイル最適化レイアウトを作成
   */
  createMobileOptimizedLayout(content: string): string {
    // モバイルファーストのレスポンシブデザイン対応
    let mobileContent = content;

    // blockquoteを一時的にプレースホルダーで置換（段落分割から保護）
    // HTML形式とMarkdown形式の両方を保護
    const blockquotes: string[] = [];

    // HTML形式の<blockquote>タグを保護
    mobileContent = mobileContent.replace(/<blockquote>[\s\S]*?<\/blockquote>/g, (match) => {
      blockquotes.push(match);
      return `__BLOCKQUOTE_${blockquotes.length - 1}__`;
    });

    // Markdown形式の「>」で始まる行を保護（連続する引用行をまとめて保護）
    mobileContent = mobileContent.replace(/^> .+$/gm, (match) => {
      blockquotes.push(match);
      return `__BLOCKQUOTE_${blockquotes.length - 1}__`;
    });

    // 長い段落を分割（blockquote以外のテキストにのみ適用）
    mobileContent = mobileContent.replace(/(.{200,}?)([。！？])/g, '$1$2\n\n');

    // blockquoteを復元
    blockquotes.forEach((bq, i) => {
      mobileContent = mobileContent.replace(`__BLOCKQUOTE_${i}__`, bq);
    });

    // テーブルをモバイル対応形式に変換
    mobileContent = this.convertTablesToMobileFriendly(mobileContent);

    // 画像をモバイル対応のHTML形式に変換
    mobileContent = mobileContent.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" class="mobile-responsive-image">'
    );

    // リストアイテムを読みやすく調整
    mobileContent = this.optimizeListsForMobile(mobileContent);

    return mobileContent;
  }

  /**
   * アフィリエイトリンクを挿入
   */
  insertAffiliateLinks(content: string, product: Product, partnerTag?: string): string {
    if (partnerTag) {
      this.affiliateManager.updateConfig({ partnerTag });
    }

    const affiliateLink = this.affiliateManager.generateLinkFromProduct(product);
    const affiliateUrl = affiliateLink.url;

    // 商品名の後にアフィリエイトリンクを挿入
    const contentWithLinks = content.replace(
      /(## 商品詳細・購入)/,
      `$1\n\n<a href="${affiliateUrl}" class="affiliate-link mobile-friendly-button" target="_blank" rel="noopener noreferrer"><strong>${product.asin}をAmazonで確認する</strong></a>\n`
    );

    return contentWithLinks;
  }

  /**
   * 記事セクションを生成
   */
  private async generateSections(
    product: Product,
    investigation: InvestigationResult,
    reviewAnalysis: ReviewAnalysisResult | undefined,
    template: ArticleTemplate,
    affiliatePartnerTag?: string,
    competitorDetails?: Map<string, ProductDetail>
  ): Promise<ArticleSection[]> {
    const sections: ArticleSection[] = [];
    const affiliateTag = affiliatePartnerTag || process.env.AMAZON_PARTNER_TAG || 'your-affiliate-tag';

    // 商品ヒーローセクション（商品概要 + 購入リンク）
    sections.push(await this.generateProductHeroSection(product, investigation, affiliateTag));

    // 商品の特徴と使い方
    sections.push(await this.generateFeaturesSection(product, investigation));

    // ユーザーレビュー分析
    sections.push(await this.generateUserReviewsSection(investigation, reviewAnalysis, template.sections.userReviews));

    // 競合商品との比較（表形式）
    if (competitorDetails) {
      sections.push(await this.generateCompetitiveAnalysisSection(investigation, template.sections.competitiveAnalysis, affiliateTag, competitorDetails));
    }

    // 購入推奨度
    sections.push(await this.generateRecommendationSection(investigation, template.sections.recommendation));

    // 商品詳細・購入（下部）
    sections.push(await this.generatePurchaseSection(product, affiliateTag, investigation));

    // 情報ソース（もしあれば）
    if (investigation.analysis.sources && investigation.analysis.sources.length > 0) {
      const sourcesSection = await this.generateSourcesSection(investigation);
      if (sourcesSection) {
        sections.push(sourcesSection);
      }
    }

    return sections;
  }

  /**
   * 情報ソースセクションを生成
   * 意味のないソース（抽象的な名前）はフィルタリング、URLなしはプレーンテキスト
   */
  private async generateSourcesSection(investigation: InvestigationResult): Promise<ArticleSection | null> {
    // 除外するソース名のリスト（意味のない抽象的なソース）
    const excludedPatterns = [
      'category analysis',
      'general market knowledge',
      'market analysis',
      'product specifications',
      'internal analysis',
      'market research'
    ];

    // 有効なソースのみフィルタリング
    const validSources = investigation.analysis.sources.filter(source => {
      const nameLower = source.name.toLowerCase();
      return !excludedPatterns.some(pattern => nameLower.includes(pattern));
    });

    // 有効なソースがなければnullを返す（セクション非表示）
    if (validSources.length === 0) {
      return null;
    }

    // URLがあればリンク、なければプレーンテキスト
    // ただし、PAAPIのURLはユーザーには不要なためリンクを貼らない
    const sourcesList = validSources
      .map(source => {
        const credibility = source.credibility ? ` (${source.credibility})` : '';
        const paapiBaseUrl = 'https://webservices.amazon.co.jp/paapi5/getitems';

        if (source.url && source.url !== paapiBaseUrl) {
          return `- [${source.name}](${source.url})${credibility}`;
        }
        return `- ${source.name}${credibility}`;
      })
      .join('\n');

    const content = `## 参考情報ソース

本記事の作成にあたり、以下の情報を参照しました：

${sourcesList}`;

    return {
      title: '参考情報ソース',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['情報ソース一覧']
    };
  }

  /**
   * 商品ヒーローセクションを生成（商品概要 + 購入リンク）
   */
  private async generateProductHeroSection(
    product: Product,
    investigation: InvestigationResult,
    _affiliateTag: string
  ): Promise<ArticleSection> {
    const affiliateLink = this.affiliateManager.generateLinkFromProduct(product);
    const affiliateUrl = affiliateLink.url;
    const productDescription = investigation.analysis.productDescription ||
      `${product.title}は、${product.category}カテゴリの商品です。`;

    const score = investigation.analysis.recommendation.score;
    const scoreText = this.getScoreDescription(score);
    const scoreEmoji = score >= 80 ? '🏆' : score >= 60 ? '👍' : '📝';

    // ProductDetail型の追加フィールドを取得（存在すれば）
    const productDetail = product as any;
    const isPrimeEligible = productDetail.isPrimeEligible;
    const availability = productDetail.availability;
    const brand = productDetail.brand;
    const releaseDate = productDetail.releaseDate;

    // Prime対応バッジ
    const primeBadge = isPrimeEligible
      ? '<span class="prime-badge">✓ Prime対応</span>'
      : '';

    // 在庫状況
    const availabilityInfo = availability
      ? `<span class="availability-info">📦 ${availability}</span>`
      : '';

    // ブランド情報
    const brandInfo = brand
      ? `**ブランド**: ${brand}`
      : '';

    // 発売日情報
    const releaseDateInfo = releaseDate
      ? `発売日: ${this.formatDateToJST(releaseDate)}`
      : '';

    const content = `<div class="product-hero-card">

<div class="product-hero-image">

![${product.title}](${product.images.primary})

</div>

<div class="product-hero-info">

${productDescription}

<div class="product-score-badge">
${scoreEmoji} 総合評価: <strong>${score}点</strong> (${scoreText})
</div>

<div class="product-meta">
${availabilityInfo ? `<p>${availabilityInfo}</p>` : ''}
<p><strong>価格</strong>: ${product.price.formatted}
${brandInfo ? ` <strong>ブランド</strong>: ${brand}` : ''}${productDetail.model ? ` <strong>モデル</strong>: ${productDetail.model}` : ''}</p>
${primeBadge ? `<p>${primeBadge}</p>` : ''}
${releaseDateInfo ? `<p>${releaseDateInfo}</p>` : ''}
</div>

<a href="${affiliateUrl}" class="btn-amazon-hero" target="_blank" rel="noopener noreferrer">🛒 Amazonで詳細を見る</a>

</div>

</div>`;

    return {
      title: '商品ヒーロー',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['商品画像', '商品説明', '購入リンク', '評価', 'Prime対応', '在庫状況']
    };
  }

  /**
   * 商品の特徴と使い方セクションを生成
   */
  private async generateFeaturesSection(
    _product: Product,
    investigation: InvestigationResult
  ): Promise<ArticleSection> {
    // 使用シーン
    const useCases = investigation.analysis.useCases
      .slice(0, 4)  // 上位4つに制限
      .map((useCase, i) => {
        const icons = ['💡', '🎯', '✨', '🔧'];
        return `<div class="feature-card">
<span class="feature-icon">${icons[i] || '📌'}</span>
<span class="feature-text">${useCase}</span>
</div>`;
      })
      .join('\n');

    // 使い方（productUsageがあれば使用）
    const productUsage = investigation.analysis.productUsage;
    const usageSection = productUsage && productUsage.length > 0
      ? `### 🔧 使い方

${productUsage.map((usage, i) => `${i + 1}. ${usage}`).join('\n')}`
      : '';

    const content = `## 📦 商品の特徴

### 💡 こんなシーンで活躍

<div class="feature-grid">

${useCases}

</div>

${usageSection}`;

    return {
      title: '商品の特徴',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['仕様', '使用シーン']
    };
  }

  /**
   * 導入部セクションを生成（後方互換性のため保持、現在は未使用）
   */
  private async generateIntroductionSection(
    product: Product,
    _investigation: InvestigationResult,
    template: TemplateSection
  ): Promise<ArticleSection> {
    const content = `# ${product.title}の詳細レビュー`;

    return {
      title: '導入部',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements
    };
  }

  /**
   * 商品概要セクションを生成（後方互換性のため保持、現在は未使用）
   */
  private async generateProductOverviewSection(product: Product, investigation: InvestigationResult): Promise<ArticleSection> {
    const specifications = Object.entries(product.specifications)
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join('\n');

    const content = `## 商品概要

### 基本情報

- **商品名**: ${product.title}
- **価格**: ${product.price.formatted}
- **カテゴリ**: ${product.category}
- **平均評価**: 外部情報源を参照
- **調査日**: ${investigation.analysis.lastInvestigated || '不明'}

### 主な仕様

${specifications}

<img src="${product.images.primary}" alt="${product.title}" class="product-main-image mobile-responsive">`;

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
    const userImpressionBlock = investigation.analysis.userImpression
      ? this.formatUserImpressionAsBlockquote(investigation.analysis.userImpression)
      : '';

    const userStoriesBlock = investigation.analysis.userStories
      .map(story => `#### ${story.userType}の体験談 (${story.scenario})

> ${story.experience}
> 
> (評価: ${story.sentiment === 'positive' ? '満足' : story.sentiment === 'negative' ? '不満' : '普通'})`)
      .join('\n\n');

    const userStories = investigation.analysis.userStories && investigation.analysis.userStories.length > 0
      ? `### 🗣️ 購入者の生の声（ユーザーストーリー）\n${userImpressionBlock}\n\n${userStoriesBlock}`
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
   * 競合分析セクションを生成（カード形式で競合商品リンク付き）
   * PA-APIで情報が取得できなかった競合商品は非表示にする
   */
  private async generateCompetitiveAnalysisSection(
    investigation: InvestigationResult,
    template: TemplateSection,
    affiliateTag: string,
    competitorDetails?: Map<string, ProductDetail>
  ): Promise<ArticleSection> {
    const competitors = investigation.analysis.competitiveAnalysis;

    // 各競合商品をカード形式で表示
    const competitorCards = competitors
      .map(competitor => {
        const features = competitor.featureComparison
          .map(feature => `<li>${feature}</li>`)
          .join('\n');

        const differentiators = competitor.differentiators
          .map(diff => `<li>${diff}</li>`)
          .join('\n');

        // PA-APIから取得した競合商品の詳細情報
        const detail = competitor.asin ? competitorDetails?.get(competitor.asin) : undefined;

        // 商品プレビュー（PA-API情報がある場合）
        let productPreview = '';
        if (detail) {
          const imageUrl = detail.images?.primary || '';
          const priceText = detail.price?.formatted || '';
          const availabilityText = detail.availability || '';
          const primeText = detail.isPrimeEligible ? '⭐ Prime対応' : '';

          productPreview = `
<div class="competitor-preview">
<img src="${imageUrl}" alt="${competitor.name}" class="competitor-preview-img">
<div class="competitor-preview-info">
${priceText ? `<span class="competitor-actual-price">${priceText}</span>` : ''}
${availabilityText ? `<span class="competitor-availability">📦 ${availabilityText}</span>` : ''}
${primeText ? `<span class="competitor-prime">${primeText}</span>` : ''}
</div>
</div>`;
        }

        // PA-APIが実行された場合（competitorDetailsが存在する場合）、
        // ASINが存在しても詳細情報が取得できなかった（エラーになった）商品はリンクを表示しない
        const shouldShowLink = competitor.asin && (!competitorDetails || competitorDetails.has(competitor.asin));

        // アフィリエイトリンクを生成
        const competitorLink = shouldShowLink
          ? `<a href="${detail?.detailPageUrl || this.affiliateManager.generateAffiliateLink(competitor.asin || '').url}" class="btn-amazon-small" target="_blank" rel="noopener noreferrer">🛒 Amazonで見る</a>`
          : '';

        return `<div class="competitor-card">
<h4>${competitor.name}</h4>
<p class="competitor-price">💰 ${competitor.priceComparison}</p>
<div class="competitor-features">
<strong>機能比較:</strong>
<ul>
${features}
</ul>
</div>
<div class="competitor-diff">
<strong>差別化ポイント:</strong>
<ul>
${differentiators}
</ul>
</div>
${productPreview}
${competitorLink}
</div>`;
      })
      .join('\n\n');

    const content = `## 🥊 競合商品との比較

<div class="competitor-cards">

${competitorCards}

</div>

### ✅ 総合的な競合優位性

<div class="pros-cons-grid">

<div class="pros-card">
<h4>👍 良い点</h4>

${investigation.analysis.recommendation.pros.map(pro => `- ${pro}`).join('\n')}

</div>

<div class="cons-card">
<h4>👎 気になる点</h4>

${investigation.analysis.recommendation.cons.map(con => `- ${con}`).join('\n')}

</div>

</div>`;

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

    const formattedRationale = investigation.analysis.recommendation.scoreRationale
      ? investigation.analysis.recommendation.scoreRationale.split('\n').join('  \n')
      : '';

    const content = `## 購入推奨度

### 総合評価: ${score}点/100点 (${scoreText})

${formattedRationale ? `**評価の理由**:\n${formattedRationale}\n` : ''}

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
   * 購入セクションを生成（下部）
   */
  private async generatePurchaseSection(
    product: Product,
    _affiliateTag: string,
    investigation?: InvestigationResult
  ): Promise<ArticleSection> {
    const affiliateLink = this.affiliateManager.generateLinkFromProduct(product);
    const affiliateUrl = affiliateLink.url;

    // ProductDetail型の追加フィールドを取得（存在すれば）
    const productDetail = product as any;

    // 商品情報の行を動的に構築
    const infoRows: string[] = [];
    infoRows.push(`| ASIN | ${product.asin} |`);
    infoRows.push(`| 現在価格 | ${product.price.formatted} |`);

    // カテゴリ
    if (product.category) {
      infoRows.push(`| カテゴリ | ${product.category} |`);
    }

    // ブランド
    if (productDetail.brand) {
      infoRows.push(`| ブランド | ${productDetail.brand} |`);
    } else if (productDetail.manufacturer) {
      infoRows.push(`| メーカー | ${productDetail.manufacturer} |`);
    }

    // モデル
    if (productDetail.model) {
      infoRows.push(`| モデル | ${productDetail.model} |`);
    }

    // 在庫状況
    if (productDetail.availability) {
      infoRows.push(`| 在庫状況 | ${productDetail.availability} |`);
    }

    // Prime対応
    if (productDetail.isPrimeEligible !== undefined) {
      infoRows.push(`| Prime対応 | ${productDetail.isPrimeEligible ? '✓ 対応' : '✗ 非対応'} |`);
    }

    // 発売日
    if (productDetail.releaseDate) {
      infoRows.push(`| 発売日 | ${this.formatDateToJST(productDetail.releaseDate)} |`);
    }

    // 外部ID（EAN/ISBN/UPC）
    if (productDetail.externalIds) {
      if (productDetail.externalIds.ean) {
        infoRows.push(`| EAN | ${productDetail.externalIds.ean} |`);
      }
      if (productDetail.externalIds.isbn) {
        infoRows.push(`| ISBN | ${productDetail.externalIds.isbn} |`);
      }
      if (productDetail.externalIds.upc) {
        infoRows.push(`| UPC | ${productDetail.externalIds.upc} |`);
      }
    }

    // 言語
    if (productDetail.languages && productDetail.languages.length > 0) {
      infoRows.push(`| 言語 | ${productDetail.languages.join(', ')} |`);
    }

    // 著者/出演者
    if (productDetail.contributors && productDetail.contributors.length > 0) {
      const contributorList = productDetail.contributors
        .slice(0, 3) // 上位3人まで
        .map((c: { name: string; role: string }) => `${c.name} (${c.role})`)
        .join(', ');
      infoRows.push(`| 著者/出演者 | ${contributorList} |`);
    }

    // 詳細スペック情報（technicalSpecs）を追加
    if (investigation?.analysis.technicalSpecs) {
      const specs = investigation.analysis.technicalSpecs;

      // 区切り行を追加
      infoRows.push(`| **--- スペック ---** | |`);

      // 基本スペック
      if (specs.os) infoRows.push(`| OS | ${specs.os} |`);
      if (specs.cpu) infoRows.push(`| CPU | ${specs.cpu} |`);
      if (specs.gpu) infoRows.push(`| GPU | ${specs.gpu} |`);
      if (specs.ram) infoRows.push(`| メモリ | ${specs.ram} |`);
      if (specs.storage) infoRows.push(`| ストレージ | ${specs.storage} |`);

      // ディスプレイ
      if (specs.display) {
        const displayParts = [];
        if (specs.display.size) displayParts.push(specs.display.size);
        if (specs.display.type) displayParts.push(specs.display.type);
        if (specs.display.resolution) displayParts.push(specs.display.resolution);
        if (specs.display.refreshRate) displayParts.push(`リフレッシュレート: ${specs.display.refreshRate}`);
        if (displayParts.length > 0) {
          infoRows.push(`| 画面 | ${displayParts.join(' / ')} |`);
        }
      }

      // バッテリー
      if (specs.battery) {
        const batteryParts = [];
        if (specs.battery.capacity) batteryParts.push(specs.battery.capacity);
        if (specs.battery.charging) batteryParts.push(specs.battery.charging);
        if (specs.battery.playbackTime) batteryParts.push(`再生時間: ${specs.battery.playbackTime}`);
        if (batteryParts.length > 0) {
          infoRows.push(`| バッテリー | ${batteryParts.join(' / ')} |`);
        }
      }

      // カメラ
      if (specs.camera) {
        const cameraParts = [];
        if (specs.camera.main) cameraParts.push(`メイン: ${specs.camera.main}`);
        if (specs.camera.ultrawide) cameraParts.push(`超広角: ${specs.camera.ultrawide}`);
        if (specs.camera.telephoto) cameraParts.push(`望遠: ${specs.camera.telephoto}`);
        if (specs.camera.front) cameraParts.push(`前面: ${specs.camera.front}`);
        if (cameraParts.length > 0) {
          infoRows.push(`| カメラ | ${cameraParts.join(' / ')} |`);
        }
      }

      // 寸法・重量
      if (specs.dimensions) {
        if (specs.dimensions.weight) {
          infoRows.push(`| 重量 | ${specs.dimensions.weight} |`);
        }
        const dimParts = [];
        if (specs.dimensions.height) dimParts.push(`高さ: ${specs.dimensions.height}`);
        if (specs.dimensions.width) dimParts.push(`幅: ${specs.dimensions.width}`);
        if (specs.dimensions.depth) dimParts.push(`奥行: ${specs.dimensions.depth}`);
        if (dimParts.length > 0) {
          infoRows.push(`| サイズ | ${dimParts.join(' / ')} |`);
        }
      }

      // イヤホン・ヘッドホン
      if (specs.driver) infoRows.push(`| ドライバー | ${specs.driver} |`);
      if (specs.codec && specs.codec.length > 0) {
        infoRows.push(`| 対応コーデック | ${specs.codec.join(', ')} |`);
      }
      if (specs.noiseCancel) infoRows.push(`| ノイズキャンセル | ${specs.noiseCancel} |`);

      // 家電
      if (specs.power) infoRows.push(`| 消費電力 | ${specs.power} |`);
      if (specs.capacity) infoRows.push(`| 容量 | ${specs.capacity} |`);

      // 接続性
      if (specs.connectivity && specs.connectivity.length > 0) {
        infoRows.push(`| 接続 | ${specs.connectivity.join(', ')} |`);
      }

      // 靴（シューズ）
      if (specs.width) infoRows.push(`| 幅（ワイズ） | ${specs.width} |`);
      if (specs.weight) infoRows.push(`| 重量 | ${specs.weight} |`);
      if (specs.midsole) infoRows.push(`| ミッドソール | ${specs.midsole} |`);
      if (specs.cushioningTech && specs.cushioningTech.length > 0) {
        infoRows.push(`| クッショニング | ${specs.cushioningTech.join(', ')} |`);
      }
      if (specs.heelCounter) infoRows.push(`| ヒールカウンター | ${specs.heelCounter} |`);
      if (specs.material) {
        if (typeof specs.material === 'string') {
          infoRows.push(`| 素材 | ${specs.material} |`);
        } else {
          const matParts = [];
          if (specs.material.upper) matParts.push(`アッパー: ${specs.material.upper}`);
          if (specs.material.outsole) matParts.push(`アウトソール: ${specs.material.outsole}`);
          if (specs.material.insole) matParts.push(`インソール: ${specs.material.insole}`);
          if (matParts.length > 0) {
            infoRows.push(`| 素材 | ${matParts.join(' / ')} |`);
          }
        }
      }
      if (specs.modelNumber) infoRows.push(`| 型番 | ${specs.modelNumber} |`);

      // その他スペック
      if (specs.other && specs.other.length > 0) {
        infoRows.push(`| その他 | ${specs.other.join(', ')} |`);
      }
    }

    const content = `## 🛒 商品詳細・購入

<div class="purchase-card">

### 商品情報

| 項目 | 内容 |
|:-----|:-----|
${infoRows.join('\n')}

<a href="${affiliateUrl}" class="btn-amazon-large" target="_blank" rel="noopener noreferrer">🛒 Amazonで購入する</a>

</div>

*最新の価格は、購入前に必ずAmazonの商品ページでご確認ください。*`;

    return {
      title: '商品詳細・購入',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['商品情報', '購入リンク']
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
    const lines = [
      '---',
      `title: "${metadata.title}"`,
      `description: "${metadata.description}"`,
      `date: ${metadata.publishDate.toISOString().split('T')[0]}`,
      `categories: ["${metadata.category}"]`
    ];

    if (metadata.subcategory) lines.push(`subcategory: "${metadata.subcategory}"`);
    if (metadata.manufacturer) lines.push(`manufacturer: "${metadata.manufacturer}"`);

    lines.push(`asin: "${metadata.asin}"`);
    lines.push(`price_range: "${metadata.priceRange}"`);

    if (metadata.price) lines.push(`price: "${metadata.price}"`);
    if (metadata.score) lines.push(`score: ${metadata.score}`);

    if (metadata.rating) lines.push(`rating: ${metadata.rating}`);

    lines.push(`tags: [${metadata.tags.map(tag => `"${tag}"`).join(', ')}]`);
    lines.push(`keywords: [${metadata.seoKeywords.map(keyword => `"${keyword}"`).join(', ')}]`);
    lines.push(`featured: ${metadata.featured}`);
    lines.push(`mobile_optimized: ${metadata.mobileOptimized}`);
    lines.push(`last_investigated: "${metadata.lastInvestigated || ''}"`);

    // Add images for Hugo template (used on home page)
    if (metadata.images && metadata.images.length > 0) {
      lines.push(`images: [${metadata.images.map(img => `"${img}"`).join(', ')}]`);
    }

    // Add technical specs (flattened for Hugo template)
    if (metadata.technicalSpecs) {
      const specs = metadata.technicalSpecs;
      lines.push('specs:');

      // 基本スペック
      if (specs.os) lines.push(`  os: "${specs.os}"`);
      if (specs.cpu) lines.push(`  cpu: "${specs.cpu}"`);
      if (specs.gpu) lines.push(`  gpu: "${specs.gpu}"`);
      if (specs.ram) lines.push(`  ram: "${specs.ram}"`);
      if (specs.storage) lines.push(`  storage: "${specs.storage}"`);

      // ディスプレイ
      if (specs.display) {
        if (specs.display.size) lines.push(`  display_size: "${specs.display.size}"`);
        if (specs.display.resolution) lines.push(`  display_resolution: "${specs.display.resolution}"`);
        if (specs.display.type) lines.push(`  display_type: "${specs.display.type}"`);
        if (specs.display.refreshRate) lines.push(`  display_refresh_rate: "${specs.display.refreshRate}"`);
      }

      // バッテリー
      if (specs.battery) {
        if (specs.battery.capacity) lines.push(`  battery_capacity: "${specs.battery.capacity}"`);
        if (specs.battery.charging) lines.push(`  battery_charging: "${specs.battery.charging}"`);
        if (specs.battery.playbackTime) lines.push(`  battery_playback_time: "${specs.battery.playbackTime}"`);
      }

      // カメラ
      if (specs.camera) {
        if (specs.camera.main) lines.push(`  camera_main: "${specs.camera.main}"`);
        if (specs.camera.ultrawide) lines.push(`  camera_ultrawide: "${specs.camera.ultrawide}"`);
        if (specs.camera.telephoto) lines.push(`  camera_telephoto: "${specs.camera.telephoto}"`);
        if (specs.camera.front) lines.push(`  camera_front: "${specs.camera.front}"`);
      }

      // 寸法・重量
      if (specs.dimensions) {
        if (specs.dimensions.height) lines.push(`  height: "${specs.dimensions.height}"`);
        if (specs.dimensions.width) lines.push(`  width: "${specs.dimensions.width}"`);
        if (specs.dimensions.depth) lines.push(`  depth: "${specs.dimensions.depth}"`);
        if (specs.dimensions.weight) lines.push(`  weight: "${specs.dimensions.weight}"`);
      }

      // イヤホン・ヘッドホン
      if (specs.driver) lines.push(`  driver: "${specs.driver}"`);
      if (specs.codec && specs.codec.length > 0) {
        lines.push(`  codec: [${specs.codec.map(c => `"${c}"`).join(', ')}]`);
      }
      if (specs.noiseCancel) lines.push(`  noise_cancel: "${specs.noiseCancel}"`);

      // 家電
      if (specs.power) lines.push(`  power: "${specs.power}"`);
      if (specs.capacity) lines.push(`  capacity: "${specs.capacity}"`);

      // 接続性
      if (specs.connectivity && specs.connectivity.length > 0) {
        lines.push(`  connectivity: [${specs.connectivity.map(c => `"${c}"`).join(', ')}]`);
      }

      // 靴（シューズ）
      if (specs.width) lines.push(`  width: "${specs.width}"`);
      if (specs.weight) lines.push(`  weight: "${specs.weight}"`);
      if (specs.midsole) lines.push(`  midsole: "${specs.midsole}"`);
      if (specs.cushioningTech && specs.cushioningTech.length > 0) {
        lines.push(`  cushioning_tech: [${specs.cushioningTech.map(c => `"${c}"`).join(', ')}]`);
      }
      if (specs.heelCounter) lines.push(`  heel_counter: "${specs.heelCounter}"`);
      if (specs.material) {
        if (typeof specs.material === 'string') {
          lines.push(`  material: "${specs.material}"`);
        } else {
          lines.push('  material:');
          if (specs.material.upper) lines.push(`    upper: "${specs.material.upper}"`);
          if (specs.material.outsole) lines.push(`    outsole: "${specs.material.outsole}"`);
          if (specs.material.insole) lines.push(`    insole: "${specs.material.insole}"`);
        }
      }
      if (specs.modelNumber) lines.push(`  model_number: "${specs.modelNumber}"`);

      // その他
      if (specs.other && specs.other.length > 0) {
        lines.push(`  other_specs: [${specs.other.map(o => `"${o}"`).join(', ')}]`);
      }
    }

    lines.push('---');

    return lines.join('\n');
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

  private shouldBeFeatured(_product: Product, investigation: InvestigationResult): boolean {
    // Jules調査の推奨スコアのみで判定（PA-API v5ではレビューデータ取得不可）
    return investigation.analysis.recommendation.score >= 80;
  }

  private convertTablesToMobileFriendly(content: string): string {
    // テーブルをレスポンシブコンテナでラップ（テーブル構造を保持）
    // Markdownテーブルはそのまま保持し、CSSで横スクロール対応にする
    return content;
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

      if (linkText && linkUrl && linkUrl.includes('amazon.co.jp') && (linkUrl.includes('tag=') || linkUrl.includes('/dp/'))) {
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

  /**
   * userImpressionをMarkdown引用ブロックとして正しくフォーマット
   * - Markdownの強調記号（**）を除去
   * - 複数行の場合は各行に引用記号を付与
   */
  private formatUserImpressionAsBlockquote(userImpression: string): string {
    // Markdownの強調記法（**text**）を除去
    let sanitized = userImpression.replace(/\*\*([^*]+)\*\*/g, '$1');

    // *text* 形式のイタリック記法も除去
    sanitized = sanitized.replace(/\*([^*]+)\*/g, '$1');

    // 全ての改行をスペースに変換して1つの連続したテキストにする
    sanitized = sanitized.replace(/\n+/g, ' ');

    // 連続するスペースを1つに正規化
    sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();

    // Markdownのblockquote記法「>」を使用
    return `> ${sanitized}`;
  }

  /**
   * 日付を日本時間（JST）の形式にフォーマット
   * 入力例: 2025-12-17T00:00:01Z -> 2025年12月17日
   */
  private formatDateToJST(dateString: string): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString;
      }

      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      return `${year}年${month}月${day}日`;
    } catch (_error) {
      return dateString;
    }
  }
}
