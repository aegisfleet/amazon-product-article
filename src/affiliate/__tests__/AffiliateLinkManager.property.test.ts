/**
 * Property-based tests for AffiliateLinkManager
 * Feature: amazon-product-research-system
 * Property 13: Affiliate Link Generation and Compliance
 * Property 14: Legal Disclosure Compliance
 */

import * as fc from 'fast-check';
import { AffiliateLinkManager } from '../AffiliateLinkManager';

describe('AffiliateLinkManager', () => {
    let linkManager: AffiliateLinkManager;

    beforeEach(() => {
        linkManager = new AffiliateLinkManager({
            partnerTag: 'test-tag-21',
            marketplace: 'amazon.co.jp'
        });
    });

    /**
     * Property 13: Affiliate Link Generation and Compliance
     * For any product, the system should generate properly formatted Amazon affiliate links
     * with correct tracking parameters and validate them against Amazon Associates requirements.
     */
    describe('Property 13: Affiliate Link Generation and Compliance', () => {
        // 有効なASINの生成器
        const validAsinArbitrary = fc.stringMatching(/^[A-Z0-9]{10}$/);

        it('should generate valid affiliate links for any valid ASIN', () => {
            fc.assert(
                fc.property(validAsinArbitrary, (asin) => {
                    const link = linkManager.generateAffiliateLink(asin);

                    // リンクにはASINが含まれるべき
                    expect(link.url).toContain(asin);
                    expect(link.asin).toBe(asin);

                    // リンクにはトラッキングIDが含まれるべき
                    expect(link.url).toContain('tag=');
                    expect(link.trackingId).toBe('test-tag-21');

                    // リンクはAmazonドメインであるべき
                    expect(link.url).toContain('amazon.co.jp');

                    // 生成日時が設定されているべき
                    expect(link.createdAt).toBeInstanceOf(Date);
                }),
                { numRuns: 100 }
            );
        });

        it('should validate its own generated links', () => {
            fc.assert(
                fc.property(validAsinArbitrary, (asin) => {
                    const link = linkManager.generateAffiliateLink(asin);
                    const validation = linkManager.validateLink(link.url);

                    // 自分で生成したリンクは必ず有効であるべき
                    expect(validation.isValid).toBe(true);
                    expect(validation.asin.toUpperCase()).toBe(asin.toUpperCase());
                    expect(validation.hasTrackingId).toBe(true);
                    expect(validation.issues).toHaveLength(0);
                }),
                { numRuns: 100 }
            );
        });

        it('should reject invalid ASIN formats', () => {
            const invalidAsinArbitrary = fc.oneof(
                fc.string({ minLength: 1, maxLength: 9 }),  // 短すぎる
                fc.string({ minLength: 11, maxLength: 20 }), // 長すぎる
                fc.constant(''),  // 空文字
                fc.constant('ASIN!@#$%^')  // 特殊文字を含む
            );

            fc.assert(
                fc.property(invalidAsinArbitrary, (asin) => {
                    expect(() => {
                        linkManager.generateAffiliateLink(asin);
                    }).toThrow();
                }),
                { numRuns: 50 }
            );
        });

        it('should detect missing tracking IDs in URLs', () => {
            fc.assert(
                fc.property(validAsinArbitrary, (asin) => {
                    const urlWithoutTag = `https://www.amazon.co.jp/dp/${asin}`;
                    const validation = linkManager.validateLink(urlWithoutTag);

                    // トラッキングIDがないリンクは無効
                    expect(validation.isValid).toBe(false);
                    expect(validation.hasTrackingId).toBe(false);
                    expect(validation.issues.some(i => i.includes('tag'))).toBe(true);
                }),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Property 14: Legal Disclosure Compliance
     * For any generated article or site page, affiliate disclosure statements 
     * should be included as required by law.
     */
    describe('Property 14: Legal Disclosure Compliance', () => {
        const contentArbitrary = fc.string({ minLength: 100, maxLength: 2000 });

        it('should insert disclosure for any content', () => {
            fc.assert(
                fc.property(contentArbitrary, (content) => {
                    const withDisclosure = linkManager.insertDisclosure(content, 'bottom');

                    // 開示文が追加されているべき
                    expect(withDisclosure).toContain('アフィリエイト');

                    // 元のコンテンツも含まれているべき
                    expect(withDisclosure).toContain(content);
                }),
                { numRuns: 100 }
            );
        });

        it('should not duplicate disclosure if already present', () => {
            fc.assert(
                fc.property(contentArbitrary, (content) => {
                    const contentWithDisclosure = content + '\n\nアフィリエイトリンクが含まれています';
                    const result = linkManager.insertDisclosure(contentWithDisclosure, 'bottom');

                    // 開示文が重複していないことを確認
                    const disclosureCount = (result.match(/アフィリエイトリンク/g) || []).length;
                    expect(disclosureCount).toBeLessThanOrEqual(2);
                }),
                { numRuns: 50 }
            );
        });

        it('should detect disclosure in content with various patterns', () => {
            const disclosurePatterns = [
                'アフィリエイトリンクが含まれています',
                '当サイトが収益を得る場合があります',
                'This article contains affiliate links',
                '本記事にはアフィリエイトリンクが含まれています'
            ];

            disclosurePatterns.forEach(pattern => {
                const compliance = linkManager.checkCompliance(`テスト内容\n${pattern}`);
                expect(compliance.hasDisclosure).toBe(true);
            });
        });

        it('should report non-compliance for content without disclosure', () => {
            fc.assert(
                fc.property(fc.string({ minLength: 100, maxLength: 500 }), (content) => {
                    // アフィリエイトに関連する言葉を含まないコンテンツ
                    const cleanContent = content.replace(/アフィリエイト|affiliate|収益|コミッション|広告/gi, '');
                    const compliance = linkManager.checkCompliance(cleanContent);

                    // 開示文がなければ非準拠
                    if (!compliance.hasDisclosure) {
                        expect(compliance.issues.some(i => i.code === 'MISSING_DISCLOSURE')).toBe(true);
                    }
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Link format generation', () => {
        const validAsinArbitrary = fc.stringMatching(/^[A-Z0-9]{10}$/);

        const textArbitrary = fc.string({ minLength: 1, maxLength: 50 });

        it('should generate valid Markdown links for any ASIN and text', () => {
            fc.assert(
                fc.property(validAsinArbitrary, textArbitrary, (asin, text) => {
                    const markdown = linkManager.generateMarkdownLink(asin, text);

                    // Markdown形式であるべき
                    expect(markdown).toMatch(/\[.*\]\(.*\)/);

                    // ASINが含まれるべき
                    expect(markdown).toContain(asin);

                    // トラッキングIDが含まれるべき
                    expect(markdown).toContain('tag=');
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('Content link updates', () => {
        const validAsinArbitrary = fc.stringMatching(/^[A-Z0-9]{10}$/);

        it('should update links with new partner tag', () => {
            fc.assert(
                fc.property(validAsinArbitrary, (asin) => {
                    const content = `Check out [this product](https://www.amazon.co.jp/dp/${asin}?tag=old-tag-21)`;
                    const updated = linkManager.updateLinksInContent(content, 'new-tag-21');

                    // 新しいタグが設定されているべき
                    expect(updated).toContain('tag=new-tag-21');
                    expect(updated).not.toContain('tag=old-tag-21');
                }),
                { numRuns: 50 }
            );
        });
    });
});
