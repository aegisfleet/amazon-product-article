import { AffiliateLink } from './AffiliateTypes';
import { TechnicalSpecs } from './JulesTypes';
import { StyleRule, TemplateSection } from './QualityTypes';

export { StyleRule, TemplateSection };

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
