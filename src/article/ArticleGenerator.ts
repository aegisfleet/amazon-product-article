/**
 * Article_Generator - 調査結果からMarkdown記事として生成するコンポーネント
 */

import fs from 'fs';
import path from 'path';
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
  affiliate_url?: string; // Affiliate link for the hero button
  is_prime?: boolean;
  availability?: string;
  technicalSpecs?: TechnicalSpecs;  // 詳細スペック情報（カテゴリ依存）
  hero?: {
    score_rationale: {
      top_plus: { points: number; desc: string } | null;
      top_minus: { points: number; desc: string } | null;
    };
    target_users: string[];
    warnings: string[];
    specs: TechnicalSpecs;
  };
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


/**
 * スペックフィールド名から日本語ラベルへのマッピング
 * 動的レンダリングで使用
 */
const SPEC_LABEL_MAP: Record<string, string> = {
  // 基本情報
  dimensions: 'サイズ',
  weight: '重量',
  material: '素材',
  color: 'カラー',
  model: '型番',
  modelNumber: '型番',
  countryOfOrigin: '原産国',
  country_of_origin: '原産国',
  category: 'カテゴリ',
  productType: '商品タイプ',
  brand: 'ブランド',
  manufacturer: 'メーカー',

  // 電子機器
  os: 'OS',
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'メモリ',
  storage: 'ストレージ',
  display: 'ディスプレイ',
  battery: 'バッテリー',
  camera: 'カメラ',
  connectivity: '接続',
  interface: 'インターフェース',
  connectorType: 'コネクタタイプ',
  transferSpeed: '転送速度',
  dataTransferSpeed: 'データ転送速度',
  resolution: '解像度',
  refreshRate: 'リフレッシュレート',
  responseTime: '応答速度',

  // 電源・家電関連
  power: '電力/電源',
  powerConsumption: '消費電力',
  consumption: '消費電力',
  capacity: '容量',
  tankCapacity: 'タンク容量',
  dustCapacity: '集塵容量',
  output: '出力',
  input: '入力',
  maxPower: '最大出力',
  cableLength: 'ケーブル長',
  cordLength: 'コード長',
  ports: 'ポート',
  voltage: '電圧',
  frequency: '周波数',

  // オーディオ
  driver: 'ドライバー',
  codec: 'コーデック',
  noiseCancel: 'ノイズキャンセル',
  microphone: 'マイク',
  frequencyResponse: '周波数特性',
  impedance: 'インピーダンス',
  sensitivity: '感度',

  // 靴（シューズ）・アパレル
  width: '幅',
  midsole: 'ミッドソール',
  cushioningTech: 'クッショニング',
  heelCounter: 'ヒールカウンター',
  heelHeight: 'ヒール高',
  upperMaterial: 'アッパー素材',
  midsoleMaterial: 'ミッドソール素材',
  outsoleMaterial: 'アウトソール素材',
  outerSole: 'アウトソール',
  insoleMaterial: 'インソール素材',
  innerSole: 'インソール',
  insole: 'インソール',
  soleMaterial: 'ソール素材',
  claspType: '留め具タイプ',
  closureType: '留め具',

  // 食品・サプリ・美容・健康
  quantity: '内容量',
  content: '内容量',
  contentVolume: '内容量',
  servingSize: '1食分量',
  activeIngredients: '有効成分',
  mainIngredients: '主な成分',
  ingredients: '成分',
  allergens: 'アレルゲン',
  calories: 'カロリー',
  protein: 'タンパク質',
  fat: '脂質',
  carbohydrates: '炭水化物',
  saltEquivalent: '食塩相当量',
  dosage: '用法・用量',
  dailyDosage: '1日の摂取目安',
  origin: '産地',
  shelfLife: '期限',
  flavor: '味',
  fragrance: '香り',
  scent: '香り',
  skinType: '対象肌タイプ',

  // 文房具・書籍・メディア
  pages: 'ページ数',
  publicationDate: '出版日',
  publisher: '出版社',
  binding: '製本',
  genre: 'ジャンル',
  language: '言語',
  isbn: 'ISBN',
  numberOfDiscs: 'ディスク枚数',
  discCount: 'ディスク枚数',

  // その他・共通
  loadCapacity: '耐荷重',
  load_capacity: '耐荷重',
  attachments: '付属品',
  accessories: '付属品',
  includedItems: '同梱物',
  packageContents: '同梱物',
  other: 'その他',
  features: '特徴',
  specialFeatures: '特殊機能',
  compatibility: '互換性',
  compatibleDevices: '対応機器',
  compatibleModels: '対応モデル',
  releaseDate: '発売日',
  warranty: '保証',
  targetAge: '対象年齢',
  recommendedAge: '推奨年齢',
  uvProtection: 'UVカット',

  // コンタクトレンズ
  dia: 'レンズ直径(DIA)',
  bc: 'ベースカーブ(BC)',
  coloredDiameter: '着色直径',
  waterContent: '含水率',
  lensType: 'レンズタイプ',
  medicalApprovalNumber: '医療機器承認番号',

  // 寸法・重量（ネストされたプロパティ用）
  height: '高さ',
  depth: '奥行き',
  thickness: '厚さ',

  // ディスプレイ・その他（ネストされたプロパティ用）
  size: 'サイズ',
  type: 'タイプ',

  // バッテリー（ネストされたプロパティ用）
  charging: '充電',
  playbackTime: '再生時間',

  // カメラ（ネストされたプロパティ用）
  main: 'メイン',
  ultrawide: '超広角',
  telephoto: '望遠',
  front: 'フロント',
};

