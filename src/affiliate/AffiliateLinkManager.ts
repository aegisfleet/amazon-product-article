/**
 * Affiliate_Link_Manager - Amazonアフィリエイトリンクの生成と管理
 */

import { ConfigManager } from '../config/ConfigManager';
import {
    AffiliateLink,
    AffiliateLinkConfig,
    AmazonMarketplace,
    ComplianceCheckResult,
    ComplianceIssue,
    LinkValidationResult
} from '../types/AffiliateTypes';
import { Product } from '../types/Product';
import { Logger } from '../utils/Logger';

export class AffiliateLinkManager {
    private logger: Logger;
    private config: AffiliateLinkConfig;

    constructor(config?: Partial<AffiliateLinkConfig>) {
        this.logger = Logger.getInstance();

        let partnerTag = '';
        try {
            partnerTag = ConfigManager.getInstance().getConfig().amazon.partnerTag;
        } catch (_error) {
            // ConfigManager might not be initialized (e.g. in CLI or tests)
            // This is acceptable as long as config.partnerTag is provided or updated later
        }

        this.config = {
            partnerTag: config?.partnerTag || partnerTag || '',
            marketplace: config?.marketplace || 'amazon.co.jp',
            linkStyle: config?.linkStyle || 'text',
            enableShortLink: config?.enableShortLink ?? true
        };
    }

    /**
     * 商品情報からアフィリエイトリンクを生成
     * PA-APIから取得したdetailPageUrlがある場合はそれを優先する
     */
    generateLinkFromProduct(product: Product, text?: string): AffiliateLink {
        this.logger.info(`Generating affiliate link from product: ${product.asin}`);

        return this.generateAffiliateLink(
            product.asin,
            text || product.title,
            product.detailPageUrl
        );
    }

    /**
     * アフィリエイトリンクを生成
     */
    generateAffiliateLink(asin: string, text?: string, existingUrl?: string): AffiliateLink {
        this.logger.info(`Generating affiliate link for ASIN: ${asin}`);

        if (!this.validateASIN(asin)) {
            throw new Error(`Invalid ASIN format: ${asin}`);
        }

        // 既存のURL（PA-API提供）がある場合はそれを使用し、tagを確実に付与/更新
        let fullUrl: string;
        if (existingUrl) {
            try {
                const url = new URL(existingUrl);
                url.searchParams.set('tag', this.config.partnerTag);
                fullUrl = url.toString();
            } catch {
                const baseUrl = this.getMarketplaceUrl();
                fullUrl = `${baseUrl}/dp/${asin}?tag=${this.config.partnerTag}`;
            }
        } else {
            const baseUrl = this.getMarketplaceUrl();
            fullUrl = `${baseUrl}/dp/${asin}?tag=${this.config.partnerTag}`;
        }

        const baseUrlObj = new URL(fullUrl);
        const shortUrl = this.config.enableShortLink
            ? `${baseUrlObj.protocol}//${baseUrlObj.hostname.replace('www.', '')}/dp/${asin}?tag=${this.config.partnerTag}`
            : fullUrl;

        return {
            asin,
            url: fullUrl,
            shortUrl,
            text: text || 'Amazonで購入する',
            trackingId: this.config.partnerTag,
            createdAt: new Date(),
            type: this.config.linkStyle
        };
    }

    /**
     * リンクを検証
     */
    validateLink(url: string): LinkValidationResult {
        this.logger.info(`Validating affiliate link: ${url}`);

        const issues: string[] = [];
        let asin = '';
        let marketplace: AmazonMarketplace = 'amazon.co.jp';
        let hasTrackingId = false;

        // URLパース
        try {
            const urlObj = new URL(url);

            // マーケットプレイスを特定
            marketplace = this.identifyMarketplace(urlObj.hostname);

            // ASINを抽出
            const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
            if (asinMatch && asinMatch[1]) {
                asin = asinMatch[1].toUpperCase();
            } else {
                issues.push('ASINが見つかりません');
            }

            // トラッキングIDをチェック
            const tagParam = urlObj.searchParams.get('tag');
            if (tagParam) {
                hasTrackingId = true;
                if (tagParam !== this.config.partnerTag) {
                    issues.push(`トラッキングIDが設定と異なります (expected: ${this.config.partnerTag}, got: ${tagParam})`);
                }
            } else {
                issues.push('トラッキングID (tag) パラメータがありません');
            }

        } catch (_e) {
            issues.push('無効なURL形式です');
        }

        return {
            isValid: issues.length === 0,
            asin,
            marketplace,
            hasTrackingId,
            issues
        };
    }



