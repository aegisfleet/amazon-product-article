/**
 * Article_Generator - 調査結果からMarkdown記事として生成するコンポーネント
 */

import fs from 'node:fs';
import path from 'node:path';
import { AffiliateLinkManager } from '../affiliate/AffiliateLinkManager';
import type { ReviewAnalysisResult } from '../analysis/ReviewAnalyzer';
import { InvestigationFileSchema } from '../schemas/InvestigationSchema';
import type { AffiliateLink } from '../types/AffiliateTypes';
import type {
  ArticleMetadata,
  ArticleSection,
  ArticleTemplate,
  GeneratedArticle,
  TemplateSection,
} from '../types/ArticleTypes';
import type { InvestigationResult, TechnicalSpecs } from '../types/JulesTypes';
import type { Product, ProductDetail } from '../types/Product';
import { Logger } from '../utils/Logger';
import {
  DEFAULT_ARTICLE_TEMPLATE,
  DEFAULT_IMAGE_URL,
  HANDLED_SPEC_FIELDS,
  INVALID_PLACEHOLDERS,
  SPEC_LABEL_MAP,
  SPEC_VALUE_MAP,
} from './ArticleConstants';

export class ArticleGenerator {
  private static readonly REVIEW_AUTHOR_NAME = '編集部';

  private readonly logger: Logger;
  private readonly defaultTemplate: ArticleTemplate;
  private readonly affiliateManager: AffiliateLinkManager;
  // 調査結果ファイルのキャッシュ（記事生成プロセス中、同じ競合商品が何度も参照されるのを防ぐ）
  private readonly investigationCache: Map<string, InvestigationResult | null>;

