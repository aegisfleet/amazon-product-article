import type { CreatorsAPIBrowseNode } from '../types/CreatorsAPITypes';
import { HIGH_PRIORITY_KEYWORDS, PREFERRED_KEYWORDS } from './category/CategoryConstants';
import { CategorySanitizer } from './category/CategorySanitizer';
import { CategoryValidator } from './category/CategoryValidator';

export type BrowseNode = CreatorsAPIBrowseNode;

export interface NormalizedCategory {
  main: string;
  sub: string;
  nameCount: number;
  score: number;
}

/**
 * CategoryNormalizer
 * Creators APIのBrowseNode階層を走査し、最適なカテゴリ分類を選定するファサードクラス
 */
export class CategoryNormalizer {
  /**
   * 単一の BrowseNode をカテゴリに正規化する
   */
  public static normalize(node?: BrowseNode, title?: string): NormalizedCategory {
    if (!node) {
      return { main: 'その他／全般', sub: 'Unknown', nameCount: 0, score: -1 };
    }

    const validNames = CategoryNormalizer.collectValidHierarchyNames(node, title);

    if (validNames.length > 0) {
      const main = validNames[0] ?? 'Unknown';
      const sub = validNames[1] ?? '';
      const score = CategoryNormalizer.calculateScore(validNames);

      return { main, sub, nameCount: validNames.length, score };
    }

    return CategoryNormalizer.getFallbackCategory(node);
  }

  /**
   * カテゴリ名の妥当性を検証する（CategoryValidatorへの委譲）
   */
  public static isValidCategoryName(originalName: string, title?: string): boolean {
    return CategoryValidator.isValidCategoryName(originalName, title);
  }

  /**
   * カテゴリ名をサニタイズ・詳細化する（CategorySanitizerへの委譲）
   */
  public static sanitizeCategoryName(name: string, title?: string): string {
    return CategorySanitizer.sanitize(name, title);
  }

  /**
   * BrowseNode階層ツリーを親方向に走査し、有効なカテゴリ名一覧を収集する
   */
  private static collectValidHierarchyNames(node: BrowseNode, title?: string): string[] {
    const validNames: string[] = [];
    let currentNode: BrowseNode | undefined = node;

    while (currentNode) {
      const cfn = currentNode.contextFreeName;
      const dn = currentNode.displayName || currentNode.DisplayName;

      const validCFN =
        cfn && CategoryValidator.isValidCategoryName(cfn, title) ? CategorySanitizer.sanitize(cfn, title) : null;
      const validDN =
        dn && CategoryValidator.isValidCategoryName(dn, title) ? CategorySanitizer.sanitize(dn, title) : null;

      const bestName = CategoryNormalizer.pickBestName(validCFN, validDN);
      if (bestName) {
        validNames.push(bestName);
      }

      currentNode = currentNode.ancestor || currentNode.Ancestor;
    }

    return validNames;
  }

  /**
   * contextFreeName と displayName の間でより適切な名前を選択する
   */
  private static pickBestName(cfn: string | null, dn: string | null): string | null {
    if (cfn && dn) {
      const lowerCFN = cfn.toLowerCase();
      const lowerDN = dn.toLowerCase();

      if (lowerDN.includes(lowerCFN) && dn.length > cfn.length) {
        return dn;
      }
      if (lowerCFN.includes(lowerDN) && cfn.length > dn.length) {
        return cfn;
      }
      if (/[ぁ-んァ-ヶー一-龠]/.test(dn) && !/[ぁ-んァ-ヶー一-龠]/.test(cfn)) {
        return dn;
      }
      return cfn;
    }
    return dn || cfn;
  }

  /**
   * 優先キーワードに基づくスコアを算出する
   */
  private static calculateScore(names: string[]): number {
    const hasHighPriorityKeyword = names.some((name) =>
      HIGH_PRIORITY_KEYWORDS.some((keyword) => name.toLowerCase().includes(keyword.toLowerCase())),
    );
    if (hasHighPriorityKeyword) {
      return 20;
    }

    const hasPreferredKeyword = names.some((name) =>
      PREFERRED_KEYWORDS.some((keyword) => {
        if (keyword === 'ペット' && name.includes('カーペット')) {
          return name.replaceAll('カーペット', '').toLowerCase().includes(keyword.toLowerCase());
        }
        return name.toLowerCase().includes(keyword.toLowerCase());
      }),
    );

    return hasPreferredKeyword ? 10 : 0;
  }

