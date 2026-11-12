import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../../utils/Logger';
import type { TaxonomyV2 } from '../taxonomy/types';
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

    this.taxonomy = JSON.parse(fs.readFileSync(taxPath, 'utf8'));
    this.legacyMap = fs.existsSync(legPath) ? JSON.parse(fs.readFileSync(legPath, 'utf8')) : {};

    this.parentThreshold = options.parentThreshold ?? 0.8;
    this.childThreshold = options.childThreshold ?? 0.7;
    this.runnerUpMargin = options.runnerUpMargin ?? 0.1;
  }

  public calculateInputHash(input: ProductClassificationInput): string {
    const raw = `${input.title.trim()}|${(input.brand || '').trim()}|${(input.specsSummary || '').trim()}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  private buildInputText(input: ProductClassificationInput): string {
    const parts: string[] = [`商品名: ${input.title.trim()}`];
    if (input.brand?.trim()) {
      parts.push(`ブランド: ${input.brand.trim()}`);
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

  public async classify(
    input: ProductClassificationInput,
    fallbackOldCategory?: string,
  ): Promise<ClassificationResult> {
    const inputHash = this.calculateInputHash(input);
    const inputText = this.buildInputText(input);
    const now = new Date().toISOString();

    try {
      // ----------------------------------------------------
      // Stage 1: 親カテゴリ判定 (全27択)
      // ----------------------------------------------------
      const parentCriteria: Record<string, string> = {};
      for (const parent of this.taxonomy.parents) {
        // その他は辞書順末尾になるよう choiceKey は zz-others
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

      // zz-others を 'others' に戻す
      const selectedParentSlug = parentAnswer.choice === 'zz-others' ? 'others' : parentAnswer.choice;
      const parentConfidence = parentAnswer.confidence ?? 0;

      const parentRunnerUp = this.extractRunnerUp(parentAnswer, parentAnswer.choice);
      const parentMargin = parentRunnerUp ? parentConfidence - parentRunnerUp.probability : parentConfidence;

      // 確信度が 0.60 未満ならフォールバックへ
      if (parentConfidence < 0.6 && fallbackOldCategory && this.legacyMap[fallbackOldCategory]) {
        const fb = this.legacyMap[fallbackOldCategory];
        return {
          parentSlug: fb.parent_slug,
          parentConfidence,
          childSlug: fb.child_slug,
          childConfidence: 0.5,
          needsReview: true,
          inputHash,
          source: 'fallback-map',
          classifiedAt: now,
        };
      }

      const targetParentDef =
        this.taxonomy.parents.find((p) => p.slug === selectedParentSlug) ||
        this.taxonomy.parents.find((p) => p.slug === 'others');

      if (!targetParentDef || targetParentDef.slug === 'others') {
        return {
          parentSlug: 'others',
          parentConfidence,
          childSlug: 'general-uncategorized',
          childConfidence: parentConfidence,
          parentRunnerUp,
          needsReview: true,
          inputHash,
          source: 'gemini-decision-1',
          classifiedAt: now,
        };
      }

      // ----------------------------------------------------
      // Stage 2: 子カテゴリ判定 (該当親配下の5〜10択)
      // ----------------------------------------------------
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
            instructions: `この商品が属する最も適切な「${targetParentDef.name}」配下の子カテゴリを選択してください。`,
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

      // 品質ゲート判定
      let finalChildSlug = childSlug;
      let needsReview = false;

      // 親が 0.60〜0.80 またはマージン僅差
      if (parentConfidence < this.parentThreshold || parentMargin < this.runnerUpMargin) {
        needsReview = true;
      }

      // 子の確信度が基準値未満、またはマージン僅差
      if (childConfidence < this.childThreshold || childMargin < this.runnerUpMargin) {
        needsReview = true;
        // 子の確信度が低すぎる場合はその親の zz-*-other に寄せる
        if (childConfidence < this.childThreshold) {
          const otherChild = targetParentDef.children.find((c) => c.slug.startsWith('zz-'));
          if (otherChild) {
            finalChildSlug = otherChild.slug;
          }
        }
      }

      // その他行きは常時レビュー対象
      if (finalChildSlug.startsWith('zz-') || selectedParentSlug === 'others') {
        needsReview = true;
      }

      return {
        parentSlug: selectedParentSlug,
        parentConfidence,
        childSlug: finalChildSlug,
        childConfidence,
        parentRunnerUp,
        childRunnerUp,
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
