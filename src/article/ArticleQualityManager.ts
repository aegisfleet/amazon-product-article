/**
 * Article_Quality_Manager - 記事品質の管理とテンプレート制御
 */

import { Product } from '../types/Product';
import {
    ContentRequirements,
    QualityIssue,
    QualityPromptConfig,
    QualityScore,
    StyleRule,
    ValidationResult
} from '../types/QualityTypes';
import { Logger } from '../utils/Logger';
import { ArticleTemplate } from './ArticleGenerator';

export class ArticleQualityManager {
    private logger: Logger;
    private defaultRequirements: ContentRequirements;
    private defaultStyleRules: StyleRule[];

    constructor() {
        this.logger = Logger.getInstance();
        this.defaultRequirements = this.createDefaultRequirements();
        this.defaultStyleRules = this.createDefaultStyleRules();
    }

    /**
     * 記事構造を検証
     */
    validateArticleStructure(article: string): ValidationResult {
        this.logger.info('Validating article structure');

        const errors: QualityIssue[] = [];
        const warnings: QualityIssue[] = [];
        const suggestions: QualityIssue[] = [];

        // フロントマターの検証
        const frontMatterValidation = this.validateFrontMatter(article);
        errors.push(...frontMatterValidation.errors);
        warnings.push(...frontMatterValidation.warnings);

        // セクション構造の検証
        const sectionValidation = this.validateSections(article);
        errors.push(...sectionValidation.errors);
        warnings.push(...sectionValidation.warnings);
        suggestions.push(...sectionValidation.suggestions);

        // コンテンツの検証
        const contentValidation = this.validateContent(article);
        errors.push(...contentValidation.errors);
        warnings.push(...contentValidation.warnings);
        suggestions.push(...contentValidation.suggestions);

        // スコア計算
        const score = this.calculateQualityScore(article, errors, warnings);

        return {
            isValid: errors.length === 0,
            score,
            errors,
            warnings,
            suggestions
        };
    }

    /**
     * 品質プロンプトを生成
     */
    generateQualityPrompt(product: Product, template: ArticleTemplate): string {
        this.logger.info(`Generating quality prompt for product: ${product.title}`);

        const config: QualityPromptConfig = {
            productName: product.title,
            sectionRequirements: template.sections,
            qualityRequirements: this.defaultRequirements,
            targetAudience: 'モバイルユーザーを中心とした一般消費者',
            tone: 'professional'
        };

        return this.buildPrompt(config);
    }

    /**
     * コンテンツの完全性をチェック
     */
    checkContentCompleteness(article: string): QualityScore {
        this.logger.info('Checking content completeness');

        const wordCount = this.countWords(article);
        const sections = this.extractSections(article);
        const hasRequiredElements = this.checkRequiredElements(article);

        const completeness = this.calculateCompleteness(sections, hasRequiredElements);
        const structure = this.calculateStructureScore(sections);
        const readability = this.calculateReadabilityScore(article);
        const seoOptimization = this.calculateSEOScore(article);

        const issues: QualityIssue[] = [];

        // 最低文字数チェック
        if (wordCount < this.defaultRequirements.minWordCount) {
            issues.push({
                type: 'warning',
                category: 'content',
                message: `文字数が不足しています (${wordCount}/${this.defaultRequirements.minWordCount})`,
                suggestion: `最低${this.defaultRequirements.minWordCount}文字以上を目標にしてください`
            });
        }

        // 必須セクションチェック
        const missingSections = this.findMissingSections(sections);
        missingSections.forEach(section => {
            issues.push({
                type: 'error',
                category: 'structure',
                message: `必須セクション「${section}」がありません`,
                suggestion: `「${section}」セクションを追加してください`
            });
        });

        const overall = (completeness + structure + readability + seoOptimization) / 4;

        return {
            overall,
            completeness,
            structure,
            readability,
            seoOptimization,
            issues
        };
    }

    /**
     * スタイルガイドラインを適用
     */
    enforceStyleGuidelines(content: string): string {
        this.logger.info('Enforcing style guidelines');

        let enforced = content;

        // 各スタイルルールを適用
        for (const rule of this.defaultStyleRules) {
            if (rule.validator && !rule.validator(enforced)) {
                enforced = this.applyStyleFix(enforced, rule);
            }
        }

        return enforced;
    }

    /**
     * デフォルトの品質要件を作成
     */
    private createDefaultRequirements(): ContentRequirements {
        return {
            minWordCount: 2000,
            maxWordCount: 5000,
            requiredSections: [
                '商品概要',
                'ユーザーの声：良い点',
                'ユーザーの声：気になる点',
                '競合商品との比較',
                '購入推奨度',
                '商品詳細・購入'
            ],
            requiredElements: [
                'フロントマター',
                'アフィリエイトリンク',
                '免責事項'
            ],
            styleGuidelines: this.createDefaultStyleRules()
        };
    }