  /**
   * 有効なノード名が見つからなかった場合のフォールバックカテゴリを取得する
   */
  private static getFallbackCategory(node: BrowseNode): NormalizedCategory {
    const fallbackName = node.displayName || node.DisplayName || 'Unknown';
    const subName = CategoryValidator.isValidCategoryName(fallbackName)
      ? CategorySanitizer.sanitize(fallbackName)
      : '一般';

    return {
      main: 'その他／全般',
      sub: subName,
      nameCount: 0,
      score: -1,
    };
  }

  /**
   * 複数の BrowseNode の中から最適なカテゴリを選択する
   * 優先基準: Specificity (深さ) > スコア (優先ドメイン) > 売れ筋ランキング
   */
  public static selectBestCategory(
    nodes: BrowseNode[],
    title?: string,
  ): NormalizedCategory & { browseNodeId?: string } {
    if (!nodes || nodes.length === 0) {
      return { main: 'その他／全般', sub: 'Unknown', nameCount: 0, score: -1 };
    }

    // 1. ノードの正規化とソート
    const sortedNodes = [...nodes].sort((a: BrowseNode, b: BrowseNode) => {
      const normA = CategoryNormalizer.normalize(a, title);
      const normB = CategoryNormalizer.normalize(b, title);

      // 1. Depth (Specificity): 最も具体的な末端カテゴリを優先
      if (normB.nameCount !== normA.nameCount) {
        return normB.nameCount - normA.nameCount;
      }
      // 2. Score (Domain preference): 優先キーワード一致スコア
      if (normB.score !== normA.score) {
        return normB.score - normA.score;
      }
      // 3. Sales Rank: 売れ筋ランキング
      const rankA = a.salesRank ?? a.SalesRank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.salesRank ?? b.SalesRank ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    });

    // 2. 「その他／全般」以外の最初の有効カテゴリを選択
    for (const node of sortedNodes) {
      const normalized = CategoryNormalizer.normalize(node, title);

      if (normalized.main !== 'その他／全般') {
        CategoryNormalizer.resolveSubCategory(normalized, sortedNodes, title);
        return CategoryNormalizer.attachBrowseNodeId(normalized, node);
      }
    }

    // 3. フォールバック: 有効カテゴリがない場合は最上位ノードを使用
    const bestNode = sortedNodes[0];
    if (bestNode) {
      return CategoryNormalizer.attachBrowseNodeId(CategoryNormalizer.normalize(bestNode, title), bestNode);
    }

    return { main: 'その他／全般', sub: 'Unknown', nameCount: 0, score: -1 };
  }

  /**
   * サブカテゴリが空または「一般」の場合、別ノードからサブカテゴリを補完する
   */
  private static resolveSubCategory(normalized: NormalizedCategory, sortedNodes: BrowseNode[], title?: string): void {
    if (normalized.sub && normalized.sub !== '一般') {
      return;
    }

    const subCandidate = sortedNodes.find((n: BrowseNode) => {
      const sn = CategoryNormalizer.normalize(n, title);
      return sn.main !== 'その他／全般' && sn.main !== normalized.main;
    });

    normalized.sub = subCandidate ? CategoryNormalizer.normalize(subCandidate, title).main : '';
  }

  /**
   * 抽出結果に browseNodeId を付与する
   */
  private static attachBrowseNodeId(
    normalized: NormalizedCategory,
    node: BrowseNode,
  ): NormalizedCategory & { browseNodeId?: string } {
    const result: NormalizedCategory & { browseNodeId?: string } = { ...normalized };
    const nodeId = node.id || node.Id;
    if (nodeId) {
      result.browseNodeId = nodeId;
    }
    return result;
  }
}