/**
 * 既知のフィールド（既存ロジックで処理済み）
 * これらは動的レンダリングから除外される
 */
const HANDLED_SPEC_FIELDS = new Set([
  // これらのフィールドは renderDynamicSpecs で自動表示しない（別途手動で表示するため）
  'asin',
  'price',
  'brand',
  'category',
  'availability',
  'isPrimeEligible',
  'externalIds',
  'images',
  'title',
  'url'
]);


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

    // 階層カテゴリ: Creators APIのcategoryInfoがあればそれを使用
    const subcategory = product.categoryInfo?.sub || this.determineSubcategory(product);
    const manufacturer = this.extractManufacturer(product);

    // Product images for Hugo front matter (primary + thumbnails)
    const images = [product.images.primary, ...product.images.thumbnails].filter(Boolean);

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
      // Creators API v1ではレビューデータ取得不可のためrating不使用
      featured: this.shouldBeFeatured(product, investigation),
      mobileOptimized: true,
      seoKeywords,
      affiliate_url: affiliateUrl
    };

    if (product.isPrimeEligible !== undefined) {
      metadata.is_prime = product.isPrimeEligible;
    }
    if (product.availability !== undefined) {
      metadata.availability = product.availability;
    }

    if (subcategory) {
      metadata.subcategory = subcategory;
    }

    if (manufacturer) {
      metadata.manufacturer = manufacturer;
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
    const { topPlus, topMinus } = this.extractTopRationaleItems(
      investigation.analysis.recommendation.scoreRationale
    );

    metadata.hero = {
      score_rationale: {
        top_plus: topPlus,
        top_minus: topMinus
      },
      target_users: investigation.analysis.recommendation.targetUsers,
      warnings: investigation.analysis.recommendation.cons || [],
      specs: investigation.analysis.technicalSpecs || {}
    };

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

    // ヒーローカードのごく短い説明文（span内）も段落分割から保護
    const heroDescriptions: string[] = [];
    mobileContent = mobileContent.replace(/<span class="hero-score-item-desc">[\s\S]*?<\/span>/g, (match) => {
      heroDescriptions.push(match);
      return `__HERODESC_${heroDescriptions.length - 1}__`;
    });

    // 長い段落を分割（blockquote以外のテキストにのみ適用）
    mobileContent = mobileContent.replace(/(.{200,}?)([。！？])/g, '$1$2\n\n');

    // blockquoteを復元
    blockquotes.forEach((bq, i) => {
      mobileContent = mobileContent.replace(`__BLOCKQUOTE_${i}__`, bq);
    });

    // ヒーロー説明文を復元
    heroDescriptions.forEach((bq, i) => {
      mobileContent = mobileContent.replace(`__HERODESC_${i}__`, bq);
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
    // NOTE: Refactored to Front Matter + Hugo Partial.
    // sections.push(await this.generateProductHeroSection(product, investigation, affiliateTag));


    // 商品の特徴と使い方
    sections.push(this.generateFeaturesSection(product, investigation));

    // ユーザーレビュー
    sections.push(await this.generateUserReviewsSection(investigation, reviewAnalysis, template.sections.userReviews));

    // 競合商品との比較（表形式）
    if (competitorDetails) {
      sections.push(await this.generateCompetitiveAnalysisSection(investigation, template.sections.competitiveAnalysis, affiliateTag, competitorDetails));
    }

    // 購入推奨度
    sections.push(this.generateRecommendationSection(investigation, template.sections.recommendation));

    // 商品詳細・購入（下部）
    sections.push(this.generatePurchaseSection(product, affiliateTag, investigation));

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
    affiliateTag: string,
    investigation: InvestigationResult
  ): ArticleSection {
    const affiliateLink = this.affiliateManager.generateLinkFromProduct(product);
    const affiliateUrl = affiliateLink.url;

    // 基本情報行
    const infoRows: string[] = [
      `| ASIN | ${product.asin} |`,
      `| 現在価格 | ${product.price.formatted} |`,
      `| カテゴリ | ${product.categoryInfo?.main || product.category} |`
    ];

    // 追加プロパティ（ブランドなど）
    const productDetail = product as ProductDetail;
    if (productDetail.brand) {
      infoRows.push(`| ブランド | ${productDetail.brand} |`);
    }

    // 在庫・Prime情報
    if (productDetail.availability) {
      infoRows.push(`| 在庫状況 | ${productDetail.availability} |`);
    }
    if (productDetail.isPrimeEligible) {
      infoRows.push(`| Prime対応 | ✓ 対応 |`);
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

    const content = `## 🛒 商品詳細・購入

<div class="product-comparison">

| 項目 | 詳細 |
| :--- | :--- |
${infoRows.join('\n')}

</div>

<a href="${affiliateUrl}" class="btn-amazon-large" target="_blank" rel="noopener noreferrer">Amazonで詳細を見る</a>`;

    return {
      title: '商品詳細・購入',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['商品詳細表', '購入リンク']
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
    // ただし、Creators APIのURLはユーザーには不要なためリンクを貼らない
    const sourcesList = validSources
      .map(source => {
        const credibility = source.credibility ? ` (${source.credibility})` : '';
        const creatorsApiHost = 'webservices.amazon.co.jp';
        const creatorsApiPathPrefix = '/creators/v1';

        const isCreatorsApiUrl = (urlString: string): boolean => {
          try {
            const parsed = new URL(urlString);
            return (
              parsed.hostname === creatorsApiHost &&
              parsed.pathname.startsWith(creatorsApiPathPrefix)
            );
          } catch {
            // URLとして解釈できない場合はCreators APIとはみなさない（従来動作に近づける）
            return false;
          }
        };

        if (source.url && !isCreatorsApiUrl(source.url)) {
          return `- [${source.name}](${source.url})${credibility}`;
        }
        return `- ${source.name}${credibility}`;
      })
      .join('\n');

    const content = `## 🔗 参考情報ソース

本記事の作成にあたり、以下の情報を参照しました：

${sourcesList}`;

    return {
      title: '🔗 参考情報ソース',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: ['情報ソース一覧']
    };
  }



  /**
   * 商品の特徴と使い方セクションを生成
   */
  private generateFeaturesSection(
    _product: Product,
    investigation: InvestigationResult
  ): ArticleSection {
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
      requiredElements: template.requiredElements
    };
  }

  /**
   * 競合分析セクションを生成（カード形式で競合商品リンク付き）
   * Creators APIで情報が取得できなかった競合商品は非表示にする
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

        // Creators APIから取得した競合商品の詳細情報
        const detail = competitor.asin ? competitorDetails?.get(competitor.asin) : undefined;

        // 調査済み記事が存在するかチェック
        let internalLink = '';
        let hasInternalReview = false;
        let competitorScore: number | undefined;
        if (competitor.asin) {
          const investigationPath = path.join(process.cwd(), 'data', 'investigations', `${competitor.asin}.json`);
          if (fs.existsSync(investigationPath)) {
            hasInternalReview = true;
            internalLink = `<a href="../${competitor.asin.toLowerCase()}/" class="btn-internal-small">📄 サイト内レビュー</a>`;
            // 競合商品のスコアを取得
            try {
              const competitorInvestigation = JSON.parse(fs.readFileSync(investigationPath, 'utf-8')) as InvestigationResult;
              competitorScore = competitorInvestigation.analysis?.recommendation?.score;
            } catch {
              // スコア取得に失敗した場合は無視
            }
          }
        }

        // 商品プレビュー（Creators API情報がある場合）
        let productPreview = '';
        if (detail) {
          const imageUrl = detail.images?.primary || '';
          const priceText = detail.price?.formatted || '';
          const availabilityText = detail.availability || '';
          const primeText = detail.isPrimeEligible ? '⭐ Prime対応' : '';

          // スコア表示のHTML生成
          let scoreHtml = '';
          if (competitorScore !== undefined) {
            let scoreClass = 'score-fair';
            if (competitorScore >= 80) {
              scoreClass = 'score-excellent';
            } else if (competitorScore >= 60) {
              scoreClass = 'score-good';
            }
            scoreHtml = `<div class="competitor-score-container"><span class="pickup-card-score ${scoreClass}">🏆 ${competitorScore}点</span></div>`;
          }

          const previewTag = hasInternalReview ? 'a' : 'div';
          const previewAttrs = (hasInternalReview && competitor.asin) ? ` href="../${competitor.asin.toLowerCase()}/"` : '';

          productPreview = `
<${previewTag}${previewAttrs} class="competitor-preview">
<img src="${imageUrl}" alt="${competitor.name}" class="competitor-preview-img">
<div class="competitor-preview-info">
${scoreHtml}${priceText ? `<span class="competitor-actual-price">${priceText}</span>` : ''}${primeText ? `<span class="competitor-prime">${primeText}</span>` : ''}${availabilityText ? `<span class="competitor-availability">📦 ${availabilityText}</span>` : ''}
</div>
</${previewTag}>`;
        }

        // Creators APIが実行された場合（competitorDetailsが存在する場合）、
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
<div class="competitor-links">
${internalLink}
${competitorLink}
</div>
</div>`;
      })
      .join('\n\n');

    const content = `## 🥊 競合商品との比較

<div class="competitor-cards">

${competitorCards}

</div>

### ⚔️ 総合的な競合優位性

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
  private generateRecommendationSection(
    investigation: InvestigationResult,
    template: TemplateSection
  ): ArticleSection {
    const targetUsers = investigation.analysis.recommendation.targetUsers
      .map(user => `- ${user}`)
      .join('\n');

    const score = investigation.analysis.recommendation.score;
    const scoreText = this.getScoreDescription(score);

    const formattedRationale = investigation.analysis.recommendation.scoreRationale
      ? this.formatScoreRationaleAsCard(investigation.analysis.recommendation.scoreRationale)
      : '';

    const content = `## ✅ 購入推奨度

### 総合評価: ${score}点/100点 (${scoreText})

${formattedRationale ? `### 評価の理由\n\n${formattedRationale}\n` : ''}

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
      title: '✅ 購入推奨度',
      content,
      wordCount: this.calculateWordCount(content),
      requiredElements: template.requiredElements
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

      let label = SPEC_LABEL_MAP[key] || this.formatFieldName(key);

      // カテゴリに応じたラベルの調整
      if (key === 'power') {
        if (category === 'ソフトコンタクトレンズ' || category === 'コンタクトレンズ・ケア用品') {
          label = '度数';
        }
      }

      const formattedValue = this.formatSpecValue(value, category);

      if (formattedValue) {
        rows.push(`| ${label} | ${formattedValue} |`);
      }
    }

    return rows;
  }

  /**
   * フィールド名をフォーマット（camelCase → スペース区切り）
   */
  private formatFieldName(fieldName: string): string {
    // camelCaseをスペース区切りに変換
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * スペック値を表示用にフォーマット
   */
  private formatSpecValue(value: unknown, category?: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      // 配列内の各要素をフォーマット
      const formatted = value.map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          return this.formatObjectValue(item as Record<string, unknown>, category);
        }
        return String(item);
      });
      return formatted.join(', ');
    }

    if (typeof value === 'object') {
      return this.formatObjectValue(value as Record<string, unknown>, category);
    }

    // primitiveとして安全に文字列化（symbol, bigintなど）
    return typeof value === 'symbol' ? value.toString() : String(value as string | number | boolean);
  }

  /**
   * オブジェクト値をフォーマット
   */
  private formatObjectValue(obj: Record<string, unknown>, category?: string): string {
    const parts: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) continue;

      let label = SPEC_LABEL_MAP[key] || this.formatFieldName(key);

      // カテゴリに応じたラベルの調整
      if (key === 'power') {
        if (category === 'ソフトコンタクトレンズ' || category === 'コンタクトレンズ・ケア用品') {
          label = '度数';
        }
      }

      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        parts.push(`${label}: ${val}`);
      } else if (Array.isArray(val)) {
        parts.push(`${label}: ${val.join(', ')}`);
      } else if (typeof val === 'object') {
        // ネストされたオブジェクトは再帰的に処理
        parts.push(`${label}: ${this.formatObjectValue(val as Record<string, unknown>, category)}`);
      }
    }

    return parts.join(' / ');
  }

  /**
   * 記事を組み立て
   */
  private assembleArticle(sections: ArticleSection[], metadata: ArticleMetadata): string {
    const frontMatter = this.generateFrontMatter(metadata);
    const sectionsContent = sections.map(section => section.content).join('\n\n');

    return `${frontMatter}\n\n${sectionsContent}\n\n---\n*本記事にはアフィリエイトリンクが含まれています。*`;
  }

  /**
   * フロントマターを生成
   */
  private escapeForFrontMatter(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

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
    if (metadata.is_prime !== undefined) lines.push(`is_prime: ${metadata.is_prime}`);
    if (metadata.availability) lines.push(`availability: "${metadata.availability}"`);

    if (metadata.rating) lines.push(`rating: ${metadata.rating}`);

    lines.push(`tags: [${metadata.tags.map(tag => `"${tag}"`).join(', ')}]`);
    lines.push(`keywords: [${metadata.seoKeywords.map(keyword => `"${keyword}"`).join(', ')}]`);
    if (metadata.featured) lines.push(`featured: ${metadata.featured}`);
    if (typeof metadata.mobileOptimized === 'boolean') lines.push(`mobile_optimized: ${metadata.mobileOptimized}`);
    if (metadata.lastInvestigated) lines.push(`last_investigated: "${metadata.lastInvestigated}"`);
    if (metadata.affiliate_url) lines.push(`affiliate_url: "${metadata.affiliate_url}"`);

    // Add images for Hugo template (used on home page)
    if (metadata.images && metadata.images.length > 0) {
      lines.push(`images: [${metadata.images.map(img => `"${img}"`).join(', ')}]`);
    }

    // Add technical specs (flattened for Hugo template)
    if (metadata.technicalSpecs) {
      const specs = metadata.technicalSpecs;
      lines.push('specs:');
      const addedKeys = new Set<string>();

      const addSpec = (key: string, value: string): void => {
        if (!addedKeys.has(key)) {
          lines.push(`  ${key}: ${value}`);
          addedKeys.add(key);
        }
      };

      // 基本スペック
      if (specs.os) addSpec('os', `"${this.formatSpecValue(specs.os)}"`);
      if (specs.cpu) addSpec('cpu', `"${this.formatSpecValue(specs.cpu)}"`);
      if (specs.gpu) addSpec('gpu', `"${this.formatSpecValue(specs.gpu)}"`);
      if (specs.ram) addSpec('ram', `"${this.formatSpecValue(specs.ram)}"`);
      if (specs.storage) addSpec('storage', `"${this.formatSpecValue(specs.storage)}"`);

      // ディスプレイ
      if (specs.display) {
        if (specs.display.size) addSpec('display_size', `"${specs.display.size}"`);
        if (specs.display.resolution) addSpec('display_resolution', `"${specs.display.resolution}"`);
        if (specs.display.type) addSpec('display_type', `"${specs.display.type}"`);
        if (specs.display.refreshRate) addSpec('display_refresh_rate', `"${specs.display.refreshRate}"`);
      }

      // バッテリー
      if (specs.battery) {
        if (specs.battery.capacity) addSpec('battery_capacity', `"${specs.battery.capacity}"`);
        if (specs.battery.charging) addSpec('battery_charging', `"${specs.battery.charging}"`);
        if (specs.battery.playbackTime) addSpec('battery_playback_time', `"${specs.battery.playbackTime}"`);
      }

      // カメラ
      if (specs.camera) {
        if (specs.camera.main) addSpec('camera_main', `"${specs.camera.main}"`);
        if (specs.camera.ultrawide) addSpec('camera_ultrawide', `"${specs.camera.ultrawide}"`);
        if (specs.camera.telephoto) addSpec('camera_telephoto', `"${specs.camera.telephoto}"`);
        if (specs.camera.front) addSpec('camera_front', `"${specs.camera.front}"`);
      }

      // 寸法・重量
      if (specs.dimensions) {
        if (specs.dimensions.height) addSpec('height', `"${specs.dimensions.height}"`);
        if (specs.dimensions.width) addSpec('width', `"${specs.dimensions.width}"`);
        if (specs.dimensions.depth) addSpec('depth', `"${specs.dimensions.depth}"`);
        if (specs.dimensions.weight) addSpec('weight', `"${specs.dimensions.weight}"`);
      }

      // イヤホン・ヘッドホン
      if (specs.driver) addSpec('driver', `"${this.formatSpecValue(specs.driver)}"`);
      if (specs.codec) {
        const codecVal = Array.isArray(specs.codec) ? `[${specs.codec.map(c => `"${c}"`).join(', ')}]` : `"${specs.codec}"`;
        addSpec('codec', codecVal);
      }
      if (specs.noiseCancel) addSpec('noise_cancel', `"${this.formatSpecValue(specs.noiseCancel)}"`);

      // 家電
      if (specs.power) addSpec('power', `"${this.formatSpecValue(specs.power)}"`);
      if (specs.capacity) addSpec('capacity', `"${this.formatSpecValue(specs.capacity)}"`);
      if (specs.category) addSpec('spec_category', `"${this.formatSpecValue(specs.category)}"`);

      // 接続性
      if (specs.connectivity) {
        const connectVal = Array.isArray(specs.connectivity) ? `[${specs.connectivity.map(c => `"${c}"`).join(', ')}]` : `"${specs.connectivity}"`;
        addSpec('connectivity', connectVal);
      }

      // 靴（シューズ）
      if (specs.width) addSpec('width', `"${this.formatSpecValue(specs.width)}"`);
      if (specs.weight) addSpec('weight', `"${this.formatSpecValue(specs.weight)}"`);
      if (specs.midsole) addSpec('midsole', `"${this.formatSpecValue(specs.midsole)}"`);
      if (specs.cushioningTech) {
        const cushVal = Array.isArray(specs.cushioningTech) ? `[${specs.cushioningTech.map(c => `"${c}"`).join(', ')}]` : `"${specs.cushioningTech}"`;
        addSpec('cushioning_tech', cushVal);
      }
      if (specs.heelCounter) addSpec('heel_counter', `"${this.formatSpecValue(specs.heelCounter)}"`);
      if (specs.heelHeight) addSpec('heel_height', `"${this.formatSpecValue(specs.heelHeight)}"`);
      if (specs.material) {
        if (!addedKeys.has('material')) {
          if (typeof specs.material === 'string') {
            lines.push(`  material: "${specs.material}"`);
          } else {
            lines.push('  material:');
            if (specs.material.upper) lines.push(`    upper: "${specs.material.upper}"`);
            if (specs.material.outsole) lines.push(`    outsole: "${specs.material.outsole}"`);
            if (specs.material.insole) lines.push(`    insole: "${specs.material.insole}"`);
          }
          addedKeys.add('material');
        }
      }
      if (specs.upperMaterial) addSpec('upper_material', `"${specs.upperMaterial}"`);
      if (specs.midsoleMaterial) addSpec('midsole_material', `"${specs.midsoleMaterial}"`);
      if (specs.outsoleMaterial) addSpec('outsole_material', `"${specs.outsoleMaterial}"`);
      if (specs.outerSole) addSpec('outer_sole', `"${specs.outerSole}"`);
      if (specs.insoleMaterial) addSpec('insole_material', `"${specs.insoleMaterial}"`);
      if (specs.innerSole) addSpec('inner_sole', `"${specs.innerSole}"`);
      if (specs.insole) addSpec('insole', `"${specs.insole}"`);

      if (specs.modelNumber) addSpec('model_number', `"${this.formatSpecValue(specs.modelNumber)}"`);
      if (specs.model) addSpec('model', `"${this.formatSpecValue(specs.model)}"`);
      if (specs.countryOfOrigin) addSpec('country_of_origin', `"${this.formatSpecValue(specs.countryOfOrigin)}"`);

      // 耐荷重
      if (specs.loadCapacity) {
        if (!addedKeys.has('load_capacity')) {
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
      }

      // 付属品
      if (specs.attachments) {
        if (Array.isArray(specs.attachments)) {
          addSpec('attachments', `[${specs.attachments.map(a => `"${a}"`).join(', ')}]`);
        } else {
          addSpec('attachments', `"${specs.attachments}"`);
        }
      }

      // その他
      if (specs.other) {
        const otherVal = Array.isArray(specs.other) ? `[${specs.other.map(o => `"${o}"`).join(', ')}]` : `"${specs.other}"`;
        addSpec('other_specs', otherVal);
      }
    }

    // Add Hero Data
    if (metadata.hero) {
      lines.push('hero:');
      if (metadata.hero.score_rationale) {
        lines.push('  score_rationale:');
        if (metadata.hero.score_rationale.top_plus) {
          lines.push('    top_plus:');
          lines.push(`      points: ${metadata.hero.score_rationale.top_plus.points}`);
          lines.push(`      desc: "${this.escapeForFrontMatter(metadata.hero.score_rationale.top_plus.desc)}"`);
        }
        if (metadata.hero.score_rationale.top_minus) {
          lines.push('    top_minus:');
          lines.push(`      points: ${metadata.hero.score_rationale.top_minus.points}`);
          lines.push(`      desc: "${this.escapeForFrontMatter(metadata.hero.score_rationale.top_minus.desc)}"`);
        }
      }

      if (metadata.hero.target_users && metadata.hero.target_users.length > 0) {
        lines.push(`  target_users: [${metadata.hero.target_users.map(u => `"${this.escapeForFrontMatter(u)}"`).join(', ')}]`);
      }

      if (metadata.hero.warnings && metadata.hero.warnings.length > 0) {
        lines.push(`  warnings: [${metadata.hero.warnings.map(w => `"${this.escapeForFrontMatter(w)}"`).join(', ')}]`);
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
          title: 'ユーザーレビュー',
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
          'ユーザーレビュー',
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
    // Jules調査の推奨スコアのみで判定（Creators API v1ではレビューデータ取得不可）
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
   * scoreRationaleをカード形式のHTMLにフォーマット
   * 基本点・加点・減点・合計を識別して、絵文字とスタイリングで視覚的に表示
   */
  private formatScoreRationaleAsCard(rationale: string | string[]): string {
    const rawRationale = Array.isArray(rationale) ? rationale.join('\n') : rationale;
    const lines = rawRationale.split('\n').filter(line => line.trim());
    const parts: string[] = [];

    for (const line of lines) {
      // 基本点: [基本点: 70]
      const baseMatch = line.match(/\[基本点:\s*(\d+)\]/);
      if (baseMatch) {
        parts.push(`<div class="score-base">📊 基本点: <strong>${baseMatch[1]}</strong>点</div>`);
        continue;
      }

      // 加点: [任意のラベル: +13] 説明 または (説明)
      // 「加点」固定ではなく、+数字をトリガーにして加点を識別
      const plusMatch = line.match(/\[[^\]]+:\s*\+(\d+)\]\s*(.*)/);
      if (plusMatch) {
        const [, points, desc = ''] = plusMatch;
        // HTMLタグを除去してから整形
        const cleanDesc = desc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/^[(（]/, '').replace(/[)）]$/, '').trim();
        parts.push(`<div class="score-item score-plus">✅ <span class="score-points">+${points}</span> ${cleanDesc}</div>`);
        continue;
      }

      // 減点: [任意のラベル: -5] 説明 または (説明)
      // 「減点」固定ではなく、-数字をトリガーにして減点を識別
      const minusMatch = line.match(/\[[^\]]+:\s*-(\d+)\]\s*(.*)/);
      if (minusMatch) {
        const [, points, desc = ''] = minusMatch;
        // HTMLタグを除去してから整形
        const cleanDesc = desc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/^[(（]/, '').replace(/[)）]$/, '').trim();
        parts.push(`<div class="score-item score-minus">⚠️ <span class="score-points">-${points}</span> ${cleanDesc}</div>`);
        continue;
      }

      // 合計: [合計: 88]
      const totalMatch = line.match(/\[合計:\s*(\d+)\]/);
      if (totalMatch) {
        parts.push(`<div class="score-total">🎯 合計: <strong>${totalMatch[1]}</strong>点</div>`);
        continue;
      }

      // 加点: 0 のパターン（プラス記号なし）: [加点: 0] 説明
      const zeroAddMatch = line.match(/\[加点:\s*0\]\s*(.*)/);
      if (zeroAddMatch) {
        const [, desc = ''] = zeroAddMatch;
        const cleanDesc = desc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/^[(（]/, '').replace(/[)）]$/, '').trim();
        parts.push(`<div class="score-item score-plus">✅ <span class="score-points">±0</span> ${cleanDesc}</div>`);
        continue;
      }

      // 減点: 0 のパターン（マイナス記号なし）: [減点: 0] 説明
      const zeroSubMatch = line.match(/\[減点:\s*0\]\s*(.*)/);
      if (zeroSubMatch) {
        const [, desc = ''] = zeroSubMatch;
        const cleanDesc = desc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/^[(（]/, '').replace(/[)）]$/, '').trim();
        parts.push(`<div class="score-item score-minus">⚠️ <span class="score-points">±0</span> ${cleanDesc}</div>`);
        continue;
      }

      // 任意のラベルでゼロ点のパターン: [任意のラベル: 0] 説明
      // 加点でも減点でもない中立的な評価項目
      const zeroNeutralMatch = line.match(/\[[^\]]+:\s*0\]\s*(.*)/);
      if (zeroNeutralMatch) {
        const [, desc = ''] = zeroNeutralMatch;
        const cleanDesc = desc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/^[(（]/, '').replace(/[)）]$/, '').trim();
        parts.push(`<div class="score-item score-neutral">➖ <span class="score-points">±0</span> ${cleanDesc}</div>`);
        continue;
      }

      // パースできない行はそのまま表示
      if (line.trim()) {
        parts.push(`<div class="score-item">${line}</div>`);
      }
    }

    return `<div class="score-rationale-card">\n${parts.join('\n')}\n</div>`;
  }

  /**
   * scoreRationaleから最大加点項目と最大減点項目を抽出
   * スコアバーに表示するためのサマリー情報
   */
  private extractTopRationaleItems(rationale: string | string[] | undefined): {
    topPlus: { points: number; desc: string } | null;
    topMinus: { points: number; desc: string } | null;
  } {
    if (!rationale) {
      return { topPlus: null, topMinus: null };
    }

    const rawRationale = Array.isArray(rationale) ? rationale.join('\n') : rationale;
    const lines = rawRationale.split('\n').filter(line => line.trim());

    let topPlus: { points: number; desc: string } | null = null;
    let topMinus: { points: number; desc: string } | null = null;

    for (const line of lines) {
      // 加点: [任意のラベル: +13] (説明)
      // 「加点」固定ではなく、+数字をトリガーにして加点を識別
      const plusMatch = line.match(/\[[^\]]+:\s*\+(\d+)\]\s*(.*)/);
      if (plusMatch) {
        const points = parseInt(plusMatch[1] ?? '0', 10);
        let desc = plusMatch[2] || '';
        // HTMLタグを除去（<p>などが含まれるとレイアウト崩れの原因になるため）
        desc = desc.replace(/<[^>]*>/g, ' ');
        // 改行を含むあらゆる空白文字をスペースに置換
        desc = desc.replace(/\s+/g, ' ');
        // 括弧を除去して説明文全体を使用
        desc = desc.replace(/^[(（]/, '').replace(/[)）]$/, '').trim();

        if (!topPlus || points > topPlus.points) {
          topPlus = { points, desc };
        }
      }

      // 減点: [任意のラベル: -5] (説明)
      // 「減点」固定ではなく、-数字をトリガーにして減点を識別
      const minusMatch = line.match(/\[[^\]]+:\s*-(\d+)\]\s*(.*)/);
      if (minusMatch) {
        const points = parseInt(minusMatch[1] ?? '0', 10);
        let desc = minusMatch[2] || '';
        // HTMLタグを除去
        desc = desc.replace(/<[^>]*>/g, ' ');
        // 改行を含むあらゆる空白文字をスペースに置換
        desc = desc.replace(/\s+/g, ' ');
        // 括弧を除去して説明文全体を使用
        desc = desc.replace(/^[(（]/, '').replace(/[)）]$/, '').trim();

        if (!topMinus || points > topMinus.points) {
          topMinus = { points, desc };
        }
      }
    }

    return { topPlus, topMinus };
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
