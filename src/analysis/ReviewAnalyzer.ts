/**
 * Review_Analyzer - ユーザーレビューの分析と評価を行うコンポーネント
 */

import { CompetitiveProduct, InvestigationResult } from '../types/JulesTypes';
import { Product } from '../types/Product';
import { Logger } from '../utils/Logger';

export interface ReviewAnalysisResult {
  positiveInsights: AnalysisInsight[];
  negativeInsights: AnalysisInsight[];
  useCaseAnalysis: UseCaseAnalysis[];
  competitivePositioning: CompetitivePositioning;
  overallSentiment: SentimentScore;
  keyThemes: string[];
}

export interface AnalysisInsight {
  category: string;
  insight: string;
  frequency: number;
  impact: 'high' | 'medium' | 'low';
  examples: string[];
}

export interface UseCaseAnalysis {
  useCase: string;
  suitability: number; // 0-100
  userTypes: string[];
  scenarios: string[];
  limitations: string[];
}

export interface CompetitivePositioning {
  strengths: string[];
  weaknesses: string[];
  differentiators: string[];
  marketPosition: 'leader' | 'challenger' | 'follower' | 'niche';
  competitiveAdvantages: CompetitiveAdvantage[];
}

export interface CompetitiveAdvantage {
  advantage: string;
  significance: 'critical' | 'important' | 'minor';
  sustainability: 'high' | 'medium' | 'low';
  competitorComparison: string;
}

export interface SentimentScore {
  overall: number; // -1 to 1
  aspects: {
    quality: number;
    value: number;
    usability: number;
    support: number;
    reliability: number;
  };
  confidence: number; // 0-1
}