    /**
     * デフォルトのスタイルルールを作成
     */
    private createDefaultStyleRules(): StyleRule[] {
        return [
            {
                rule: 'sentence-length',
                description: '一文は80文字以内に収める',
                example: '長い文章は分割して読みやすくします',
                validator: (content) => {
                    const sentences = content.split(/[。！？]/);
                    return sentences.every(s => s.length <= 80);
                }
            },
            {
                rule: 'paragraph-length',
                description: '段落は300文字以内に収める',
                example: '長い段落は分割します',
                validator: (content) => {
                    const paragraphs = content.split(/\n\n/);
                    return paragraphs.every(p => p.length <= 300);
                }
            },
            {
                rule: 'heading-hierarchy',
                description: '見出しは階層順に使用する',
                example: 'h1 > h2 > h3 の順序を守る',
                validator: (content) => {
                    const headings = content.match(/^#+\s/gm);
                    if (!headings) return true;
                    let lastLevel = 0;
                    return headings.every(h => {
                        const level = h.trim().length - 1;
                        const valid = level <= lastLevel + 1;
                        lastLevel = level;
                        return valid;
                    });
                }
            },
            {
                rule: 'mobile-friendly',
                description: 'モバイル表示に適した構成にする',
                example: '短い段落と適切な余白',
                validator: () => true // モバイル対応は別途チェック
            },
            {
                rule: 'affiliate-disclosure',
                description: 'アフィリエイト開示を含める',
                example: '*本記事にはアフィリエイトリンクが含まれています。*',
                validator: (content) => {
                    return content.includes('アフィリエイト');
                }
            }
        ];
    }

    /**
     * フロントマターを検証
     */
    private validateFrontMatter(article: string): { errors: QualityIssue[]; warnings: QualityIssue[] } {
        const errors: QualityIssue[] = [];
        const warnings: QualityIssue[] = [];

        const frontMatterMatch = article.match(/^---\n([\s\S]*?)\n---/);

        if (!frontMatterMatch || !frontMatterMatch[1]) {
            errors.push({
                type: 'error',
                category: 'structure',
                message: 'フロントマターがありません',
                suggestion: '記事の先頭に---で囲まれたフロントマターを追加してください'
            });
            return { errors, warnings };
        }

        const frontMatter: string = frontMatterMatch[1];
        const requiredFields = ['title', 'description', 'date', 'category'];

        for (const field of requiredFields) {
            if (!frontMatter.includes(`${field}:`)) {
                errors.push({
                    type: 'error',
                    category: 'structure',
                    message: `フロントマターに必須フィールド「${field}」がありません`,
                    location: 'frontmatter'
                });
            }
        }

        // オプションフィールドのチェック
        const optionalFields = ['tags', 'mobile_optimized', 'asin'];
        for (const field of optionalFields) {
            if (!frontMatter.includes(`${field}:`)) {
                warnings.push({
                    type: 'warning',
                    category: 'seo',
                    message: `フロントマターにオプションフィールド「${field}」がありません`,
                    location: 'frontmatter',
                    suggestion: `${field}を追加するとSEOが向上します`
                });
            }
        }

        return { errors, warnings };
    }

    /**
     * セクション構造を検証
     */
    private validateSections(article: string): { errors: QualityIssue[]; warnings: QualityIssue[]; suggestions: QualityIssue[] } {
        const errors: QualityIssue[] = [];
        const warnings: QualityIssue[] = [];
        const suggestions: QualityIssue[] = [];

        const sections = this.extractSections(article);

        // 必須セクションのチェック
        for (const requiredSection of this.defaultRequirements.requiredSections) {
            if (!sections.some(s => s.title.includes(requiredSection))) {
                errors.push({
                    type: 'error',
                    category: 'structure',
                    message: `必須セクション「${requiredSection}」がありません`,
                    suggestion: `「## ${requiredSection}」セクションを追加してください`
                });
            }
        }

        // セクションの順序チェック
        const sectionOrder = this.checkSectionOrder(sections);
        if (!sectionOrder.isCorrect) {
            warnings.push({
                type: 'warning',
                category: 'structure',
                message: 'セクションの順序が推奨順序と異なります',
                suggestion: sectionOrder.suggestedOrder
            });
        }

        return { errors, warnings, suggestions };
    }

    /**
     * コンテンツを検証
     */
    private validateContent(article: string): { errors: QualityIssue[]; warnings: QualityIssue[]; suggestions: QualityIssue[] } {
        const errors: QualityIssue[] = [];
        const warnings: QualityIssue[] = [];
        const suggestions: QualityIssue[] = [];

        const wordCount = this.countWords(article);

        // 文字数チェック
        if (wordCount < this.defaultRequirements.minWordCount) {
            warnings.push({
                type: 'warning',
                category: 'content',
                message: `文字数が少なめです (${wordCount}文字)`,
                suggestion: `最低${this.defaultRequirements.minWordCount}文字を目標にしてください`
            });
        }

        if (this.defaultRequirements.maxWordCount && wordCount > this.defaultRequirements.maxWordCount) {
            warnings.push({
                type: 'warning',
                category: 'content',
                message: `文字数が多すぎます (${wordCount}文字)`,
                suggestion: `${this.defaultRequirements.maxWordCount}文字以内に収めると読みやすくなります`
            });
        }

        // アフィリエイト開示チェック
        if (!article.includes('アフィリエイト')) {
            errors.push({
                type: 'error',
                category: 'compliance',
                message: 'アフィリエイト開示がありません',
                suggestion: '記事末尾にアフィリエイト開示文を追加してください'
            });
        }

        // リンクチェック
        const affiliateLinkPattern = /\[.*?\]\(https:\/\/.*?amazon.*?\)/;
        if (!affiliateLinkPattern.test(article)) {
            warnings.push({
                type: 'warning',
                category: 'content',
                message: 'アフィリエイトリンクが見つかりません',
                suggestion: '商品へのアフィリエイトリンクを追加してください'
            });
        }

        return { errors, warnings, suggestions };
    }

    /**
     * 品質スコアを計算
     */
    private calculateQualityScore(article: string, errors: QualityIssue[], warnings: QualityIssue[]): QualityScore {
        const sections = this.extractSections(article);

        const completeness = this.calculateCompleteness(sections, this.checkRequiredElements(article));
        const structure = this.calculateStructureScore(sections);
        const readability = this.calculateReadabilityScore(article);
        const seoOptimization = this.calculateSEOScore(article);

        // エラーと警告に基づいてスコアを調整
        let overall = (completeness + structure + readability + seoOptimization) / 4;
        overall -= errors.length * 0.1;
        overall -= warnings.length * 0.05;
        overall = Math.max(0, Math.min(1, overall));

        return {
            overall,
            completeness,
            structure,
            readability,
            seoOptimization,
            issues: [...errors, ...warnings]
        };
    }

    /**
     * 完全性スコアを計算
     */
    private calculateCompleteness(sections: Array<{ title: string; content: string }>, hasRequiredElements: boolean): number {
        const requiredSections = this.defaultRequirements.requiredSections;
        const foundSections = sections.filter(s =>
            requiredSections.some(req => s.title.includes(req))
        ).length;

        const sectionScore = foundSections / requiredSections.length;
        const elementScore = hasRequiredElements ? 1 : 0.5;

        return (sectionScore + elementScore) / 2;
    }

    /**
     * 構造スコアを計算
     */
    private calculateStructureScore(sections: Array<{ title: string; content: string }>): number {
        if (sections.length === 0) return 0;

        let score = 1;

        // セクション数チェック
        if (sections.length < 4) score -= 0.2;
        if (sections.length > 10) score -= 0.1;

        // 各セクションのコンテンツ長チェック
        const emptySections = sections.filter(s => s.content.trim().length < 50).length;
        score -= emptySections * 0.1;

        return Math.max(0, score);
    }

    /**
     * 可読性スコアを計算
     */
    private calculateReadabilityScore(article: string): number {
        let score = 1;

        // 段落長チェック
        const paragraphs = article.split(/\n\n/).filter(p => p.trim());
        const longParagraphs = paragraphs.filter(p => p.length > 300).length;
        score -= longParagraphs * 0.05;

        // 文長チェック
        const sentences = article.split(/[。！？]/).filter(s => s.trim());
        const longSentences = sentences.filter(s => s.length > 80).length;
        score -= longSentences * 0.02;

        // 改行の適切さ
        const lineBreakRatio = (article.match(/\n/g) || []).length / article.length;
        if (lineBreakRatio < 0.01) score -= 0.1;
        if (lineBreakRatio > 0.1) score -= 0.05;

        return Math.max(0, Math.min(1, score));
    }

    /**
     * SEOスコアを計算
     */
    private calculateSEOScore(article: string): number {
        let score = 0.5;

        // フロントマターチェック
        if (article.match(/^---\n[\s\S]*?\n---/)) score += 0.2;

        // タイトル(h1)チェック
        if (article.match(/^# /m)) score += 0.1;

        // カテゴリ・タグチェック
        if (article.includes('category:')) score += 0.1;
        if (article.includes('tags:')) score += 0.1;

        return Math.min(1, score);
    }

    /**
     * セクションを抽出
     */
    private extractSections(article: string): Array<{ title: string; content: string }> {
        const sections: Array<{ title: string; content: string }> = [];
        const sectionPattern = /^##\s+(.+)$/gm;

        let match;
        let lastIndex = 0;
        let lastTitle = '';

        // フロントマターをスキップ
        const contentStart = article.indexOf('---', article.indexOf('---') + 3);
        const content = contentStart > 0 ? article.substring(contentStart + 3) : article;

        while ((match = sectionPattern.exec(content)) !== null) {
            if (lastTitle) {
                sections.push({
                    title: lastTitle,
                    content: content.substring(lastIndex, match.index).trim()
                });
            }
            lastTitle = match[1] || '';
            lastIndex = match.index + match[0].length;
        }

        if (lastTitle) {
            sections.push({
                title: lastTitle,
                content: content.substring(lastIndex).trim()
            });
        }

        return sections;
    }

    /**
     * 必須要素があるかチェック
     */
    private checkRequiredElements(article: string): boolean {
        const hasFrontMatter = article.match(/^---\n[\s\S]*?\n---/) !== null;
        const hasAffiliateLink = article.includes('amazon') || article.includes('amzn');
        const hasDisclosure = article.includes('アフィリエイト');

        return hasFrontMatter && hasAffiliateLink && hasDisclosure;
    }

    /**
     * 不足しているセクションを検出
     */
    private findMissingSections(sections: Array<{ title: string; content: string }>): string[] {
        const sectionTitles = sections.map(s => s.title);
        return this.defaultRequirements.requiredSections.filter(
            required => !sectionTitles.some(title => title.includes(required))
        );
    }

    /**
     * セクションの順序をチェック
     */
    private checkSectionOrder(sections: Array<{ title: string; content: string }>): { isCorrect: boolean; suggestedOrder: string } {
        const expectedOrder = this.defaultRequirements.requiredSections;
        const actualTitles = sections.map(s => s.title);

        let lastFoundIndex = -1;
        let isCorrect = true;

        for (const expected of expectedOrder) {
            const foundIndex = actualTitles.findIndex(t => t.includes(expected));
            if (foundIndex !== -1 && foundIndex < lastFoundIndex) {
                isCorrect = false;
                break;
            }
            if (foundIndex !== -1) {
                lastFoundIndex = foundIndex;
            }
        }

        return {
            isCorrect,
            suggestedOrder: `推奨順序: ${expectedOrder.join(' → ')}`
        };
    }

    /**
     * 文字数をカウント
     */
    private countWords(article: string): number {
        // フロントマターを除外
        const content = article.replace(/^---\n[\s\S]*?\n---/, '').trim();
        // Markdown記法を除外してカウント
        const plainText = content
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[#*_~]/g, '')
            .trim();
        return plainText.length;
    }

    /**
     * スタイル修正を適用
     */
    private applyStyleFix(content: string, rule: StyleRule): string {
        // 基本的なスタイル修正の適用
        // 実際の実装では各ルールに応じた修正を行う
        this.logger.debug(`Applying style fix: ${rule.rule}`);
        return content;
    }

    /**
     * プロンプトを構築
     */
    private buildPrompt(config: QualityPromptConfig): string {
        const sections = Object.entries(config.sectionRequirements)
            .map(([key, section]) => {
                return `${key === 'introduction' ? '1' : key === 'userReviews' ? '2' : key === 'competitiveAnalysis' ? '3' : key === 'recommendation' ? '4' : '5'}. **${section.title}** (${section.minWordCount}${section.maxWordCount ? `-${section.maxWordCount}` : '+'}文字)
   - 必須要素: ${section.requiredElements.join(', ')}
   - 構成: ${section.structure}`;
            })
            .join('\n\n');

        return `以下のテンプレートに従って、商品「${config.productName}」の詳細レビュー記事を作成してください：

## 記事構造要件
${sections}

## 品質要件
- 最低${config.qualityRequirements.minWordCount}文字以上
- 客観的で公平な分析
- 具体的な根拠に基づく評価
- モバイル読者を意識した読みやすい構成
- SEOを意識したキーワード配置

## 対象読者
${config.targetAudience}

## トーン
${config.tone === 'professional' ? 'プロフェッショナルで信頼性の高い' : config.tone === 'casual' ? 'カジュアルで親しみやすい' : 'フォーマルで正確な'}文体

## 出力形式
Markdown形式で、指定されたセクション構造に従って作成してください。`;
    }
}