    /**
     * コンプライアンスチェック
     */
    checkCompliance(content: string): ComplianceCheckResult {
        this.logger.info('Checking affiliate compliance');

        const issues: ComplianceIssue[] = [];

        // アフィリエイトリンクの検出と検証
        const links = this.extractAffiliateLinks(content);
        let hasValidLinks = true;

        if (links.length === 0) {
            issues.push({
                type: 'warning',
                code: 'NO_AFFILIATE_LINKS',
                message: 'アフィリエイトリンクが見つかりません',
                suggestion: '商品へのアフィリエイトリンクを追加してください'
            });
            hasValidLinks = false;
        } else {
            // 各リンクを検証
            for (const link of links) {
                const validation = this.validateLink(link);
                if (!validation.isValid) {
                    hasValidLinks = false;
                    validation.issues.forEach(issue => {
                        issues.push({
                            type: 'warning',
                            code: 'INVALID_LINK',
                            message: `リンク検証エラー: ${issue}`,
                            suggestion: 'リンク形式を確認してください'
                        });
                    });
                }
            }
        }

        // リンク過多チェック
        if (links.length > 10) {
            issues.push({
                type: 'warning',
                code: 'TOO_MANY_LINKS',
                message: `アフィリエイトリンクが多すぎます (${links.length}件)`,
                suggestion: 'リンク数を10件以下に抑えることを推奨します'
            });
        }

        return {
            isCompliant: issues.filter(i => i.type === 'error').length === 0,
            hasValidLinks,
            issues
        };
    }

    /**
     * 記事内のアフィリエイトリンクを更新
     */
    updateLinksInContent(content: string, newPartnerTag?: string): string {
        this.logger.info('Updating affiliate links in content');

        const tag = newPartnerTag || this.config.partnerTag;

        // 既存のAmazonリンクを検出して更新
        const amazonLinkPattern = /(https?:\/\/(www\.)?amazon\.(co\.jp|com|co\.uk|de|fr)\/[^\s)]*)/g;

        return content.replace(amazonLinkPattern, (match) => {
            try {
                const url = new URL(match);
                url.searchParams.set('tag', tag);
                return url.toString();
            } catch {
                return match;
            }
        });
    }

    /**
     * Markdown形式のリンクを生成
     */
    generateMarkdownLink(asin: string, text: string): string {
        const link = this.generateAffiliateLink(asin, text);

        switch (this.config.linkStyle) {
            case 'button':
                return `<a href="${link.url}" class="affiliate-button" target="_blank" rel="nofollow noopener">${link.text}</a>`;
            case 'image':
                return `[![${link.text}](https://images-na.ssl-images-amazon.com/images/P/${asin}.jpg)](${link.url})`;
            default:
                return `[${link.text}](${link.url})`;
        }
    }

    /**
     * 設定を更新
     */
    updateConfig(config: Partial<AffiliateLinkConfig>): void {
        this.config = { ...this.config, ...config };
        this.logger.info('Affiliate link config updated');
    }



    // === Private methods ===

    /**
     * ASINの形式を検証
     */
    private validateASIN(asin: string): boolean {
        // ASINは10文字の英数字
        return /^[A-Z0-9]{10}$/i.test(asin);
    }

    /**
     * マーケットプレイスのURLを取得
     */
    private getMarketplaceUrl(): string {
        const urls: Record<AmazonMarketplace, string> = {
            'amazon.co.jp': 'https://www.amazon.co.jp',
            'amazon.com': 'https://www.amazon.com',
            'amazon.co.uk': 'https://www.amazon.co.uk',
            'amazon.de': 'https://www.amazon.de',
            'amazon.fr': 'https://www.amazon.fr'
        };
        return urls[this.config.marketplace];
    }

    /**
     * ホスト名が指定のマーケットプレイスに該当するかを判定
     * 完全一致、またはサブドメインとしての一致のみ許可する
     * 例: "amazon.co.jp" または "www.amazon.co.jp" は OK
     *     "evil-amazon.co.jp.example.com" は NG
     */
    private isMarketplaceHost(hostname: string, domain: AmazonMarketplace): boolean {
        const lowerHost = hostname.toLowerCase();
        const lowerDomain = domain.toLowerCase();
        return lowerHost === lowerDomain || lowerHost.endsWith('.' + lowerDomain);
    }

    /**
     * ホスト名からマーケットプレイスを特定
     */
    private identifyMarketplace(hostname: string): AmazonMarketplace {
        if (this.isMarketplaceHost(hostname, 'amazon.co.jp')) return 'amazon.co.jp';
        if (this.isMarketplaceHost(hostname, 'amazon.com')) return 'amazon.com';
        if (this.isMarketplaceHost(hostname, 'amazon.co.uk')) return 'amazon.co.uk';
        if (this.isMarketplaceHost(hostname, 'amazon.de')) return 'amazon.de';
        if (this.isMarketplaceHost(hostname, 'amazon.fr')) return 'amazon.fr';
        return 'amazon.co.jp'; // デフォルト
    }




    /**
     * コンテンツからアフィリエイトリンクを抽出
     */
    private extractAffiliateLinks(content: string): string[] {
        const amazonLinkPattern = /https?:\/\/(www\.)?amazon\.(co\.jp|com|co\.uk|de|fr)\/[^\s)"]*/g;
        const matches = content.match(amazonLinkPattern);
        return matches || [];
    }
}
