/**
 * Affiliate link types for Amazon Associates
 */

export interface AffiliateLink {
    asin: string;
    url: string;
    shortUrl?: string; // Made optional as PA-API might not provide it
    text: string;
    trackingId?: string;
    createdAt?: Date;
    position?: number; // Added to match ArticleGenerator usage
    type?: 'text' | 'button' | 'image'; // Added for flexibility
}

export interface AffiliateLinkConfig {
    partnerTag: string;
    marketplace: AmazonMarketplace;
    linkStyle: 'text' | 'button' | 'image';
    enableShortLink: boolean;
}

export type AmazonMarketplace =
    | 'amazon.co.jp'
    | 'amazon.com'
    | 'amazon.co.uk'
    | 'amazon.de'
    | 'amazon.fr';

export interface LinkValidationResult {
    isValid: boolean;
    asin: string;
    marketplace: AmazonMarketplace;
    hasTrackingId: boolean;
    issues: string[];
}

export interface DisclosureConfig {
    style: 'inline' | 'footer' | 'banner';
    text: string;
    language: 'ja' | 'en';
    includeInEveryPage: boolean;
}

export interface ComplianceCheckResult {
    isCompliant: boolean;
    hasValidLinks: boolean;
    issues: ComplianceIssue[];
}

export interface ComplianceIssue {
    type: 'error' | 'warning';
    code: string;
    message: string;
    suggestion: string;
}

export const DEFAULT_DISCLOSURE_JA = `*本記事にはアフィリエイトリンクが含まれています。商品購入時に当サイトが収益を得る場合があります。*`;

export const DEFAULT_DISCLOSURE_EN = `*This article contains affiliate links. We may earn a commission when you make a purchase through these links.*`;
