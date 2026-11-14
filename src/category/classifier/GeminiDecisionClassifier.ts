import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../../utils/Logger';
import type { ParentCategoryDef, TaxonomyV2 } from '../taxonomy/types';
import { GeminiDecisionClient } from './GeminiDecisionClient';
import type { ClassificationResult, DecisionChoiceAnswer, ProductClassificationInput } from './types';

export interface ClassifierOptions {
  apiKey?: string;
  taxonomyPath?: string;
  legacyMapPath?: string;
  parentThreshold?: number; // default: 0.80
  childThreshold?: number; // default: 0.70
  runnerUpMargin?: number; // default: 0.10
}

interface LegacyMapEntry {
  parent_slug: string;
  child_slug: string;
}

type LegacyCategoryMap = Record<string, LegacyMapEntry>;

/**
 * 分類入力（商品名・ブランド・仕様）のハッシュを算出する。
 * 再調査で入力が変化したかどうかの検知に用いる。
 */
export function calculateClassificationInputHash(input: ProductClassificationInput): string {
  const raw = `${input.title.trim()}|${(input.brand || '').trim()}|${(input.specsSummary || '').trim()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export class GeminiDecisionClassifier {
  private readonly client: GeminiDecisionClient;
  private readonly taxonomy: TaxonomyV2;
  private readonly legacyMap: Record<string, LegacyMapEntry>;
  private readonly parentThreshold: number;
  private readonly childThreshold: number;
  private readonly runnerUpMargin: number;
  private readonly logger = Logger.getInstance();

  constructor(options: ClassifierOptions = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    this.client = new GeminiDecisionClient({ apiKey });

    const taxPath = options.taxonomyPath || path.resolve(process.cwd(), 'data/taxonomy-v2.json');
    const legPath = options.legacyMapPath || path.resolve(process.cwd(), 'data/legacy-category-map.json');

    this.taxonomy = JSON.parse(fs.readFileSync(taxPath, 'utf8')) as TaxonomyV2;
    this.legacyMap = (fs.existsSync(legPath) ? JSON.parse(fs.readFileSync(legPath, 'utf8')) : {}) as LegacyCategoryMap;

    this.parentThreshold = options.parentThreshold ?? 0.8;
    this.childThreshold = options.childThreshold ?? 0.7;
    this.runnerUpMargin = options.runnerUpMargin ?? 0.1;
  }

  public calculateInputHash(input: ProductClassificationInput): string {
    return calculateClassificationInputHash(input);
  }

  private static readonly GENERIC_AMAZON_CATEGORIES = new Set([
    'その他',
    'その他／全般',
    'その他・全般',
    '未分類',
    '未分類・全般',
    '一般',
    'ドラッグストア',
    'Amazon Fashion',
    'ファッション',
    'ビューティー',
    'ラグジュアリービューティー',
    'ホーム＆キッチン',
    '大型家電',
    'ペット用品',
    '文房具・オフィス用品',
    'DIY・工具・ガーデン',
    'スポーツ＆アウトドア',
    '車＆バイク',
    'おもちゃ',
    'パソコン・周辺機器',
    '家電＆カメラ',
    '食品・飲料・お酒',
    'ベビー＆マタニティ',
  ]);

  private isValidAmazonCategory(category?: string): category is string {
    const trimmed = category?.trim();
    if (!trimmed) {
      return false;
    }
    if (/^\d+$/.test(trimmed)) {
      return false;
    }
    return !GeminiDecisionClassifier.GENERIC_AMAZON_CATEGORIES.has(trimmed);
  }

  private buildInputText(input: ProductClassificationInput): string {
    const parts: string[] = [`商品名: ${input.title.trim()}`];
    if (input.brand?.trim()) {
      parts.push(`ブランド: ${input.brand.trim()}`);
    }
    if (this.isValidAmazonCategory(input.amazonCategory)) {
      parts.push(`参考カテゴリ: ${input.amazonCategory.trim()}`);
    }
    if (input.specsSummary?.trim()) {
      parts.push(`仕様・特徴: ${input.specsSummary.trim()}`);
    }
    if (input.description?.trim()) {
      parts.push(`説明: ${input.description.trim()}`);
    }
    return parts.join('\n');
  }

  private extractRunnerUp(
    answer: DecisionChoiceAnswer,
    topChoice: string,
  ): { slug: string; probability: number } | undefined {
    if (!answer.probabilities) return undefined;

    let runnerUpSlug = '';
    let runnerUpProb = -1;

    for (const [key, prob] of Object.entries(answer.probabilities)) {
      if (key !== topChoice && prob > runnerUpProb) {
        runnerUpProb = prob;
        runnerUpSlug = key;
      }
    }

    if (runnerUpSlug && runnerUpProb >= 0) {
      return { slug: runnerUpSlug, probability: runnerUpProb };
    }
    return undefined;
  }

  private async executeStage1(inputText: string): Promise<{
    selectedParentSlug: string;
    parentConfidence: number;
    parentRunnerUp?: { slug: string; probability: number };
    parentMargin: number;
    targetParentDef?: ParentCategoryDef;
  }> {
    const parentCriteria: Record<string, string> = {};
    for (const parent of this.taxonomy.parents) {
      const key = parent.slug === 'others' ? 'zz-others' : parent.slug;
      parentCriteria[key] = parent.criteria;
    }

    const stage1Res = await this.client.decide({
      model: 'gemini-decision-1',
      input: inputText,
      questions: {
        parent_category: {
          type: 'choice',
          instructions: 'この商品が属する最も適切な親カテゴリを選択してください。',
          criteria: parentCriteria,
        },
      },
    });

    const parentAnswer = stage1Res.answers?.parent_category;
    if (!parentAnswer) {
      throw new Error('Stage 1 response missing parent_category answer');
    }

    const selectedParentSlug = parentAnswer.choice === 'zz-others' ? 'others' : parentAnswer.choice;
    const parentConfidence = parentAnswer.confidence ?? 0;
    const parentRunnerUp = this.extractRunnerUp(parentAnswer, parentAnswer.choice);
    const parentMargin = parentRunnerUp ? parentConfidence - parentRunnerUp.probability : parentConfidence;

    const targetParentDef =
      this.taxonomy.parents.find((p) => p.slug === selectedParentSlug) ||
      this.taxonomy.parents.find((p) => p.slug === 'others');

    return {
      selectedParentSlug,
      parentConfidence,
      parentMargin,
      ...(parentRunnerUp ? { parentRunnerUp } : {}),
      ...(targetParentDef ? { targetParentDef } : {}),
    };
  }

  private async executeStage2(
    inputText: string,
    targetParentDef: ParentCategoryDef,
  ): Promise<{
    childSlug: string;
    childConfidence: number;
    childRunnerUp?: { slug: string; probability: number };
    childMargin: number;
  }> {
    const childCriteria: Record<string, string> = {};
    for (const child of targetParentDef.children) {
      childCriteria[child.slug] = child.criteria;
    }

    const stage2Res = await this.client.decide({
      model: 'gemini-decision-1',
      input: inputText,
      questions: {
        child_category: {
          type: 'choice',
          instructions: `この商品が属する最も適切な「${targetParentDef.name}」配下の子カテゴリを選択してください。『その他（zz-*）』は、他のどの具体的な子カテゴリの定義にも当てはまらない場合の最終手段としてのみ選択してください。`,
          criteria: childCriteria,
        },
      },
    });

    const childAnswer = stage2Res.answers?.child_category;
    if (!childAnswer) {
      throw new Error('Stage 2 response missing child_category answer');
    }

    const childSlug = childAnswer.choice;
    const childConfidence = childAnswer.confidence ?? 0;
    const childRunnerUp = this.extractRunnerUp(childAnswer, childAnswer.choice);
    const childMargin = childRunnerUp ? childConfidence - childRunnerUp.probability : childConfidence;

    return {
      childSlug,
      childConfidence,
      childMargin,
      ...(childRunnerUp ? { childRunnerUp } : {}),
    };
  }

  private evaluateQualityGate(
    parentConfidence: number,
    parentMargin: number,
    childConfidence: number,
    childMargin: number,
    childSlug: string,
    selectedParentSlug: string,
    targetParentDef: ParentCategoryDef,
  ): { finalChildSlug: string; needsReview: boolean } {
    let finalChildSlug = childSlug;
    let needsReview = false;

    if (parentConfidence < this.parentThreshold || parentMargin < this.runnerUpMargin) {
      needsReview = true;
    }

    const zzFallbackThreshold = Math.min(this.childThreshold, 0.4);
    if (childConfidence < this.childThreshold || childMargin < this.runnerUpMargin) {
      needsReview = true;
      if (childConfidence < zzFallbackThreshold) {
        const otherChild = targetParentDef.children.find((c) => c.slug.startsWith('zz-'));
        if (otherChild) {
          finalChildSlug = otherChild.slug;
        }
      }
    }

    if (finalChildSlug.startsWith('zz-') || selectedParentSlug === 'others') {
      needsReview = true;
    }

    return { finalChildSlug, needsReview };
  }

  public async classify(
    input: ProductClassificationInput,
    fallbackOldCategory?: string,
  ): Promise<ClassificationResult> {
    const inputHash = this.calculateInputHash(input);
    const inputText = this.buildInputText(input);
    const now = new Date().toISOString();

    try {
      // Stage 1: 親カテゴリ判定
      const { selectedParentSlug, parentConfidence, parentRunnerUp, parentMargin, targetParentDef } =
        await this.executeStage1(inputText);

      let resolvedParentSlug = selectedParentSlug;
      let resolvedParentDef = targetParentDef;

      const fb = fallbackOldCategory ? this.legacyMap[fallbackOldCategory] : undefined;
      if ((!resolvedParentDef || resolvedParentDef.slug === 'others') && fb && fb.parent_slug !== 'others') {
        const legacyParentDef = this.taxonomy.parents.find((p) => p.slug === fb.parent_slug);
        if (legacyParentDef) {
          resolvedParentDef = legacyParentDef;
          resolvedParentSlug = legacyParentDef.slug;
        }
      }

      if (!resolvedParentDef || resolvedParentDef.slug === 'others') {
        return {
          parentSlug: 'others',
          parentConfidence,
          childSlug: 'general-uncategorized',
          childConfidence: parentConfidence,
          ...(parentRunnerUp ? { parentRunnerUp } : {}),
          needsReview: true,
          inputHash,
          source: 'gemini-decision-1',
          classifiedAt: now,
        };
      }

      // Stage 2: 子カテゴリ判定
      const { childSlug, childConfidence, childRunnerUp, childMargin } = await this.executeStage2(
        inputText,
        resolvedParentDef,
      );

      const { finalChildSlug, needsReview } = this.evaluateQualityGate(
        parentConfidence,
        parentMargin,
        childConfidence,
        childMargin,
        childSlug,
        resolvedParentSlug,
        resolvedParentDef,
      );

      return {
        parentSlug: resolvedParentSlug,
        parentConfidence,
        childSlug: finalChildSlug,
        childConfidence,
        ...(parentRunnerUp ? { parentRunnerUp } : {}),
        ...(childRunnerUp ? { childRunnerUp } : {}),
        needsReview,
        inputHash,
        source: 'gemini-decision-1',
        classifiedAt: now,
      };
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Classification API failed, falling back to legacy map: ${errMessage}`);

      if (fallbackOldCategory && this.legacyMap[fallbackOldCategory]) {
        const fb = this.legacyMap[fallbackOldCategory];
        return {
          parentSlug: fb.parent_slug,
          parentConfidence: 0.0,
          childSlug: fb.child_slug,
          childConfidence: 0.0,
          needsReview: true,
          inputHash,
          source: 'fallback-map',
          classifiedAt: now,
        };
      }

      // legacy map にもない場合の究極フォールバック
      return {
        parentSlug: 'others',
        parentConfidence: 0.0,
        childSlug: 'general-uncategorized',
        childConfidence: 0.0,
        needsReview: true,
        inputHash,
        source: 'fallback-map',
        classifiedAt: now,
      };
    }
  }
}
