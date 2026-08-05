export interface CompareItem {
  asin: string;
  title: string;
  url: string;
  affiliateUrl: string;
  image: string;
  price: string;
  priceNum: number;
  score: number;
  savingsPercentage: number;
  category: string;
  specs: Record<string, string>;
  addedAt: number;
}

export class CompareHelper {
  /**
   * 価格文字列（例: "￥3,555"）から数値を抽出し、数値で返す
   */
  static parsePrice(priceStr: string | number): number {
    if (typeof priceStr === 'number') {
      return Number.isNaN(priceStr) ? 0 : priceStr;
    }
    if (!priceStr || typeof priceStr !== 'string') {
      return 0;
    }
    const matches = priceStr.replace(/,/g, '').match(/\d+/);
    if (!matches) {
      return 0;
    }
    return Number.parseInt(matches[0], 10) || 0;
  }

  /**
   * 最高スコアを持つ商品の ASIN 配列を取得（スコア > 0 の場合のみ）
   */
  static findBestScoreAsins(items: CompareItem[]): string[] {
    if (!items || items.length === 0) return [];
    let maxScore = 0;
    for (const item of items) {
      if (item.score > maxScore) {
        maxScore = item.score;
      }
    }
    if (maxScore <= 0) return [];
    return items.filter((item) => item.score === maxScore).map((item) => item.asin);
  }

  /**
   * 最安価格を持つ商品の ASIN 配列を取得（priceNum > 0 の場合のみ）
   */
  static findLowestPriceAsins(items: CompareItem[]): string[] {
    if (!items || items.length === 0) return [];
    const validItems = items.filter((item) => item.priceNum > 0);
    if (validItems.length === 0) return [];
    let minPrice = Infinity;
    for (const item of validItems) {
      if (item.priceNum < minPrice) {
        minPrice = item.priceNum;
      }
    }
    if (minPrice === Infinity) return [];
    return validItems.filter((item) => item.priceNum === minPrice).map((item) => item.asin);
  }

  /**
   * 全アイテムから登場するスペックキーの一覧を取得（出現順かつ重複排除）
   */
  static getAllSpecKeys(items: CompareItem[]): string[] {
    if (!items || items.length === 0) return [];
    const keySet = new Set<string>();
    for (const item of items) {
      if (item.specs && typeof item.specs === 'object') {
        for (const key of Object.keys(item.specs)) {
          if (key) {
            keySet.add(key);
          }
        }
      }
    }
    return Array.from(keySet);
  }
}
