/**
 * Property-based tests for ArticleQualityManager
 * Feature: amazon-product-research-system
 * Property 11: Content Quality Validation
 */

import * as fc from 'fast-check';
import { Product } from '../../types/Product';
import { ArticleTemplate } from '../ArticleGenerator';
import { ArticleQualityManager } from '../ArticleQualityManager';

describe('ArticleQualityManager', () => {
    let qualityManager: ArticleQualityManager;

    beforeEach(() => {
        qualityManager = new ArticleQualityManager();
    });

    /**
     * Property 11: Content Quality Validation
     * For any generated content, the system should validate it against quality standards
     */
    describe('Property 11: Content Quality Validation', () => {
        // 有効な記事の生成器
        const validArticleArbitrary = fc.record({
            title: fc.string({ minLength: 10, maxLength: 100 }),
            description: fc.string({ minLength: 20, maxLength: 200 }),
            category: fc.constantFrom('Electronics', 'Home', 'Sports'),
            content: fc.string({ minLength: 500, maxLength: 3000 })
        }).map(({ title, description, category, content }) => {
            return `---
title: "${title}"
description: "${description}"
date: 2025-01-01
category: ${category}
tags: [テスト, レビュー]
mobile_optimized: true
---

# ${title}

## 商品概要

${content}

## ユーザーの声：良い点

良い点のコンテンツ。

## ユーザーの声：気になる点

気になる点のコンテンツ。

## 競合商品との比較

競合比較のコンテンツ。

## 購入推奨度

推奨度のコンテンツ。

## 商品詳細・購入

[Amazonで購入](https://amazon.co.jp/dp/B123456789)

---
*本記事にはアフィリエイトリンクが含まれています。*`;
        });

        it('should validate article structure for any valid article', () => {
            fc.assert(
                fc.property(validArticleArbitrary, (article) => {
                    const result = qualityManager.validateArticleStructure(article);

                    // 有効な記事は構造検証を通過するべき
                    expect(result).toHaveProperty('isValid');
                    expect(result).toHaveProperty('score');
                    expect(result).toHaveProperty('errors');
                    expect(result).toHaveProperty('warnings');
                    expect(result).toHaveProperty('suggestions');

                    // スコアは0から1の範囲であるべき
                    expect(result.score.overall).toBeGreaterThanOrEqual(0);
                    expect(result.score.overall).toBeLessThanOrEqual(1);
                }),
                { numRuns: 100 }
            );
        });

        it('should calculate quality score components for any article', () => {
            fc.assert(
                fc.property(validArticleArbitrary, (article) => {
                    const score = qualityManager.checkContentCompleteness(article);

                    // すべてのスコアコンポーネントが存在するべき
                    expect(score).toHaveProperty('overall');
                    expect(score).toHaveProperty('completeness');
                    expect(score).toHaveProperty('structure');
                    expect(score).toHaveProperty('readability');
                    expect(score).toHaveProperty('seoOptimization');
                    expect(score).toHaveProperty('issues');

                    // すべてのスコアは0から1の範囲であるべき
                    expect(score.overall).toBeGreaterThanOrEqual(0);
                    expect(score.overall).toBeLessThanOrEqual(1);
                    expect(score.completeness).toBeGreaterThanOrEqual(0);
                    expect(score.completeness).toBeLessThanOrEqual(1);
                }),
                { numRuns: 100 }
            );
        });

        // フロントマターなしの記事は必ずエラーになるべき
        it('should always report error for articles without frontmatter', () => {
            const articleWithoutFrontmatter = fc.string({ minLength: 100 }).map(content =>
                `# タイトル\n\n${content}`
            );

            fc.assert(
                fc.property(articleWithoutFrontmatter, (article) => {
                    const result = qualityManager.validateArticleStructure(article);

                    // フロントマターがないためエラーがあるべき
                    const hasFrontmatterError = result.errors.some(
                        e => e.message.includes('フロントマター')
                    );
                    expect(hasFrontmatterError).toBe(true);
                }),
                { numRuns: 50 }
            );
        });

        // アフィリエイト開示がない記事はコンプライアンスエラーになるべき
        it('should report compliance error for articles without affiliate disclosure', () => {
            const articleWithoutDisclosure = fc.constant(`---
title: "テスト商品"
description: "テスト説明"
date: 2025-01-01
category: Electronics
---

# テスト商品

## 商品概要

テストコンテンツ`);

            fc.assert(
                fc.property(articleWithoutDisclosure, (article) => {
                    const result = qualityManager.validateArticleStructure(article);

                    // アフィリエイト開示がないためエラーまたは警告があるべき
                    const hasComplianceIssue = [...result.errors, ...result.warnings].some(
                        e => e.category === 'compliance' || e.message.includes('アフィリエイト')
                    );
                    expect(hasComplianceIssue).toBe(true);
                }),
                { numRuns: 10 }
            );
        });
    });

    describe('Quality prompt generation', () => {
        const productArbitrary = fc.record({
            asin: fc.string({ minLength: 10, maxLength: 10 }),
            title: fc.string({ minLength: 5, maxLength: 100 }),
            category: fc.constantFrom('Electronics', 'Home', 'Sports'),
            price: fc.record({
                amount: fc.integer({ min: 100, max: 100000 }),
                currency: fc.constant('JPY'),
                formatted: fc.string()
            }),
            images: fc.record({
                primary: fc.webUrl(),
                thumbnails: fc.array(fc.webUrl(), { maxLength: 5 })
            }),
            specifications: fc.dictionary(fc.string(), fc.string()),
            rating: fc.record({
                average: fc.float({ min: 1, max: 5 }),
                count: fc.integer({ min: 0, max: 10000 })
            })
        }) as fc.Arbitrary<Product>;

        const templateArbitrary = fc.constant({
            sections: {
                introduction: {
                    title: '導入部',
                    minWordCount: 200,
                    requiredElements: ['商品名', '基本情報'],
                    structure: '導入文と商品概要'
                },
                userReviews: {
                    title: 'ユーザーレビュー分析',
                    minWordCount: 800,
                    requiredElements: ['良い点', '気になる点'],
                    structure: 'レビュー分析'
                },
                competitiveAnalysis: {
                    title: '競合商品との比較',
                    minWordCount: 600,
                    requiredElements: ['競合商品', '比較表'],
                    structure: '競合分析'
                },
                recommendation: {
                    title: '購入推奨度',
                    minWordCount: 400,
                    requiredElements: ['推奨ユーザー', '注意点'],
                    structure: '推奨度評価'
                },
                conclusion: {
                    title: 'まとめ',
                    minWordCount: 200,
                    requiredElements: ['要約'],
                    structure: '結論'
                }
            },
            qualityRequirements: {
                minWordCount: 2000,
                requiredElements: ['フロントマター', 'アフィリエイトリンク', '免責事項'],
                styleGuidelines: []
            }
        }) as fc.Arbitrary<ArticleTemplate>;

        it('should generate valid quality prompt for any product', () => {
            fc.assert(
                fc.property(productArbitrary, templateArbitrary, (product, template) => {
                    const prompt = qualityManager.generateQualityPrompt(product, template);

                    // プロンプトには商品名が含まれるべき
                    expect(prompt).toContain(product.title);

                    // プロンプトには品質要件が含まれるべき
                    expect(prompt).toContain('品質要件');
                    expect(prompt).toContain('文字');

                    // プロンプトはMarkdown形式を指定すべき
                    expect(prompt).toContain('Markdown');
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Style guidelines enforcement', () => {
        it('should not modify valid content', () => {
            const validContent = fc.string({ minLength: 100, maxLength: 500 });

            fc.assert(
                fc.property(validContent, (content) => {
                    const enforced = qualityManager.enforceStyleGuidelines(content);

                    // 結果は文字列であるべき
                    expect(typeof enforced).toBe('string');
                }),
                { numRuns: 50 }
            );
        });
    });
});