  constructor() {
    this.logger = Logger.getInstance();
    this.defaultTemplate = DEFAULT_ARTICLE_TEMPLATE;
    this.affiliateManager = new AffiliateLinkManager();
    this.investigationCache = new Map();
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
    competitorDetails?: Map<string, ProductDetail>,
  ): Promise<GeneratedArticle> {
    this.logger.info('Starting article generation', {
      productAsin: product.asin,
      sessionId: investigation.sessionId,
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
        competitorDetails,
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
        affiliateLinks,
      };

      this.logger.info('Article generation completed', {
        productAsin: product.asin,
        wordCount,
        sectionsCount: sections.length,
        affiliateLinksCount: affiliateLinks.length,
      });

      return article;
    } catch (error) {
      this.logger.error('Failed to generate article', error);
      throw new Error(`Article generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        cause: error,
      });
    }
  }

  /**
   * SEOメタデータを生成
   */
  generateSEOMetadata(product: Product, investigation: InvestigationResult): ArticleMetadata {
    const productDetail = product as ProductDetail;
    // productName があればそれを使用、なければ ASIN からフォールバック
    const displayName = investigation.analysis.productName || `Product ${product.asin}`;
    // タイトルをシンプルに商品名のみにする
    const title = displayName;

    // card-excerpt用にproductDescriptionを使用（なければ従来の生成ロジックへフォールバック）
    const description =
      investigation.analysis.productDescription ||
      `${displayName}の実際のユーザーレビューを分析し、競合商品との比較を通じて購買判断をサポート`;

    const tags = this.generateTags(product, investigation);
    const seoKeywords = this.generateSEOKeywords(product, investigation);
    const priceRange = this.determinePriceRange(product.price.amount);
    const price = product.price.formatted;
    const score = investigation.analysis.recommendation.score;

    // 階層カテゴリ: Creators APIのcategoryInfoがあればそれを使用
    const subcategory = product.categoryInfo?.sub || this.determineSubcategory(product);
    const manufacturer = this.extractManufacturer(product);

    // Product images for Hugo front matter (primary + thumbnails)
    const images = [product.images.primary, ...product.images.thumbnails].filter(Boolean);

    // Fallback to default image if no images are available
    if (images.length === 0) {
      images.push(DEFAULT_IMAGE_URL);
    }

    // Affiliate URL generation
    const affiliateLink = this.affiliateManager.generateLinkFromProduct(product);
    const affiliateUrl = affiliateLink.url;

    const metadata: ArticleMetadata = {
      title,
      description,
      category: product.categoryInfo?.main || product.category,
      tags,
      publishDate: investigation.generatedAt || new Date(),
      asin: product.asin,
      priceRange,
      price,
      score,
      ...(product.rating.average > 0 && product.rating.average <= 5 ? { rating: product.rating.average } : {}),
      ...(product.rating.count > 0 ? { ratingCount: product.rating.count } : {}),
      featured: this.shouldBeFeatured(product, investigation),
      mobileOptimized: true,
      seoKeywords,
      is_amazon_direct: product.isAmazonDirect,
      affiliate_url: affiliateUrl,
      brand: product.brand,
      model: productDetail.model,
      releaseDate: this.formatToJapaneseDate(productDetail.releaseDate),
      loyalty_points: product.loyaltyPoints,
      deal_badge: product.dealBadge,
      savings_percentage: product.savingsPercentage,
    };

    if (product.availability !== undefined) {
      metadata.availability = product.availability;
    }

    if (subcategory) {
      metadata.subcategory = subcategory;
    }

    // APIから取得したmanufacturerがあれば最優先、なければextractManufacturerの結果
    const finalManufacturer = productDetail.manufacturer || manufacturer;
    if (finalManufacturer) {
      metadata.manufacturer = finalManufacturer;
    }

    if (investigation.analysis.lastInvestigated) {
      metadata.lastInvestigated = investigation.analysis.lastInvestigated;
    }
    if (images.length > 0) {
      metadata.images = images;
    }

    // 詳細スペック情報（technicalSpecs）があれば追加
    if (investigation.analysis.technicalSpecs) {
      metadata.technicalSpecs = investigation.analysis.technicalSpecs;
    }

    // Hero Front Matter Data
    const { plus, minus } = this.extractScoreRationaleItems(investigation.analysis.recommendation.scoreRationale);

    metadata.hero = {
      score_rationale: {
        plus,
        minus,
      },
      target_users: investigation.analysis.recommendation.targetUsers,
      warnings: investigation.analysis.recommendation.cons || [],
      specs: investigation.analysis.technicalSpecs || {},
      brand: metadata.brand,
      model: metadata.model,
      releaseDate: metadata.releaseDate,
      availability: metadata.availability,
    };

    const reviewSummary = this.extractVerifiedReviewSummary(investigation);
    if (reviewSummary) {
      metadata.review = {
        author: ArticleGenerator.REVIEW_AUTHOR_NAME,
        datePublished: this.resolveReviewDatePublished(metadata.publishDate),
        summary: reviewSummary,
        ...(metadata.rating === undefined ? {} : { rating: metadata.rating }),
      };
    }

    return metadata;
  }

  private extractVerifiedReviewSummary(investigation: InvestigationResult): string | undefined {
    const verifiedPrimarySource = investigation.analysis.sources.find(
      (source) =>
        source.evidenceType === 'primary' &&
        source.tier === 'high' &&
        source.notes &&
        source.notes.trim().length > 0 &&
        source.conflictOfInterest !== 'possible' &&
        source.conflictOfInterest !== 'unknown',
    );

    return verifiedPrimarySource?.notes?.trim();
  }

  private resolveReviewDatePublished(publishDate: Date): string {
    if (Number.isNaN(publishDate.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }

    return publishDate.toISOString().slice(0, 10);
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
    mobileContent = mobileContent.replaceAll(/<blockquote>[\s\S]*?<\/blockquote>/g, (match) => {
      blockquotes.push(match);
      return `__BLOCKQUOTE_${blockquotes.length - 1}__`;
    });

    // Markdown形式の「>」で始まる行を保護（連続する引用行をまとめて保護）
    mobileContent = mobileContent.replaceAll(/^> .+$/gm, (match) => {
      blockquotes.push(match);
      return `__BLOCKQUOTE_${blockquotes.length - 1}__`;
    });

    // ヒーローカードのごく短い説明文（span内）も段落分割から保護
    const heroDescriptions: string[] = [];
    mobileContent = mobileContent.replaceAll(/<span class="hero-score-item-desc">[\s\S]*?<\/span>/g, (match) => {
      heroDescriptions.push(match);
      return `__HERODESC_${heroDescriptions.length - 1}__`;
    });

    // ソース情報のspanタグ（長い説明文）を段落分割から保護
    const sourceSpans: string[] = [];
    mobileContent = mobileContent.replaceAll(/<span class="mobile-list-item">[\s\S]*?<\/span>/g, (match) => {
      sourceSpans.push(match);
      return `__SOURCESPAN_${sourceSpans.length - 1}__`;
    });

    // 長い段落を分割（blockquoteや保護されたspan以外のテキストにのみ適用）
    mobileContent = mobileContent.replaceAll(/(.{200}[^。！？]{0,100}[。！？])/g, '$1\n\n');

    // blockquoteを復元
    blockquotes.forEach((bq, i) => {
      mobileContent = mobileContent.replaceAll(`__BLOCKQUOTE_${i}__`, bq);
    });

    // ヒーロー説明文を復元
    heroDescriptions.forEach((bq, i) => {
      mobileContent = mobileContent.replaceAll(`__HERODESC_${i}__`, bq);
    });

    // ソース情報のspanを復元
    sourceSpans.forEach((bq, i) => {
      mobileContent = mobileContent.replaceAll(`__SOURCESPAN_${i}__`, bq);
    });

    // テーブルをモバイル対応形式に変換
    mobileContent = this.convertTablesToMobileFriendly(mobileContent);

    // 画像をモバイル対応のHTML形式に変換（onerrorハンドラを追加）
    mobileContent = mobileContent.replaceAll(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      `<img src="$2" alt="$1" class="mobile-responsive-image" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_URL}';">`,
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
      /(## (🛒 )?商品詳細(・購入)?)/,
      `$1\n\n<a href="${this.escapeHtml(affiliateUrl)}" class="affiliate-link mobile-friendly-button" target="_blank" rel="noopener noreferrer"><strong>${this.escapeHtml(product.asin)}をAmazonで確認する</strong></a>\n`,
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
    competitorDetails?: Map<string, ProductDetail>,
  ): Promise<ArticleSection[]> {
    const affiliateTag = affiliatePartnerTag || process.env.AMAZON_PARTNER_TAG || 'your-affiliate-tag';

    const sections: ArticleSection[] = [
      this.generateFeaturesSection(product, investigation),
      await this.generateUserReviewsSection(investigation, reviewAnalysis, template.sections.userReviews),
    ];

    if (competitorDetails) {
      sections.push(
        await this.generateCompetitiveAnalysisSection(
          investigation,
          template.sections.competitiveAnalysis,
          affiliateTag,
          competitorDetails,
        ),
      );
    }

    sections.push(
      this.generatePurchaseSection(product, affiliateTag, investigation),
      this.generateRecommendationSection(product, investigation, template.sections.recommendation),
    );

    // 情報ソース（もしあれば）
    if (investigation.analysis.sources && investigation.analysis.sources.length > 0) {
      const sourcesSection = this.generateSourcesSection(investigation);
      if (sourcesSection) {
        sections.push(sourcesSection);
      }
    }

    return sections;
  }

  /**
   * 購入セクションを生成
   */
  private generatePurchaseSection(
    product: Product,
    _affiliateTag: string,
    investigation: InvestigationResult,
  ): ArticleSection {
    // 基本情報行
    const infoRows: string[] = [
      `| ASIN | ${product.asin} |`,
      `| 現在価格 | ${product.price.formatted} |`,
      `| カテゴリ | ${product.categoryInfo?.main || product.category} |`,
    ];

    // 追加プロパティ（メーカー・ブランドなど）
    const productDetail = product as ProductDetail;
    if (productDetail.manufacturer) {
      infoRows.push(`| メーカー | ${productDetail.manufacturer} |`);
    }
    if (productDetail.brand) {
      infoRows.push(`| ブランド | ${productDetail.brand} |`);
    }
    if (productDetail.model) {
      infoRows.push(`| 型番 | ${productDetail.model} |`);
    }
    if (productDetail.releaseDate) {
      const formattedReleaseDate = this.formatToJapaneseDate(productDetail.releaseDate);
      infoRows.push(`| 発売日 | ${formattedReleaseDate} |`);
    }

    // 在庫・Amazon直販情報
    if (productDetail.availability) {
      infoRows.push(`| 在庫状況 | ${this.escapeHtml(productDetail.availability)} |`);
    }

    // EAN/ISBN/UPC
    if (productDetail.externalIds?.ean) {
      infoRows.push(`| EAN | ${productDetail.externalIds.ean} |`);
    } else if (productDetail.externalIds?.isbn) {
      infoRows.push(`| ISBN | ${productDetail.externalIds.isbn} |`);
    }

    // 詳細スペック（TechnicalSpecs）がある場合
    if (investigation.analysis.technicalSpecs) {
      const specs = investigation.analysis.technicalSpecs;
      const category = product.categoryInfo?.main || product.category;

      // 動的レンダリング: 未処理のフィールドを自動表示
      const additionalRows = this.renderDynamicSpecs(specs, category);
      if (additionalRows.length > 0) {
        // 追加スペックもメインの表に統合
        infoRows.push(...additionalRows);
      }
    }

    const content = `## 🛒 商品詳細

<div class="product-comparison">

| 項目 | 詳細 |
| :--- | :--- |
${infoRows.join('\n')}

</div>`;

    return {
      title: '商品詳細',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['商品詳細表', '購入リンク'],
    };
  }

  /**
   * 情報ソースセクションを生成
   * 意味のないソース（抽象的な名前）はフィルタリング、URLなしはプレーンテキスト
   */
  private generateSourcesSection(investigation: InvestigationResult): ArticleSection | null {
    // 除外するソース名のリスト（意味のない抽象的なソース）
    const excludedPatterns = [
      'category analysis',
      'general market knowledge',
      'market analysis',
      'product specifications',
      'internal analysis',
      'market research',
    ];

    // 有効なソースのみフィルタリング
    const validSources = investigation.analysis.sources.filter((source) => {
      const nameLower = source.name.toLowerCase();
      return !excludedPatterns.some((pattern) => nameLower.includes(pattern));
    });

    // 有効なソースがなければnullを返す（セクション非表示）
    if (validSources.length === 0) {
      return null;
    }

    // URLがあればリンク、なければプレーンテキスト
    // ただし、Creators APIのURLはユーザーには不要なためリンクを貼らない
    const sourcesList = validSources
      .map((source) => {
        const creatorsApiHost = 'webservices.amazon.co.jp';
        const creatorsApiPathPrefix = '/creators/v1';

        const isCreatorsApiUrl = (urlString: string): boolean => {
          try {
            const parsed = new URL(urlString);
            return parsed.hostname === creatorsApiHost && parsed.pathname.startsWith(creatorsApiPathPrefix);
          } catch {
            // URLとして解釈できない場合はCreators APIとはみなさない（従来動作に近づける）
            return false;
          }
        };

        const tierLabel: Record<'high' | 'medium' | 'low', string> = {
          high: '高',
          medium: '中',
          low: '低',
        };
        const evidenceTypeLabel: Record<'primary' | 'secondary', string> = {
          primary: '一次情報',
          secondary: '二次情報',
        };
        const conflictLabel: Record<'none' | 'possible' | 'disclosed' | 'unknown', string> = {
          none: '利害関係なし',
          possible: '利害関係の可能性あり',
          disclosed: '利害関係を開示',
          unknown: '利害関係不明',
        };

        const reasonParts = [
          source.tier ? `信頼度: ${tierLabel[source.tier]}` : null,
          source.evidenceType ? `情報種別: ${evidenceTypeLabel[source.evidenceType]}` : null,
          source.publishedAt ? `公開日: ${source.publishedAt.trim()}` : null,
          source.author ? `執筆主体: ${source.author.trim()}` : null,
          source.conflictOfInterest ? conflictLabel[source.conflictOfInterest] : null,
          source.notes ? `評価理由: ${source.notes.trim()}` : null,
        ].filter((part): part is string => Boolean(part));
        const reasonText = reasonParts.length > 0 ? `（${reasonParts.join(' / ')}）` : '';

        const sourceContent =
          source.url && !isCreatorsApiUrl(source.url)
            ? `<a href="${this.escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(source.name.trim())}</a> ${this.escapeHtml(reasonText)}`
            : `${this.escapeHtml(source.name.trim())} ${this.escapeHtml(reasonText)}`;

        // 物理的な 1 行に強制するため、あらゆる改行文字を削除し、空白を集約する
        const line = `- <span class="mobile-list-item">${sourceContent}</span>`;
        return line.replaceAll(String.raw`\n`, ' ').replaceAll(/\s+/g, ' ').trim();
      })
      .join('\n');

    const content = `## 🔗 参考情報ソース

本記事の作成にあたり、以下の情報を参照しました：

${sourcesList}`;

    return {
      title: '🔗 参考情報ソース',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['情報ソース一覧'],
    };
  }

  /**
   * 商品の特徴と使い方セクションを生成
   */
  private generateFeaturesSection(_product: Product, investigation: InvestigationResult): ArticleSection {
    // 使用シーン
    const useCases = investigation.analysis.useCases
      .slice(0, 4) // 上位4つに制限
      .map((useCase, i) => {
        const icons = ['💡', '🎯', '✨', '🔧'];
        return `<div class="feature-card">
<span class="feature-icon">${icons[i] || '📌'}</span>
<span class="feature-text">${this.escapeHtml(useCase)}</span>
</div>`;
      })
      .join('\n');

    // 使い方（productUsageがあれば使用）
    const productUsage = investigation.analysis.productUsage;
    let usageSection = '';
    if (productUsage && productUsage.length > 0) {
      const usageList = productUsage.map((usage, i) => `${i + 1}. ${usage}`).join('\n');
      usageSection = `### 🔧 使い方\n\n${usageList}`;
    }

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
      requiredElements: ['仕様', '使用シーン'],
    };
  }

  /**
   * ユーザーレビューセクションを生成
   */
  private async generateUserReviewsSection(
    investigation: InvestigationResult,
    reviewAnalysis: ReviewAnalysisResult | undefined,
    template: TemplateSection,
  ): Promise<ArticleSection> {
    await Promise.resolve();
    const positivePoints = investigation.analysis.positivePoints.map((point) => `- ${point}`).join('\n');

    const negativePoints = investigation.analysis.negativePoints.map((point) => `- ${point}`).join('\n');

    const useCases = investigation.analysis.useCases.map((useCase) => `- ${useCase}`).join('\n');

    // ユーザーストーリーのフィルタリング（「推測」という言葉を含む内容を除去）
    const filteredUserStories = (investigation.analysis.userStories || []).filter(
      (story) => !story.experience.includes('推測'),
    );

    const filteredUserImpression = investigation.analysis.userImpression || '';

    // ユーザーストーリーの生成
    const userImpressionBlock = filteredUserImpression
      ? this.formatUserImpressionAsBlockquote(filteredUserImpression)
      : '';

    const userStoriesBlock = filteredUserStories
      .map((story) => {
        let sentimentLabel = '普通';
        if (story.sentiment === 'positive') {
          sentimentLabel = '満足';
        } else if (story.sentiment === 'negative') {
          sentimentLabel = '不満';
        }

        return `#### ${this.escapeHtml(story.userType)}の体験談 (${this.escapeHtml(story.scenario)})

> ${this.escapeHtml(story.experience)}
>
> (評価: ${this.escapeHtml(sentimentLabel)})`;
      })
      .join('\n\n');

    const userStories =
      filteredUserStories.length > 0 || filteredUserImpression
        ? `### 🗣️ 購入者の声\n${userImpressionBlock}\n\n${userStoriesBlock}`
        : '';

    const content = `## 📊 ユーザーレビュー

### 👍 ユーザーが評価している点

${positivePoints}

### 👎 ユーザーが気になると感じている点

${negativePoints}

### 💡 実際の使用シーン

${useCases}

${userStories}

${reviewAnalysis ? this.generateSentimentAnalysis(reviewAnalysis) : ''}`;

    return {
      title: '📊 ユーザーレビュー',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements,
    };
  }

  /**
   * 競合分析セクションを生成（カード形式で競合商品リンク付き）
   * Creators APIで情報が取得できなかった競合商品は非表示にする
   */
  private async generateCompetitiveAnalysisSection(
    investigation: InvestigationResult,
    template: TemplateSection,
    _affiliateTag: string,
    competitorDetails?: Map<string, ProductDetail>,
  ): Promise<ArticleSection> {
    const competitors = investigation.analysis.competitiveAnalysis;

    // 各競合商品をカード形式で表示
    const competitorCards = (
      await Promise.all(
        competitors.map(async (competitor) => {
          // Creators APIから取得した競合商品の詳細情報
          const isValidAsin = typeof competitor.asin === 'string' && /^[A-Z0-9]{10}$/i.test(competitor.asin);
          const normalizedAsin = isValidAsin && competitor.asin ? competitor.asin.toUpperCase() : undefined;
          const detail = normalizedAsin ? competitorDetails?.get(normalizedAsin) : undefined;

          // 調査済み記事が存在するかチェック
          let competitorInvestigation: InvestigationResult | null = null;
          if (normalizedAsin) {
            competitorInvestigation = await this.loadCompetitorInvestigation(normalizedAsin);
          }

          const hasInternalReview = !!competitorInvestigation;
          const competitorScore = competitorInvestigation?.analysis?.recommendation?.score;
          const internalLink = hasInternalReview
            ? `<a href="../${normalizedAsin?.toLowerCase()}/" class="btn-internal-small">📄 サイト内レビュー</a>`
            : '';

          // 商品プレビュー（Creators API情報がある場合）
          const productPreview = detail
            ? this.renderCompetitorPreview(
                competitor.name,
                detail,
                investigation.product.price.amount,
                competitorScore,
                hasInternalReview,
                normalizedAsin,
                competitorInvestigation?.analysis?.technicalSpecs,
              )
            : '';

          // アフィリエイトリンクを生成
          const shouldShowLink = normalizedAsin && (!competitorDetails || competitorDetails.has(normalizedAsin));
          const competitorLink = shouldShowLink
            ? `<a href="${this.escapeHtml(detail?.detailPageUrl || this.affiliateManager.generateAffiliateLink(normalizedAsin).url)}" class="btn-amazon-small" target="_blank" rel="noopener noreferrer">🛒 Amazonで見る</a>`
            : '';

          const productName = investigation.analysis.productName || investigation.product.title;
          const competitorName = competitor.name;
          const normalize = (text: string): string =>
            text.replaceAll('対象商品', `「${productName}」`).replaceAll('競合商品', `「${competitorName}」`);

          const priceComparison = normalize(competitor.priceComparison);

          const features = competitor.featureComparison.map((feature) => `<li>${normalize(feature)}</li>`).join('\n');

          const differentiators = competitor.differentiators.map((diff) => `<li>${normalize(diff)}</li>`).join('\n');

          return `<div class="competitor-card">
<h4>${this.escapeHtml(competitor.name)}</h4>
<p class="competitor-price">💰 ${this.escapeHtml(priceComparison)}</p>
<div class="competitor-features">
<strong>比較ポイント:</strong>
<ul>
${features}
</ul>
</div>
<div class="competitor-diff">
<strong>選び方のポイント:</strong>
<ul>
${differentiators}
</ul>
</div>
${productPreview}
<div class="competitor-links">
${internalLink}
${competitorLink}
</div>
</div>`;
        }),
      )
    ).join('\n\n');

    const content = `## 🥊 競合商品との比較

<div class="competitor-cards">

${competitorCards}

</div>

### ⚔️ 総合的な競合優位性

<div class="pros-cons-grid">

<div class="pros-card">
<h4>👍 良い点</h4>

${investigation.analysis.recommendation.pros.map((pro) => `- ${pro}`).join('\n')}

</div>

<div class="cons-card">
<h4>👎 気になる点</h4>

${investigation.analysis.recommendation.cons.map((con) => `- ${con}`).join('\n')}

</div>

</div>`;

    return {
      title: '競合商品との比較',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements,
    };
  }

  /**
   * 推奨度セクションを生成
   */
  private generateRecommendationSection(
    product: Product,
    investigation: InvestigationResult,
    template: TemplateSection,
  ): ArticleSection {
    const affiliateLink = this.affiliateManager.generateLinkFromProduct(product);
    const affiliateUrl = affiliateLink.url;

    const targetUsers = investigation.analysis.recommendation.targetUsers.map((user) => `- ${user}`).join('\n');

    const score = investigation.analysis.recommendation.score;
    const scoreText = this.getScoreDescription(score);

    let recommendationMessage: string;
    if (score >= 80) {
      recommendationMessage = '自信を持っておすすめできる商品です。';
    } else if (score >= 60) {
      recommendationMessage = '用途を限定すれば良い選択肢となります。';
    } else {
      recommendationMessage = '購入前に他の選択肢も検討することをおすすめします。';
    }

    const content = `## 🎯 最終結論：この商品は買いか？

### こんな方におすすめ

${targetUsers}

### 購入時の注意点

${investigation.analysis.recommendation.cons.map((con) => `- ⚠️ ${con}`).join('\n')}

### コストパフォーマンス評価

この商品は${scoreText}の評価となりました。特に${investigation.analysis.recommendation.pros[0] || '品質面'}での優位性が認められます。

${recommendationMessage}

<div class="final-recommendation-action">
<a href="${this.escapeHtml(affiliateUrl)}" class="btn-amazon-large" target="_blank" rel="noopener noreferrer">Amazonで詳細を見る</a>
</div>`;

    return {
      title: '🎯 最終結論：この商品は買いか？',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements,
    };
  }

  /**
   * 動的スペックレンダリング
   * 既存ロジックで処理されていないフィールドを自動的に表示
   */
  private renderDynamicSpecs(specs: TechnicalSpecs, category?: string): string[] {
    const rows: string[] = [];

    for (const [key, value] of Object.entries(specs)) {
      // 既に処理済みのフィールドはスキップ
      if (HANDLED_SPEC_FIELDS.has(key)) continue;
      // nullまたはundefinedはスキップ
      if (value === null || value === undefined) continue;

      const label = this.getSpecLabel(key, category);

      const formattedValue = this.formatSpecValue(value, category);
      if (formattedValue && formattedValue !== 'null') {
        rows.push(`| ${label} | ${formattedValue} |`);
      }
    }

    return rows;
  }

  /**
   * フィールド名をフォーマット（camelCase → スペース区切り）
   */
  private formatFieldName(fieldName: string): string {
    // snake_case / kebab-case / camelCase をスペース区切りに変換
    return fieldName
      .replaceAll(/[_-]+/g, ' ')
      .replaceAll(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replaceAll(/\s+/g, ' ')
      .trim();
  }

  /**
   * 英語で返ってくることが多い値を日本語に変換
   */
  private localizeSpecValue(value: string): string {
    const normalizedKey = value.toLowerCase();
    return SPEC_VALUE_MAP[normalizedKey] || value;
  }

  /**
   * スペック値を表示用にフォーマット
   */
  private formatSpecValue(value: unknown, category?: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      const normalized = value
        .trim()
        .replaceAll(/(?<!\d)\s*,\s*|\s*,\s*(?!\d)/g, ', ')
        .replaceAll(/\s+/g, ' ');
      const lowerValue = normalized.toLowerCase();
      const compactValue = lowerValue.replaceAll(/\s+/g, '');
      if (INVALID_PLACEHOLDERS.has(lowerValue) || INVALID_PLACEHOLDERS.has(compactValue)) {
        return '';
      }
      return normalized
        .split(/(?<!\d),(?!\d)/)
        .map((item) => this.localizeSpecValue(item.trim()))
        .join(', ');
    }

    if (typeof value === 'boolean') {
      return value ? 'あり' : 'なし';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (Array.isArray(value)) {
      // 配列内の各要素をフォーマットし、空（プレースホルダー等）を除外
      const formatted = value.map((item) => this.formatSpecValue(item, category)).filter((item) => item !== '');
      return formatted.join(', ');
    }

    if (typeof value === 'object') {
      return this.formatObjectValue(value as Record<string, unknown>, category);
    }

    // primitiveとして安全に文字列化（symbol, bigintなど）
    if (typeof value === 'symbol' || typeof value === 'bigint') {
      return value.toString();
    }

    return '';
  }

  /**
   * オブジェクト値をフォーマット
   */
  private formatObjectValue(obj: Record<string, unknown>, category?: string): string {
    return Object.entries(obj)
      .filter(([, val]) => val !== null && val !== undefined)
      .map(([key, val]) => {
        const label = this.getSpecLabel(key, category);
        return this.formatEntryForObject(label, val, category);
      })
      .filter((entry) => entry !== '')
      .join(' / ');
  }

  /**
   * 個別のエントリをオブジェクト形式用にフォーマット
   */
  private formatEntryForObject(label: string, val: unknown, category?: string): string {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      const formattedVal = this.formatSpecValue(val, category);
      return formattedVal !== '' && formattedVal !== 'null' ? `${label}: ${formattedVal}` : '';
    }

    if (Array.isArray(val)) {
      const formattedArray = val.map((v) => this.formatSpecValue(v, category)).filter((v) => v !== '' && v !== 'null');
      return formattedArray.length > 0 ? `${label}: ${formattedArray.join(', ')}` : '';
    }

    if (typeof val === 'object' && val !== null) {
      // ネストされたオブジェクトは再帰的に処理
      return `${label}: ${this.formatObjectValue(val as Record<string, unknown>, category)}`;
    }

    return '';
  }

  /**
   * スペックのラベル名を取得（マッピングとカテゴリ考慮）
   */
  private getSpecLabel(key: string, category?: string): string {
    let label = SPEC_LABEL_MAP[key] || this.formatFieldName(key);

    // カテゴリに応じたラベルの調整
    if (key === 'power') {
      const lensesCategories = ['ソフトコンタクトレンズ', 'コンタクトレンズ・ケア用品'];
      if (category && lensesCategories.includes(category)) {
        label = '度数';
      }
    }

    return label;
  }

  /**
   * 記事を組み立て
   */
  private assembleArticle(sections: ArticleSection[], metadata: ArticleMetadata): string {
    const frontMatter = this.generateFrontMatter(metadata);
    const sectionsContent = sections.map((section) => section.content).join('\n\n');

    return `${frontMatter}\n\n${sectionsContent}`;
  }

  /**
   * フロントマターを生成
   */
  private escapeForFrontMatter(value: string): string {
    return value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
  }

  private generateFrontMatter(metadata: ArticleMetadata): string {
    const lines = ['---'];

    this.addCoreMetadata(lines, metadata);
    this.addProductIdentifiers(lines, metadata);
    this.addMetricsMetadata(lines, metadata);
    this.addSEOAndSocialMetadata(lines, metadata);

    // Add technical specs (flattened for Hugo template)
    if (metadata.technicalSpecs) {
      this.addTechnicalSpecs(lines, metadata.technicalSpecs);
    }

    // Add Hero Data
    if (metadata.hero) {
      this.addHeroData(lines, metadata.hero);
    }

    lines.push('---');

    return lines.join('\n');
  }

  /**
   * テキストスペック全体を追加
   */
  private addTechnicalSpecs(lines: string[], specs: TechnicalSpecs): void {
    lines.push('specs:');
    const addedKeys = new Set<string>();

    this.addBasicSpecs(lines, addedKeys, specs);
    this.addDisplaySpecs(lines, addedKeys, specs);
    this.addBatterySpecs(lines, addedKeys, specs);
    this.addCameraSpecs(lines, addedKeys, specs);
    this.addDimensionSpecs(lines, addedKeys, specs);
    this.addAudioSpecs(lines, addedKeys, specs);
    this.addElectronicsSpecs(lines, addedKeys, specs);
    this.addConnectivitySpecs(lines, addedKeys, specs);
    this.addShoeSpecs(lines, addedKeys, specs);
    this.addLoadCapacitySpecs(lines, addedKeys, specs);
    this.addAttachmentSpecs(lines, addedKeys, specs);
    this.addOtherSpecs(lines, addedKeys, specs);
  }

  /**
   * フロントマターにスペック項目を追加（重複・空値チェック込み）
   */
  private addFrontMatterSpec(lines: string[], addedKeys: Set<string>, key: string, value: string): void {
    if (addedKeys.has(key)) return;
    if (value === '""' || value === '') return;

    lines.push(`  ${key}: ${value}`);
    addedKeys.add(key);
  }

  private addBasicSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (specs.os) this.addFrontMatterSpec(lines, addedKeys, 'os', `"${this.formatSpecValue(specs.os)}"`);
    if (specs.cpu) this.addFrontMatterSpec(lines, addedKeys, 'cpu', `"${this.formatSpecValue(specs.cpu)}"`);
    if (specs.processor)
      this.addFrontMatterSpec(lines, addedKeys, 'processor', `"${this.formatSpecValue(specs.processor)}"`);
    if (specs.gpu) this.addFrontMatterSpec(lines, addedKeys, 'gpu', `"${this.formatSpecValue(specs.gpu)}"`);
    if (specs.ram) this.addFrontMatterSpec(lines, addedKeys, 'ram', `"${this.formatSpecValue(specs.ram)}"`);
    if (specs.memory) this.addFrontMatterSpec(lines, addedKeys, 'memory', `"${this.formatSpecValue(specs.memory)}"`);
    if (specs.storage) this.addFrontMatterSpec(lines, addedKeys, 'storage', `"${this.formatSpecValue(specs.storage)}"`);
    if (specs.quantity)
      this.addFrontMatterSpec(lines, addedKeys, 'quantity', `"${this.formatSpecValue(specs.quantity)}"`);
    if (specs.content) this.addFrontMatterSpec(lines, addedKeys, 'content', `"${this.formatSpecValue(specs.content)}"`);
    if (specs.count) this.addFrontMatterSpec(lines, addedKeys, 'count', `"${this.formatSpecValue(specs.count)}"`);
    if (specs.capacity)
      this.addFrontMatterSpec(lines, addedKeys, 'capacity', `"${this.formatSpecValue(specs.capacity)}"`);
  }

