import type { AffiliateLink } from './AffiliateTypes';
import type { TechnicalSpecs } from './JulesTypes';
import type { StyleRule, TemplateSection } from './QualityTypes';

export { StyleRule, TemplateSection } from './QualityTypes';

export interface ArticleMetadata {
  title: string;
  description: string;
  category: string;
  subcategory?: string | undefined;
  manufacturer?: string | undefined;
  tags: string[];
  publishDate: Date;
  asin: string;
  priceRange: string;
  price?: string | undefined;
  score?: number | undefined;
  rating?: number | undefined;
  ratingCount?: number | undefined;
  featured: boolean;
  mobileOptimized: boolean;
  seoKeywords: string[];
  lastInvestigated?: string | undefined;
  images?: string[] | undefined; // Product image URLs for Hugo front matter
  affiliate_url?: string | undefined; // Affiliate link for the hero button
  is_amazon_direct?: boolean | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  releaseDate?: string | undefined;
  availability?: string | undefined;
  loyalty_points?: number | undefined;
  deal_badge?: string | undefined;
  savings_percentage?: number | undefined;
  technicalSpecs?: TechnicalSpecs | undefined; // 詳細スペック情報（カテゴリ依存）
  hero?: {
    score_rationale: {
      top_plus: { points: number; desc: string } | null;
      top_minus: { points: number; desc: string } | null;
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
