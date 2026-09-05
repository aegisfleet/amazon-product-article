/**
 * CategorySanitizer
 * カテゴリ名の正規化・サニタイズおよび詳細化ロジック
 */

import {
  BIKE_MOUNT_KEYWORDS,
  CHARGER_KEYWORDS,
  GAMEPAD_KEYWORDS,
  HEADPHONE_KEYWORDS,
  TV_EXCLUDED_KEYWORDS,
  WHEEL_KEYWORDS,
} from './CategoryConstants';

export class CategorySanitizer {
  /**
   * カテゴリ名をサニタイズし、タイトル情報に応じてより具体的で適切なカテゴリ名に解決する
   */
  public static sanitize(name: string, title?: string): string {
    // PJ_ プレフィックスの除去
    const sanitized = name.replace(/^PJ_/i, '');

    // 空白文字（NBSP含む）の正規化および不要な記号の除去
    let finalName = sanitized
      .replaceAll(/[\u00a0\s]+/g, ' ')
      .replaceAll(/[【】|()（）_※]/g, '')
      .trim();

    finalName = CategorySanitizer.resolveControllerCategory(finalName, title);
    finalName = CategorySanitizer.resolveTvCategory(finalName, title);
    finalName = CategorySanitizer.resolveBikeAccessoryCategory(finalName, title);

    if (finalName === 'イヤ・ヘッド') {
      finalName = 'イヤホン・ヘッドホン';
    }

    return CategorySanitizer.resolveGenericCategory(finalName, title);
  }

  /**
   * バイクアクセサリカテゴリをタイトルから詳細化
   */
  private static resolveBikeAccessoryCategory(name: string, title?: string): string {
    if (name !== 'バイクアクセサリ' || !title) {
      return name;
    }
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('ドリンクホルダー')) {
      return 'バイク用ドリンクホルダー';
    }
    if (BIKE_MOUNT_KEYWORDS.some((k) => lowerTitle.includes(k))) {
      return 'バイク用マウントステー・ホルダー';
    }
    return name;
  }

  /**
   * ハンドル・ジョイスティックカテゴリをタイトルに応じて「コントローラー・周辺機器」または「ハンドルコントローラー」に解決
   */
  private static resolveControllerCategory(name: string, title?: string): string {
    if (!name.includes('ハンドル・ジョイスティック') && name !== 'ハンドルコントローラー') {
      return name;
    }
    if (!title) {
      return 'ハンドルコントローラー';
    }
    const isGamepad = GAMEPAD_KEYWORDS.some((k) => title.includes(k));
    const isWheel = WHEEL_KEYWORDS.some((k) => title.includes(k));
    return isGamepad && !isWheel ? 'コントローラー・周辺機器' : 'ハンドルコントローラー';
  }

  /**
   * テレビカテゴリを液晶テレビ／有機ELテレビに詳細化（部品・周辺機器は除外）
   */
  private static resolveTvCategory(name: string, title?: string): string {
    const lowerName = name.toLowerCase();
    const isTv = lowerName.endsWith('テレビ') || lowerName.startsWith('テレビ') || lowerName.includes('tv');
    if (!isTv) {
      return name;
    }
    if (TV_EXCLUDED_KEYWORDS.some((k) => lowerName.includes(k))) {
      return name;
    }
    if (title && (title.toLowerCase().includes('有機el') || title.toLowerCase().includes('oled'))) {
      return '有機ELテレビ';
    }
    return '液晶テレビ';
  }

  /**
   * 家電＆カメラ等の広範なカテゴリをタイトルから具体的なカテゴリ名に解決
   */
  private static resolveGenericCategory(name: string, title?: string): string {
    if ((name !== '家電＆カメラ' && name !== 'カテゴリー別') || !title) {
      return name;
    }
    const lowerTitle = title.toLowerCase();
    if (HEADPHONE_KEYWORDS.some((k) => lowerTitle.includes(k))) {
      return 'イヤホン・ヘッドホン';
    }
    if (lowerTitle.includes('テレビ') || lowerTitle.includes('tv')) {
      return lowerTitle.includes('有機el') || lowerTitle.includes('oled') ? '有機ELテレビ' : '液晶テレビ';
    }
    if (CHARGER_KEYWORDS.some((k) => lowerTitle.includes(k))) {
      return 'アダプタ・充電器・ケーブル';
    }
    return name;
  }
}