  private addDisplaySpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.display) return;
    if (specs.display.size)
      this.addFrontMatterSpec(lines, addedKeys, 'display_size', `"${this.escapeForFrontMatter(specs.display.size)}"`);
    if (specs.display.resolution)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'display_resolution',
        `"${this.escapeForFrontMatter(specs.display.resolution)}"`,
      );
    if (specs.display.type)
      this.addFrontMatterSpec(lines, addedKeys, 'display_type', `"${this.escapeForFrontMatter(specs.display.type)}"`);
    if (specs.display.refreshRate)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'display_refresh_rate',
        `"${this.escapeForFrontMatter(specs.display.refreshRate)}"`,
      );
  }

  private addBatterySpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.battery) return;
    if (specs.battery.capacity)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'battery_capacity',
        `"${this.escapeForFrontMatter(specs.battery.capacity)}"`,
      );
    if (specs.battery.charging)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'battery_charging',
        `"${this.escapeForFrontMatter(specs.battery.charging)}"`,
      );
    if (specs.battery.playbackTime)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'battery_playback_time',
        `"${this.escapeForFrontMatter(specs.battery.playbackTime)}"`,
      );
  }

  private addCameraSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.camera) return;
    if (specs.camera.main)
      this.addFrontMatterSpec(lines, addedKeys, 'camera_main', `"${this.escapeForFrontMatter(specs.camera.main)}"`);
    if (specs.camera.ultrawide)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'camera_ultrawide',
        `"${this.escapeForFrontMatter(specs.camera.ultrawide)}"`,
      );
    if (specs.camera.telephoto)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'camera_telephoto',
        `"${this.escapeForFrontMatter(specs.camera.telephoto)}"`,
      );
    if (specs.camera.front)
      this.addFrontMatterSpec(lines, addedKeys, 'camera_front', `"${this.escapeForFrontMatter(specs.camera.front)}"`);
  }

  private addDimensionSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.dimensions) return;
    const { height, width, depth, weight } = specs.dimensions;
    if (height) this.addFrontMatterSpec(lines, addedKeys, 'height', `"${this.formatSpecValue(height)}"`);
    if (width) this.addFrontMatterSpec(lines, addedKeys, 'width', `"${this.formatSpecValue(width)}"`);
    if (depth) this.addFrontMatterSpec(lines, addedKeys, 'depth', `"${this.formatSpecValue(depth)}"`);
    if (weight) this.addFrontMatterSpec(lines, addedKeys, 'weight', `"${this.formatSpecValue(weight)}"`);
  }

  private addAudioSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (specs.driver) this.addFrontMatterSpec(lines, addedKeys, 'driver', `"${this.formatSpecValue(specs.driver)}"`);
    if (specs.codec) {
      this.addFrontMatterSpec(lines, addedKeys, 'codec', this.formatArrayForFrontMatter(specs.codec));
    }
    if (specs.noiseCancel)
      this.addFrontMatterSpec(lines, addedKeys, 'noise_cancel', `"${this.formatSpecValue(specs.noiseCancel)}"`);
  }

  private addElectronicsSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (specs.power) this.addFrontMatterSpec(lines, addedKeys, 'power', `"${this.formatSpecValue(specs.power)}"`);
    if (specs.capacity)
      this.addFrontMatterSpec(lines, addedKeys, 'capacity', `"${this.formatSpecValue(specs.capacity)}"`);
    if (specs.contentVolume)
      this.addFrontMatterSpec(lines, addedKeys, 'content_volume', `"${this.formatSpecValue(specs.contentVolume)}"`);
    if (specs.quantity)
      this.addFrontMatterSpec(lines, addedKeys, 'quantity', `"${this.formatSpecValue(specs.quantity)}"`);
    if (specs.content) this.addFrontMatterSpec(lines, addedKeys, 'content', `"${this.formatSpecValue(specs.content)}"`);
    if (specs.count) this.addFrontMatterSpec(lines, addedKeys, 'count', `"${this.formatSpecValue(specs.count)}"`);
    if (specs.category)
      this.addFrontMatterSpec(lines, addedKeys, 'spec_category', `"${this.formatSpecValue(specs.category)}"`);
  }

  private addConnectivitySpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.connectivity) return;
    this.addFrontMatterSpec(lines, addedKeys, 'connectivity', this.formatArrayForFrontMatter(specs.connectivity));
  }

  private addShoeSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (specs.width) this.addFrontMatterSpec(lines, addedKeys, 'width', `"${this.formatSpecValue(specs.width)}"`);
    if (specs.weight) this.addFrontMatterSpec(lines, addedKeys, 'weight', `"${this.formatSpecValue(specs.weight)}"`);
    if (specs.midsole) this.addFrontMatterSpec(lines, addedKeys, 'midsole', `"${this.formatSpecValue(specs.midsole)}"`);
    if (specs.cushioningTech) {
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'cushioning_tech',
        this.formatArrayForFrontMatter(specs.cushioningTech),
      );
    }
    if (specs.heelCounter)
      this.addFrontMatterSpec(lines, addedKeys, 'heel_counter', `"${this.formatSpecValue(specs.heelCounter)}"`);
    if (specs.heelHeight)
      this.addFrontMatterSpec(lines, addedKeys, 'heel_height', `"${this.formatSpecValue(specs.heelHeight)}"`);

    this.addMaterialSpecs(lines, addedKeys, specs);
    this.addModelAndOriginSpecs(lines, addedKeys, specs);
  }

  private addMaterialSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (specs.material) {
      this.addDetailedMaterialSpecs(lines, addedKeys, specs.material);
    }

    if (specs.upperMaterial) this.addFrontMatterSpec(lines, addedKeys, 'upper_material', `"${specs.upperMaterial}"`);
    if (specs.midsoleMaterial)
      this.addFrontMatterSpec(lines, addedKeys, 'midsole_material', `"${specs.midsoleMaterial}"`);
    if (specs.outsoleMaterial)
      this.addFrontMatterSpec(lines, addedKeys, 'outsole_material', `"${specs.outsoleMaterial}"`);
    if (specs.outerSole) this.addFrontMatterSpec(lines, addedKeys, 'outer_sole', `"${specs.outerSole}"`);
    if (specs.insoleMaterial) this.addFrontMatterSpec(lines, addedKeys, 'insole_material', `"${specs.insoleMaterial}"`);
    if (specs.innerSole) this.addFrontMatterSpec(lines, addedKeys, 'inner_sole', `"${specs.innerSole}"`);
    if (specs.insole) this.addFrontMatterSpec(lines, addedKeys, 'insole', `"${specs.insole}"`);
  }

  private addDetailedMaterialSpecs(
    lines: string[],
    addedKeys: Set<string>,
    material: Required<TechnicalSpecs>['material'],
  ): void {
    if (addedKeys.has('material')) return;

    if (typeof material === 'string') {
      lines.push(`  material: "${material}"`);
    } else if (material) {
      lines.push('  material:');
      if (material.upper) lines.push(`    upper: "${material.upper}"`);
      if (material.outsole) lines.push(`    outsole: "${material.outsole}"`);
      if (material.insole) lines.push(`    insole: "${material.insole}"`);
    }
    addedKeys.add('material');
  }

  private addModelAndOriginSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (specs.modelNumber)
      this.addFrontMatterSpec(lines, addedKeys, 'model_number', `"${this.formatSpecValue(specs.modelNumber)}"`);
    if (specs.model) this.addFrontMatterSpec(lines, addedKeys, 'model', `"${this.formatSpecValue(specs.model)}"`);
    if (specs.countryOfOrigin)
      this.addFrontMatterSpec(
        lines,
        addedKeys,
        'country_of_origin',
        `"${this.formatSpecValue(specs.countryOfOrigin)}"`,
      );
  }

  private addLoadCapacitySpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.loadCapacity) return;
    if (addedKeys.has('load_capacity')) return;

    if (typeof specs.loadCapacity === 'string') {
      lines.push(`  load_capacity: "${specs.loadCapacity}"`);
    } else {
      lines.push('  load_capacity:');
      for (const [key, value] of Object.entries(specs.loadCapacity)) {
        lines.push(`    ${key}: "${value}"`);
      }
    }
    addedKeys.add('load_capacity');
  }

  private addAttachmentSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.attachments) return;
    this.addFrontMatterSpec(lines, addedKeys, 'attachments', this.formatArrayForFrontMatter(specs.attachments));
  }

  private addOtherSpecs(lines: string[], addedKeys: Set<string>, specs: TechnicalSpecs): void {
    if (!specs.other) return;
    this.addFrontMatterSpec(lines, addedKeys, 'other_specs', this.formatArrayForFrontMatter(specs.other));
  }

  private addHeroData(lines: string[], hero: ArticleMetadata['hero']): void {
    if (!hero) return;
    lines.push('hero:');

    this.addHeroScoreRationale(lines, hero.score_rationale);

    if (hero.warnings && hero.warnings.length > 0) {
      lines.push(`  target_users: ${this.formatArrayForFrontMatter(hero.target_users)}`);
    }

    if (hero.warnings && hero.warnings.length > 0) {
      lines.push(`  warnings: ${this.formatArrayForFrontMatter(hero.warnings)}`);
    }

    if (hero.availability) {
      lines.push(`  availability: "${this.escapeForFrontMatter(hero.availability)}"`);
    }

    this.addHeroSpecs(lines, hero.specs);
  }

  private addHeroScoreRationale(
    lines: string[],
    rationale: NonNullable<ArticleMetadata['hero']>['score_rationale'],
  ): void {
    if (!rationale) return;
    lines.push('  score_rationale:');
    const { plus, minus } = rationale;

    if (plus && plus.length > 0) {
      lines.push('    plus:');
      for (const item of plus) {
        lines.push('      - points: ' + item.points);
        lines.push('        desc: "' + this.escapeForFrontMatter(item.desc) + '"');
      }
    }

    if (minus && minus.length > 0) {
      lines.push('    minus:');
      for (const item of minus) {
        lines.push('      - points: ' + item.points);
        lines.push('        desc: "' + this.escapeForFrontMatter(item.desc) + '"');
      }
    }
  }

  private addHeroSpecs(lines: string[], specs: TechnicalSpecs): void {
    if (!specs) return;
    lines.push('  specs:');
    for (const [key, value] of Object.entries(specs)) {
      if (value) {
        lines.push(`    ${key}: "${this.escapeForFrontMatter(this.formatSpecValue(value))}"`);
      }
    }
  }

  // Helper methods
  private addCoreMetadata(lines: string[], metadata: ArticleMetadata): void {
    lines.push(
      `title: "${this.escapeForFrontMatter(metadata.title)}"`,
      `description: "${this.escapeForFrontMatter(metadata.description)}"`,
      `date: ${metadata.publishDate.toISOString().split('T')[0]}`,
      `categories: ["${this.escapeForFrontMatter(metadata.category)}"]`,
    );
    if (metadata.subcategory) lines.push(`subcategory: "${this.escapeForFrontMatter(metadata.subcategory)}"`);
    if (metadata.brand) lines.push(`brand: "${this.escapeForFrontMatter(metadata.brand)}"`);
    if (metadata.manufacturer) lines.push(`manufacturer: "${this.escapeForFrontMatter(metadata.manufacturer)}"`);
  }

  private addProductIdentifiers(lines: string[], metadata: ArticleMetadata): void {
    lines.push(`asin: "${metadata.asin}"`, `price_range: "${metadata.priceRange}"`);
    if (metadata.price) lines.push(`price: "${this.escapeForFrontMatter(metadata.price)}"`);
  }

  private addMetricsMetadata(lines: string[], metadata: ArticleMetadata): void {
    if (metadata.score) lines.push(`score: ${metadata.score}`);
    if (metadata.is_amazon_direct !== undefined) lines.push(`is_amazon_direct: ${metadata.is_amazon_direct}`);
    if (metadata.model) lines.push(`model: "${this.escapeForFrontMatter(metadata.model)}"`);
    if (metadata.releaseDate) lines.push(`release_date: "${this.escapeForFrontMatter(metadata.releaseDate)}"`);
    if (metadata.availability) lines.push(`availability: "${this.escapeForFrontMatter(metadata.availability)}"`);
    if (metadata.loyalty_points !== undefined) lines.push(`loyalty_points: ${metadata.loyalty_points}`);
    if (metadata.savings_percentage !== undefined) lines.push(`savings_percentage: ${metadata.savings_percentage}`);
    if (metadata.deal_badge) lines.push(`deal_badge: "${this.escapeForFrontMatter(metadata.deal_badge)}"`);
    if (metadata.rating !== undefined) lines.push(`rating: ${metadata.rating}`);
    if (metadata.ratingCount !== undefined) lines.push(`rating_count: ${metadata.ratingCount}`);

    if (metadata.review) {
      this.addReviewMetadata(lines, metadata.review);
    }
  }

  /**
   * レビューメタデータを追加
   */
  private addReviewMetadata(lines: string[], review: NonNullable<ArticleMetadata['review']>): void {
    lines.push('review:');
    if (review.author) {
      lines.push(`  author: "${this.escapeForFrontMatter(review.author)}"`);
    }
    if (review.datePublished) {
      lines.push(`  date_published: "${this.escapeForFrontMatter(review.datePublished)}"`);
    }
    if (review.summary) {
      lines.push(`  summary: "${this.escapeForFrontMatter(review.summary)}"`);
    }
    if (review.rating !== undefined) {
      lines.push(`  rating: ${review.rating}`);
    }
  }

  private addSEOAndSocialMetadata(lines: string[], metadata: ArticleMetadata): void {
    lines.push(
      `tags: ${this.formatArrayForFrontMatter(metadata.tags)}`,
      `keywords: ${this.formatArrayForFrontMatter(metadata.seoKeywords)}`,
    );

    if (metadata.featured) lines.push(`featured: ${metadata.featured}`);
    if (typeof metadata.mobileOptimized === 'boolean') lines.push(`mobile_optimized: ${metadata.mobileOptimized}`);
    if (metadata.lastInvestigated) lines.push(`last_investigated: "${metadata.lastInvestigated}"`);
    if (metadata.affiliate_url) lines.push(`affiliate_url: "${metadata.affiliate_url}"`);

    if (metadata.images && metadata.images.length > 0) {
      lines.push(`images: ${this.formatArrayForFrontMatter(metadata.images)}`);
    }
  }

  /**
   * 配列をフロントマターの配列形式（[ "a", "b" ]）にフォーマット
   */
  private formatArrayForFrontMatter(arr: string | string[]): string {
    const array = Array.isArray(arr) ? arr : [arr];
    const escaped = array.map((item) => `"${this.escapeForFrontMatter(String(item))}"`);
    return `[${escaped.join(', ')}]`;
  }

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
      '口コミ',
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
    // Jules調査の推奨スコアのみで判定（Creators API v1ではレビューデータ取得不可）
    return investigation.analysis.recommendation.score >= 80;
  }

  private convertTablesToMobileFriendly(content: string): string {
    // テーブルをレスポンシブコンテナでラップ（テーブル構造を保持）
    // Markdownテーブルはそのまま保持し、CSSで横スクロール対応にする
    return content;
  }

  private optimizeListsForMobile(content: string): string {
    // リストアイテムにモバイル対応クラスを追加（既に span がある場合はスキップ）
    return content.replaceAll(
      /^- (?!<span class="mobile-list-item">)(.+)$/gm,
      '- <span class="mobile-list-item">$1</span>',
    );
  }

  private extractAffiliateLinks(content: string): AffiliateLink[] {
    const links: AffiliateLink[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let match: RegExpExecArray | null;
    let position = 0;

    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1];
      const linkUrl = match[2];

      if (
        linkText &&
        linkUrl &&
        linkUrl.includes('amazon.co.jp') &&
        (linkUrl.includes('tag=') || linkUrl.includes('/dp/'))
      ) {
        const asinMatch = /\/dp\/([A-Z0-9]{10})/.exec(linkUrl);
        if (asinMatch?.[1]) {
          links.push({
            asin: asinMatch[1],
            url: linkUrl,
            text: linkText,
            position: position++,
          });
        }
      }
    }

    return links;
  }

  private calculateWordCount(content: string): number {
    // 日本語文字数カウント（簡易実装）
    return content.replaceAll(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/g, '').length;
  }

  private generateSentimentAnalysis(reviewAnalysis: ReviewAnalysisResult): string {
    const sentiment = reviewAnalysis.overallSentiment;
    let sentimentText = '中立';
    if (sentiment.overall > 0.3) {
      sentimentText = 'ポジティブ';
    } else if (sentiment.overall < -0.3) {
      sentimentText = 'ネガティブ';
    }

    const confidenceLine = this.formatConfidenceLine(sentiment);

    return `
### 📊 レビュー傾向分析

**総合的な評価傾向**: ${sentimentText} (${(sentiment.overall * 100).toFixed(1)}%)

**側面別評価**:
- 品質: ${(sentiment.aspects.quality * 100).toFixed(1)}%
- 価格: ${(sentiment.aspects.value * 100).toFixed(1)}%
- 使いやすさ: ${(sentiment.aspects.usability * 100).toFixed(1)}%
- サポート: ${(sentiment.aspects.support * 100).toFixed(1)}%
- 信頼性: ${(sentiment.aspects.reliability * 100).toFixed(1)}%

${confidenceLine}`;
  }

  private formatConfidenceLine(sentiment: ReviewAnalysisResult['overallSentiment']): string {
    const summary = this.buildConfidenceFactorSummary(sentiment);

    if (sentiment.confidence === null || sentiment.confidenceStatus === 'pending') {
      return `**信頼度**: 評価保留（${summary}）`;
    }

    return `**信頼度**: ${(sentiment.confidence * 100).toFixed(1)}%（${summary}）`;
  }

  private buildConfidenceFactorSummary(sentiment: ReviewAnalysisResult['overallSentiment']): string {
    const factors = sentiment.confidenceFactors;
    const independentRatioText =
      factors.independentSourceRatio === null ? 'N/A' : `${(factors.independentSourceRatio * 100).toFixed(0)}%`;
    const contradictionText =
      factors.contradictionRate === null ? 'N/A' : `${(factors.contradictionRate * 100).toFixed(0)}%`;
    const lastVerifiedAtText = factors.lastVerifiedAt ?? '未確認';

    return `データ件数: ${factors.dataPointCount} / ソース件数: ${factors.sourceCount} / 独立ソース比率: ${independentRatioText} / 最終確認日: ${lastVerifiedAtText} / 矛盾率: ${contradictionText}`;
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
    let sanitized = userImpression.replaceAll(/\*\*([^*]+)\*\*/g, '$1');

    // *text* 形式のイタリック記法も除去
    sanitized = sanitized.replaceAll(/\*([^*]+)\*/g, '$1');

    // 全ての改行をスペースに変換して1つの連続したテキストにする
    sanitized = sanitized.replaceAll(/\n+/g, ' ');

    // 連続するスペースを1つに正規化
    sanitized = sanitized.replaceAll(/\s{2,}/g, ' ').trim();

    // Markdownのblockquote記法「>」を使用
    return `> ${sanitized}`;
  }

  /**
   * scoreRationaleから加点・減点項目をすべて抽出
   */
  private extractScoreRationaleItems(rationale: string | string[] | undefined): {
    plus: { points: number; desc: string }[];
    minus: { points: number; desc: string }[];
  } {
    if (!rationale) {
      return { plus: [], minus: [] };
    }

    const rawRationale = Array.isArray(rationale) ? rationale.join('\n') : rationale;
    const lines = rawRationale.split('\n').filter((line) => line.trim());

    const plus: { points: number; desc: string }[] = [];
    const minus: { points: number; desc: string }[] = [];

    for (const line of lines) {
      // 加点: [任意のラベル: +13] (説明)
      const plusMatch = /\[[^\]]{1,100}:\s*\+(\d+)\]\s*(.*)/.exec(line);
      if (plusMatch) {
        const points = Number.parseInt(plusMatch[1] ?? '0', 10);
        const desc = this.cleanRationaleDesc(plusMatch[2] || '');
        plus.push({ points, desc });
      }

      // 減点: [任意のラベル: -(\d+)] (説明)
      const minusMatch = /\[[^\]]{1,100}:\s*-(\d+)\]\s*(.*)/.exec(line);
      if (minusMatch) {
        const points = Number.parseInt(minusMatch[1] ?? '0', 10);
        const desc = this.cleanRationaleDesc(minusMatch[2] || '');
        minus.push({ points, desc });
      }
    }

    return { plus, minus };
  }

  /**
   * Rationaleの説明文をクリーンアップ（HTMLタグ除去、括弧除去、空白正規化）
   */
  private cleanRationaleDesc(desc: string): string {
    return desc
      .replaceAll(/<[^>]*>/g, ' ')
      .replaceAll(/\s+(?=\s)/g, '')
      .replace(/^[(（]/, '')
      .replace(/[)）]$/, '')
      .trim();
  }

  /**
   * 競合商品の調査結果をロード（キャッシュ管理込み）
   */
  private async loadCompetitorInvestigation(asin: string): Promise<InvestigationResult | null> {
    if (this.investigationCache.has(asin)) {
      return this.investigationCache.get(asin) || null;
    }

    const investigationPath = path.join(process.cwd(), 'data', 'investigations', `${asin}.json`);
    try {
      const fileContent = await fs.promises.readFile(investigationPath, 'utf-8');
      const parsed = InvestigationFileSchema.parse(JSON.parse(fileContent));
      const investigation = parsed as unknown as InvestigationResult;

      if (this.investigationCache.size >= 1000) this.investigationCache.clear();
      this.investigationCache.set(asin, investigation);
      return investigation;
    } catch (error) {
      if (this.investigationCache.size >= 1000) this.investigationCache.clear();
      this.investigationCache.set(asin, null);

      if (error instanceof Error && (error as { code?: string }).code !== 'ENOENT') {
        this.logger.debug(`Failed to load competitor investigation for ${asin}`, error);
      }
      return null;
    }
  }

  /**
   * 競合商品のプレビューHTMLを生成
   */
  private renderCompetitorPreview(
    name: string,
    detail: ProductDetail,
    basePriceAmount: number,
    score?: number,
    hasInternalReview?: boolean,
    asin?: string,
    specs?: TechnicalSpecs,
  ): string {
    const imageUrl = detail.images?.primary || '';
    const priceText = detail.price?.formatted || '';
    const competitorPriceAmount = detail.price?.amount || 0;
    const availabilityText = detail.availability || '';
    const isAmazonDirect = detail.isAmazonDirect;
    const loyaltyPoints = detail.loyaltyPoints;
    const dealBadge = detail.dealBadge;
    const savingsPercentage = detail.savingsPercentage;

    const priceDiffHtml = this.renderPriceDiff(basePriceAmount, competitorPriceAmount);
    const scoreHtml = this.renderCompetitorScore(score);

    const previewTag = hasInternalReview ? 'a' : 'div';
    const previewAttrs = hasInternalReview && asin ? ` href="../${asin.toLowerCase()}/"` : '';

    const pointsHtml = loyaltyPoints
      ? `<span class="hero-points" style="font-size: 0.85rem; margin-left: var(--spacing-sm);">🎁 ${loyaltyPoints}pt還元</span>`
      : '';
    const actualPriceHtml = priceText
      ? `<span class="competitor-actual-price">${this.escapeHtml(priceText)}${priceDiffHtml}${pointsHtml}</span>`
      : '';
    const amazonDirectHtml = isAmazonDirect ? '<span class="badge-amazon-direct">Amazon直販</span>' : '';
    const dealBadgeHtml = dealBadge ? `<span class="badge-deal">${this.escapeHtml(dealBadge)}</span>` : '';
    const savingsPercentageHtml = savingsPercentage
      ? `<span class="badge-savings">${savingsPercentage}% OFF</span>`
      : '';
    const availabilityHtml = availabilityText
      ? `<span class="badge-availability">${this.escapeHtml(availabilityText)}</span>`
      : '';

    const specTagsHtml = specs
      ? `<div class="competitor-preview-tags">${this.renderSpecTags(specs, 'hero-tag')}</div>`
      : '';

    return `<${previewTag}${previewAttrs} class="competitor-preview"><img src="${this.escapeHtml(imageUrl)}" alt="${this.escapeHtml(name)}" class="competitor-preview-img"><div class="competitor-preview-content"><div class="competitor-preview-main">${scoreHtml}${actualPriceHtml}</div><div class="competitor-preview-meta">${amazonDirectHtml}${dealBadgeHtml}${savingsPercentageHtml}${availabilityHtml}</div>${specTagsHtml}</div></${previewTag}>`;
  }

  /**
   * 競合商品との価格差表示を生成
   */
  private renderPriceDiff(basePrice: number, competitorPrice: number): string {
    if (basePrice <= 0 || competitorPrice <= 0) return '';

    const diff = competitorPrice - basePrice;
    const diffFormatted = new Intl.NumberFormat('ja-JP').format(Math.abs(diff));
    let sign = '±';
    let diffClass = 'price-equal';

    if (diff > 0) {
      sign = '+';
      diffClass = 'price-up';
    } else if (diff < 0) {
      sign = '-';
      diffClass = 'price-down';
    }

    return `<span class="competitor-price-diff ${diffClass}">(${sign}￥${diffFormatted})</span>`;
  }

  /**
   * 競合商品のスコア表示を生成
   */
  private renderCompetitorScore(score?: number): string {
    if (score === undefined) return '';

    let scoreClass = 'score-fair';
    if (score >= 80) scoreClass = 'score-excellent';
    else if (score >= 60) scoreClass = 'score-good';

    return `<div class="competitor-score-container"><span class="pickup-card-score ${scoreClass}">🏆 ${score}点</span></div>`;
  }

  /**
   * スペックタグHTMLを生成（Hugoの partial "product-spec-tags.html" と同期）
   */
  private renderSpecTags(specs: TechnicalSpecs, tagClass: string): string {
    const tags: string[] = [];

    const addTag = (label: string, value: unknown): void => {
      const formatted = this.formatSpecValue(value);
      if (formatted && formatted !== 'null') {
        tags.push(`<span class="${tagClass}">${label}: ${this.escapeHtml(formatted)}</span>`);
      }
    };

    // 基本情報
    addTag('OS', specs.os);
    addTag('CPU', specs.cpu);
    addTag('RAM', specs.ram);
    addTag('ROM', specs.storage);
    addTag('個数', specs.count);
    addTag('容量', specs.capacity);

    // 条件付きまたは複数フィールドの可能性があるもの
    addTag('画面', specs.display?.size || specs.display_size);
    addTag('バッテリー', specs.battery?.capacity || specs.battery_capacity);
    addTag('重量', specs.dimensions?.weight || specs.weight);
    addTag('内容量', specs.quantity || specs.content || specs.content_volume);

    if (specs.material && typeof specs.material === 'string') {
      addTag('素材', specs.material);
    }

    // サイズ（縦 × 横 × 厚み）
    const h = specs.dimensions?.height || specs.height;
    const w = specs.dimensions?.width || specs.width;
    const d = specs.dimensions?.depth || specs.depth;
    const formattedSize = [h, w, d]
      .map((v) => this.formatSpecValue(v))
      .filter((v) => v && v !== 'null')
      .join(' × ');

    if (formattedSize) {
      tags.push(`<span class="${tagClass}">サイズ: ${this.escapeHtml(formattedSize)}</span>`);
    }

    return tags.join('');
  }

  /**
   * HTML エスケープ処理
   */
  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /**
   * ISO形式などの日付文字列を日本時間の「YYYY年MM月DD日」形式に変換
   */
  private formatToJapaneseDate(dateStr: string | undefined): string | undefined {
    if (!dateStr) return undefined;
    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) {
        // パースできなかった場合は元の文字列を返す
        return dateStr;
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}年${month}月${day}日`;
    } catch {
      return dateStr;
    }
  }
}
