import type { AffiliateLink } from './AffiliateTypes';
import type { TechnicalSpecs } from './InvestigationTypes';
import type { StyleRule, TemplateSection } from './QualityTypes';

export { StyleRule, TemplateSection } from './QualityTypes';

export interface ArticleMetadata {
  title: string;
  description: string;
  category: string;
  subcategory?: string | undefined;
  taxonomy_version?: number | undefined;
  category_parent?: string | undefined;
  category_child?: string | undefined;
  amazon_category?: string | undefined;
  classification?:
    | {
        source: string;
        parent_confidence: number;
        child_confidence: number;
        classified_at: string;
        input_hash: string;
        needs_review: boolean;
        parent_runner_up?: { slug: string; probability: number } | undefined;
        child_runner_up?: { slug: string; probability: number } | undefined;
      }
    | undefined;
  taxonomy_version?: number | undefined;
  category_parent?: string | undefined;
  category_child?: string | undefined;
  amazon_category?: string | undefined;
  classification?: {
    source: string;
    parent_confidence: number;
    child_confidence: number;
    classified_at: string;
    input_hash: string;
    needs_review: boolean;
    parent_runner_up?: { slug: string; probability: number } | undefined;
    child_runner_up?: { slug: string; probability: number } | undefined;
  } | undefined;
  manufacturer?: string | undefined;
  tags: string[];
  publishDate: Date;
  asin: string;
  parent_asin?: string | undefined;
  priceRange: string;
  price?: string | undefined;
  investigatedPrice?: string | undefined;
  score?: number | undefined;
  rating?: number | undefined;
  ratingCount?: number | undefined;
  featured: boolean;
  mobileOptimized: boolean;
  seoKeywords: string[];
  lastInvestigated?: string | undefined;
  priceUpdatedAt?: string | undefined; // キャッシュ取得日時（価格・セール情報の最終更新日時）
  images?: string[] | undefined; // Product image URLs for Hugo front matter
  affiliate_url?: string | undefined; // Affiliate link for the hero button
  is_amazon_direct?: boolean | undefined;
  is_amazon_haul?: boolean | undefined;
  is_furusato?: boolean | undefined;
  is_prime?: boolean | undefined;
  municipality?: string | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  releaseDate?: string | undefined;
  availability?: string | undefined;
  loyalty_points?: number | undefined;
  deal_badge?: string | undefined;
  deal_access_type?: string | undefined;
  savings_percentage?: number | undefined;
  technicalSpecs?: TechnicalSpecs | undefined; // 詳細スペック情報（カテゴリ依存）
  hero?: {
    score_rationale: {
      plus: { points: number; desc: string }[];
      minus: { points: number; desc: string }[];
    };
    target_users: string[];
    warnings: string[];
    specs: TechnicalSpecs;
    brand?: string | undefined;
    model?: string | undefined;
    releaseDate?: string | undefined;
    availability?: string | undefined;
  };
  review?: {
    author?: string;
    datePublished?: string;
    summary?: string;
    rating?: number;
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

export interface ArticleSection {
  title: string;
  content: string;
  wordCount: number;
  requiredElements: string[];
}

export interface GeneratedArticle {
  content: string;
  metadata: ArticleMetadata;
  wordCount: number;
  sections: ArticleSection[];
  affiliateLinks: AffiliateLink[];
}