export class ReviewAnalyzer {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Jules調査結果を解析して構造化されたレビュー分析を生成
   */
  async analyzeInvestigationResult(result: InvestigationResult): Promise<ReviewAnalysisResult> {
    this.logger.info('Starting investigation result analysis', {
      sessionId: result.sessionId,
      productAsin: result.product.asin
    });

    try {
      const analysis: ReviewAnalysisResult = {
        positiveInsights: this.extractInsights(result.analysis.positivePoints, 'positive'),
        negativeInsights: this.extractInsights(result.analysis.negativePoints, 'negative'),
        useCaseAnalysis: this.analyzeUseCases(result.analysis.useCases, result.product),
        competitivePositioning: this.analyzeCompetitivePositioning(
          result.analysis.competitiveAnalysis,
          result.analysis.recommendation
        ),
        overallSentiment: this.calculateSentimentScore(result),
        keyThemes: this.extractKeyThemes(result)
      };

      this.logger.info('Investigation result analysis completed', {
        sessionId: result.sessionId,
        insightsCount: analysis.positiveInsights.length + analysis.negativeInsights.length,
        useCasesCount: analysis.useCaseAnalysis.length,
        overallSentiment: analysis.overallSentiment.overall
      });

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze investigation result', error);
      throw new Error(`Investigation result analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * ポジティブ/ネガティブポイントからインサイトを抽出
   */
  private extractInsights(points: string[], type: 'positive' | 'negative'): AnalysisInsight[] {
    return points.map((point, _index) => {
      const category = this.categorizeInsight(point);
      const impact = this.assessImpact(point, type);

      return {
        category,
        insight: point,
        frequency: this.estimateFrequency(point),
        impact,
        examples: [point] // In a real implementation, this would contain multiple examples
      };
    });
  }

  /**
   * インサイトをカテゴリ分類
   */
  private categorizeInsight(insight: string): string {
    const categories = {
      '品質': ['品質', '質', 'クオリティ', '作り', '材質', '耐久'],
      '価格': ['価格', '値段', 'コスト', '安い', '高い', 'お得', 'コスパ'],
      '使いやすさ': ['使いやすい', '操作', 'UI', 'UX', '直感', '簡単', '複雑'],
      '機能': ['機能', 'フィーチャー', '性能', 'スペック', '能力'],
      'デザイン': ['デザイン', '見た目', '外観', 'スタイル', '色', 'サイズ'],
      'サポート': ['サポート', 'カスタマー', 'ヘルプ', '対応', 'サービス'],
      '配送': ['配送', '発送', '到着', '梱包', '包装'],
      'その他': []
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => insight.includes(keyword))) {
        return category;
      }
    }

    return 'その他';
  }

  /**
   * インサイトの影響度を評価
   */
  private assessImpact(insight: string, _type: 'positive' | 'negative'): 'high' | 'medium' | 'low' {
    const highImpactKeywords = [
      '致命的', '重大', '深刻', '最高', '素晴らしい', '完璧', '最悪', '使えない'
    ];

    const mediumImpactKeywords = [
      '良い', '悪い', '問題', '改善', '満足', '不満', '便利', '不便'
    ];

    if (highImpactKeywords.some(keyword => insight.includes(keyword))) {
      return 'high';
    } else if (mediumImpactKeywords.some(keyword => insight.includes(keyword))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 頻度を推定（実際の実装では統計的分析を行う）
   */
  private estimateFrequency(insight: string): number {
    // 簡易的な頻度推定（実際の実装ではより詳細な分析を行う）
    const length = insight.length;
    return Math.min(Math.max(Math.floor(length / 10), 1), 10);
  }

  /**
   * 使用ケースを分析
   */
  private analyzeUseCases(useCases: string[], product: Product): UseCaseAnalysis[] {
    return useCases.map(useCase => {
      const suitability = this.calculateUseCaseSuitability(useCase, product);
      const userTypes = this.identifyUserTypes(useCase);
      const scenarios = this.extractScenarios(useCase);
      const limitations = this.identifyLimitations(useCase);

      return {
        useCase,
        suitability,
        userTypes,
        scenarios,
        limitations
      };
    });
  }

  /**
   * 使用ケースの適合度を計算
   */
  private calculateUseCaseSuitability(useCase: string, product: Product): number {
    // 商品カテゴリと使用ケースの関連性を評価
    // PA-API v5ではレビューデータ取得不可のためカテゴリ関連性のみで計算
    const categoryRelevance = this.assessCategoryRelevance(useCase, product.category);

    return Math.min(Math.max(categoryRelevance, 0), 100);
  }

  /**
   * カテゴリ関連性を評価
   */
  private assessCategoryRelevance(useCase: string, category: string): number {
    // 簡易的な関連性評価（実際の実装ではより詳細な分析を行う）
    const baseScore = 50;

    if (useCase.toLowerCase().includes(category.toLowerCase())) {
      return baseScore + 30;
    }

    return baseScore;
  }

  /**
   * ユーザータイプを特定
   */
  private identifyUserTypes(useCase: string): string[] {
    const userTypePatterns = {
      '初心者': ['初心者', 'ビギナー', '初めて', '入門'],
      '上級者': ['上級者', 'プロ', '専門', 'エキスパート'],
      '家庭用': ['家庭', '家族', '主婦', '子供'],
      'ビジネス': ['ビジネス', '仕事', '会社', 'オフィス'],
      '学生': ['学生', '学校', '勉強', '研究']
    };

    const identifiedTypes: string[] = [];

    for (const [type, patterns] of Object.entries(userTypePatterns)) {
      if (patterns.some(pattern => useCase.includes(pattern))) {
        identifiedTypes.push(type);
      }
    }

    return identifiedTypes.length > 0 ? identifiedTypes : ['一般ユーザー'];
  }

  /**
   * シナリオを抽出
   */
  private extractScenarios(useCase: string): string[] {
    // 簡易的なシナリオ抽出（実際の実装ではNLP技術を使用）
    const sentences = useCase.split(/[。！？]/).filter(s => s.trim().length > 0);
    return sentences.slice(0, 3); // 最大3つのシナリオを抽出
  }

  /**
   * 制限事項を特定
   */
  private identifyLimitations(useCase: string): string[] {
    const limitationKeywords = [
      'ただし', 'しかし', '注意', '制限', '問題', '課題', 'デメリット'
    ];

    const limitations: string[] = [];

    limitationKeywords.forEach(keyword => {
      if (useCase.includes(keyword)) {
        const index = useCase.indexOf(keyword);
        const limitation = useCase.substring(index, index + 100); // 制限事項の文脈を抽出
        limitations.push(limitation);
      }
    });

    return limitations;
  }

  /**
   * 競合ポジショニングを分析
   */
  private analyzeCompetitivePositioning(
    competitiveAnalysis: CompetitiveProduct[],
    recommendation: any
  ): CompetitivePositioning {
    const strengths = this.extractStrengths(competitiveAnalysis, recommendation);
    const weaknesses = this.extractWeaknesses(competitiveAnalysis, recommendation);
    const differentiators = this.extractDifferentiators(competitiveAnalysis);
    const marketPosition = this.determineMarketPosition(recommendation.score);
    const competitiveAdvantages = this.identifyCompetitiveAdvantages(competitiveAnalysis);

    return {
      strengths,
      weaknesses,
      differentiators,
      marketPosition,
      competitiveAdvantages
    };
  }

  /**
   * 強みを抽出
   */
  private extractStrengths(competitiveAnalysis: CompetitiveProduct[], recommendation: any): string[] {
    const strengths = [...recommendation.pros];

    // 競合分析から追加の強みを抽出
    competitiveAnalysis.forEach(competitor => {
      competitor.differentiators.forEach(diff => {
        if (!strengths.includes(diff)) {
          strengths.push(diff);
        }
      });
    });

    return strengths;
  }

  /**
   * 弱みを抽出
   */
  private extractWeaknesses(competitiveAnalysis: CompetitiveProduct[], recommendation: any): string[] {
    return [...recommendation.cons];
  }

  /**
   * 差別化要因を抽出
   */
  private extractDifferentiators(competitiveAnalysis: CompetitiveProduct[]): string[] {
    const differentiators: string[] = [];

    competitiveAnalysis.forEach(competitor => {
      competitor.differentiators.forEach(diff => {
        if (!differentiators.includes(diff)) {
          differentiators.push(diff);
        }
      });
    });

    return differentiators;
  }

  /**
   * 市場ポジションを決定
   */
  private determineMarketPosition(score: number): 'leader' | 'challenger' | 'follower' | 'niche' {
    if (score >= 90) return 'leader';
    if (score >= 75) return 'challenger';
    if (score >= 60) return 'follower';
    return 'niche';
  }

  /**
   * 競合優位性を特定
   */
  private identifyCompetitiveAdvantages(competitiveAnalysis: CompetitiveProduct[]): CompetitiveAdvantage[] {
    const advantages: CompetitiveAdvantage[] = [];

    competitiveAnalysis.forEach(competitor => {
      competitor.differentiators.forEach(diff => {
        const advantage: CompetitiveAdvantage = {
          advantage: diff,
          significance: this.assessSignificance(diff),
          sustainability: this.assessSustainability(diff),
          competitorComparison: `${competitor.name}との比較: ${diff}`
        };
        advantages.push(advantage);
      });
    });

    return advantages;
  }

  /**
   * 重要度を評価
   */
  private assessSignificance(advantage: string): 'critical' | 'important' | 'minor' {
    const criticalKeywords = ['価格', 'コスト', '品質', '性能', '機能'];
    const importantKeywords = ['使いやすさ', 'デザイン', 'サポート', 'ブランド'];

    if (criticalKeywords.some(keyword => advantage.includes(keyword))) {
      return 'critical';
    } else if (importantKeywords.some(keyword => advantage.includes(keyword))) {
      return 'important';
    }

    return 'minor';
  }

  /**
   * 持続可能性を評価
   */
  private assessSustainability(advantage: string): 'high' | 'medium' | 'low' {
    const highSustainabilityKeywords = ['特許', 'ブランド', '技術', 'ネットワーク'];
    const lowSustainabilityKeywords = ['価格', 'キャンペーン', '在庫'];

    if (highSustainabilityKeywords.some(keyword => advantage.includes(keyword))) {
      return 'high';
    } else if (lowSustainabilityKeywords.some(keyword => advantage.includes(keyword))) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * センチメントスコアを計算
   */
  private calculateSentimentScore(result: InvestigationResult): SentimentScore {
    const positiveCount = result.analysis.positivePoints.length;
    const negativeCount = result.analysis.negativePoints.length;
    const totalCount = positiveCount + negativeCount;

    const overall = totalCount > 0 ? (positiveCount - negativeCount) / totalCount : 0;

    return {
      overall,
      aspects: {
        quality: this.calculateAspectSentiment(result, '品質'),
        value: this.calculateAspectSentiment(result, '価格'),
        usability: this.calculateAspectSentiment(result, '使いやすさ'),
        support: this.calculateAspectSentiment(result, 'サポート'),
        reliability: this.calculateAspectSentiment(result, '信頼性')
      },
      confidence: Math.min(totalCount / 10, 1) // レビュー数に基づく信頼度
    };
  }

  /**
   * 側面別センチメントを計算
   */
  private calculateAspectSentiment(result: InvestigationResult, aspect: string): number {
    const positiveMatches = result.analysis.positivePoints.filter(point =>
      point.includes(aspect)
    ).length;

    const negativeMatches = result.analysis.negativePoints.filter(point =>
      point.includes(aspect)
    ).length;

    const totalMatches = positiveMatches + negativeMatches;

    return totalMatches > 0 ? (positiveMatches - negativeMatches) / totalMatches : 0;
  }

  /**
   * キーテーマを抽出
   */
  private extractKeyThemes(result: InvestigationResult): string[] {
    const allText = [
      ...result.analysis.positivePoints,
      ...result.analysis.negativePoints,
      ...result.analysis.useCases
    ].join(' ');

    // 簡易的なキーワード抽出（実際の実装ではTF-IDFやNLP技術を使用）
    const commonWords = ['品質', '価格', '使いやすさ', 'デザイン', '機能', 'サポート', '配送'];
    const themes: string[] = [];

    commonWords.forEach(word => {
      if (allText.includes(word)) {
        themes.push(word);
      }
    });

    return themes.slice(0, 5); // 最大5つのテーマを返す
  }
}