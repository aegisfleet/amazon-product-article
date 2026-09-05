/**
 * CategoryValidator
 * カテゴリ名の妥当性検証ロジック
 */

import {
  BLACKLIST_CATEGORIES_SET,
  CAT_KEYWORDS,
  CAT_TOILET_CATEGORY_REGEX,
  CHARGER_KEYWORDS,
  EXPLICITLY_ALLOWED_CATEGORIES,
  FOOTWEAR_CATEGORY_REGEX,
  FOOTWEAR_KEYWORDS,
  HEADPHONE_KEYWORDS,
  INVALID_PATTERNS,
  PHONE_KEYWORDS,
  WHITELIST_CATEGORIES,
} from './CategoryConstants';

export class CategoryValidator {
  /**
   * 比較用にカテゴリ名を正規化する（小文字化、アンダースコアをスペース置換、空白の正規化）
   */
  public static normalizeForComparison(name: string): string {
    return name.toLowerCase().replaceAll(/[＿_]/g, ' ').replaceAll(/\s+/g, ' ').trim();
  }

  /**
   * カテゴリ名が有効かどうかを検証する
   */
  public static isValidCategoryName(originalName: string, title?: string): boolean {
    if (!originalName) {
      return false;
    }

    const name = CategoryValidator.normalizeForComparison(originalName);

    // 1. 無条件で許可されるカテゴリ
    if (EXPLICITLY_ALLOWED_CATEGORIES.has(name)) {
      return true;
    }

    // 2. 広範なカテゴリのタイトル救済
    if (CategoryValidator.isRescuedByTitle(name, title)) {
      return true;
    }

    // 3. タイトル適合性ガード（誤判定の防止）
    if (!CategoryValidator.passesTitleGuards(name, title)) {
      return false;
    }

    // 4. ホワイトリスト（最優先で許可）
    if (CategoryValidator.isWhitelisted(name)) {
      return true;
    }

    // 5. 構造的・一般的な除外正規表現パターン
    if (CategoryValidator.matchesInvalidPattern(name)) {
      return false;
    }

    // 6. ドット数チェック（中黒が2個以上ある複合カテゴリは除外）
    if (CategoryValidator.hasExcessiveDots(name)) {
      return false;
    }

    // 7. 完全一致ブラックリスト
    if (BLACKLIST_CATEGORIES_SET.has(name)) {
      return false;
    }

    return true;
  }

  /**
   * 家電＆カメラ等の広範なカテゴリをタイトルから推測して救済するか判定
   */
  private static isRescuedByTitle(name: string, title?: string): boolean {
    if ((name !== '家電＆カメラ' && name !== 'カテゴリー別') || !title) {
      return false;
    }

    const lowerTitle = title.toLowerCase();

    if (HEADPHONE_KEYWORDS.some((k) => lowerTitle.includes(k))) {
      return true;
    }
    if (lowerTitle.includes('テレビ') || lowerTitle.includes('tv')) {
      return true;
    }
    if (CHARGER_KEYWORDS.some((k) => lowerTitle.includes(k))) {
      return true;
    }

    return false;
  }

  /**
   * 特定ジャンル（スマホ本体、靴、猫トイレ等）の誤爆防止ガードを通過するか判定
   */
  private static passesTitleGuards(name: string, title?: string): boolean {
    if (!title) {
      return true;
    }

    const lowerTitle = title.toLowerCase();

    // スマホ本体・携帯電話本体カテゴリガード
    if (CategoryValidator.isPhoneCategory(name)) {
      if (!PHONE_KEYWORDS.some((k) => lowerTitle.includes(k))) {
        return false;
      }
    }

    // シューズ・履物カテゴリガード
    if (FOOTWEAR_CATEGORY_REGEX.test(name)) {
      if (!FOOTWEAR_KEYWORDS.some((k) => lowerTitle.includes(k))) {
        return false;
      }
    }

    // 猫用トイレ・猫用品トイレカテゴリガード
    if (CAT_TOILET_CATEGORY_REGEX.test(name)) {
      if (!CAT_KEYWORDS.some((k) => lowerTitle.includes(k))) {
        return false;
      }
    }

    return true;
  }

  /**
   * スマホ本体関連カテゴリか判定
   */
  private static isPhoneCategory(name: string): boolean {
    return (
      name === 'スマホ本体' ||
      name === 'スマートフォン本体' ||
      name === '携帯電話・スマートフォン本体' ||
      name === '携帯電話本体'
    );
  }

  /**
   * ホワイトリストに含まれるか判定
   */
  private static isWhitelisted(name: string): boolean {
    return WHITELIST_CATEGORIES.some((item) => name.includes(CategoryValidator.normalizeForComparison(item)));
  }

  /**
   * 無効パターン正規表現にマッチするか判定
   */
  private static matchesInvalidPattern(name: string): boolean {
    return INVALID_PATTERNS.some((pattern) => pattern.test(name));
  }

  /**
   * 中黒「・」が2個以上含まれるか判定
   */
  private static hasExcessiveDots(name: string): boolean {
    const dotCount = (name.match(/・/g) || []).length;
    return dotCount >= 2;
  }
}
