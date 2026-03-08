import type { CreatorsAPIBrowseNode } from '../types/CreatorsAPITypes';

export type BrowseNode = CreatorsAPIBrowseNode;

export interface NormalizedCategory {
  main: string;
  sub: string;
  nameCount: number;
  score: number;
}

export class CategoryNormalizer {
  /**
   * Normalize a BrowseNode into a category
   * Policy: Use the Amazon category as is, but filter out inappropriate ones.
   */
  public static normalize(node?: BrowseNode): NormalizedCategory {
    if (!node) {
      return { main: 'その他', sub: 'Unknown', nameCount: 0, score: -1 };
    }

    // Collect all valid display names up the tree
    const validNames: string[] = [];
    let currentNode: BrowseNode | undefined = node;

    while (currentNode) {
      const namesToCheck = [currentNode.displayName || currentNode.DisplayName, currentNode.contextFreeName].filter(
        (n): n is string => !!n,
      );

      for (const name of namesToCheck) {
        if (CategoryNormalizer.isValidCategoryName(name)) {
          validNames.push(CategoryNormalizer.sanitizeCategoryName(name));
          break; // Stop at first valid name for this node
        }
      }
      currentNode = currentNode.ancestor || currentNode.Ancestor;
    }

    if (validNames.length > 0) {
      // Updated logic: Main is Specific, Sub is Parent
      // validNames is collected from leaf up, so [leaf, parent, grandparent, ...]
      const main = validNames[0]!;
      const sub = validNames.length > 1 ? validNames[1]! : '';

      // Calculate score based on preferred keywords
      let score = 0;
      const preferredKeywords = [
        'ボードゲーム',
        'アナログゲーム',
        'カードゲーム',
        'おもちゃ',
        'ホビー',
        'フィギュア',
        'プラモデル',
        '画材',
        '文房具',
        '文具',
        '絵具',
        'オフィス用品',
        '収納',
        'チャイルドシート',
        'ジュニアシート',
        'ベビーカー',
        '抱っこ紐',
        'おむつ',
        '紙おむつ',
        'ベビーおむつ',
        'ゲーミングチェア',
        'デスクチェア',
        'パソコンチェア',
        'オフィスチェア',
        'ワークチェア',
        'Kindle',
        'Fire',
        'Echo',
        'Alexa',
        'Ring',
        'Amazonデバイス',
        '本',
        '書籍',
        'コントローラー',
        'ヘッドセット',
        'マウス',
        'キーボード',
      ];

      if (
        preferredKeywords.some(
          (k) => main.toLowerCase().includes(k.toLowerCase()) || sub.toLowerCase().includes(k.toLowerCase()),
        )
      ) {
        score = 10;
      }

      return { main, sub, nameCount: validNames.length, score };
    }

    // If no valid category found in the tree, fallback to Other
    const fallbackName = node.displayName || node.DisplayName || 'Unknown';
    return {
      main: 'その他',
      sub: CategoryNormalizer.sanitizeCategoryName(fallbackName),
      nameCount: 0,
      score: -1,
    };
  }

  /**
   * Select the best category from a list of BrowseNodes
   * Prioritizes specific categories (depth) and preferred keywords
   */
  public static selectBestCategory(nodes: BrowseNode[]): NormalizedCategory & { browseNodeId?: string } {
    if (!nodes || nodes.length === 0) {
      return { main: 'その他', sub: 'Unknown', nameCount: 0, score: -1 };
    }

    // 1. Normalize and Sort nodes
    const sortedNodes = [...nodes].sort((a: BrowseNode, b: BrowseNode) => {
      const normA = CategoryNormalizer.normalize(a);
      const normB = CategoryNormalizer.normalize(b);

      // Priority 0: Score (Preferred keywords)
      if (normA.score !== normB.score) {
        return normB.score - normA.score;
      }

      // Priority 1: Depth (Specificity)
      if (normA.nameCount !== normB.nameCount) {
        return normB.nameCount - normA.nameCount;
      }

      // Priority 2: SalesRank (Lower is better)
      const rankA = a.salesRank ?? a.SalesRank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.salesRank ?? b.SalesRank ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    });

    // 2. Pick the first valid category
    for (const node of sortedNodes) {
      const normalized = CategoryNormalizer.normalize(node);

      if (normalized.main !== 'その他') {
        CategoryNormalizer.resolveSubCategory(normalized, sortedNodes);
        return CategoryNormalizer.attachBrowseNodeId(normalized, node);
      }
    }

    // 3. Fallback to best available node even if it's "Other"
    const bestNode = sortedNodes[0]!;
    return CategoryNormalizer.attachBrowseNodeId(CategoryNormalizer.normalize(bestNode), bestNode);
  }

  /**
   * Resolve sub-category when empty or too generic
   */
  private static resolveSubCategory(normalized: NormalizedCategory, sortedNodes: BrowseNode[]): void {
    if (normalized.sub && normalized.sub !== '一般') {
      return;
    }

    const subCandidate = sortedNodes.find((n: BrowseNode) => {
      const sn = CategoryNormalizer.normalize(n);
      return sn.main !== 'その他' && sn.main !== normalized.main;
    });

    normalized.sub = subCandidate ? CategoryNormalizer.normalize(subCandidate).main : '';
  }

  /**
   * Attach browseNodeId to normalized category result
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

  /**
   * Check if a category name is valid (legacy logic from PAAPIClient)
   */
  public static isValidCategoryName(name: string): boolean {
    if (!name) return false;

    const invalidPatterns = [
      /Sale|Off|Coupon|Ranking|Best|Week|Fair|Event|Campaign/i,
      /セール|オフ(?!ィス)|クーポン|ランキング|おすすめ|ウィーク|フェア|イベント|キャンペーン/,
      /企画|向け|ほか$|など$|新商品|すべて$|特設ページ|発売日お届け|父の日/,
      /割引|お買い得|利用シーン|あわせ買い|合わせ買い|全商品$|関連製品$|新製品$|ヤスいいね|対象商品|人気商品|レビュー評価/,
      /まとめ買い|まとめでお得|中止|HQP|紐付|新生活|入園入学/,
      /^・.*・$/,
      /non\s*manga/i,
      /^KOS_/i,
      /Winter Favorites/i,
      /高評価ブランド/,
      /今旬/,
      /サンプリング除外/,
      /Node\d+/i,
      /特集/,
      /新着/,
      /新規発売/,
      /予約/,
      /限定/,
      /recommendation/i,
      /eligible/i,
      /widget/i,
      /smartphones/i,
      // Internal ID patterns like L2_01_StorageItems_01Cat or L201Skincare01Cat
      /L\d+[_A-Z].*Cat$/i,
      /^All /i,
      /^Prime /i,
      /[【】|()※]/,
      /^家電$/,
      /^アクセサリ$/,
      /^アクセサリー$/,
      // Block UUID-like patterns often used for internal nodes
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      // Block "Name [ID]" pattern (e.g. "家電 [124048011]")
      /[^[\]]{1,200} \[\d+\]/,
      /Managed Stores/i,
      /Custom Stores Navigation/i,
      /Special Features Stores/i,
      /Arborist Merchandising Root/i,
    ];

    // Specific whitelist for valid multi-dot categories
    const allowedMultiDot = [
      '磁気・チタン・ゲルマニウムアクセサリー',
      '周辺機器・アクセサリ',
      'キーボード・マウス・入力機器',
      '体重・体脂肪・体組成計',
    ];
    if (allowedMultiDot.some((allowed) => name.includes(allowed))) {
      return true;
    }

    // Check for multiple dots (2 or more) which usually indicates a breadcrumb-like category
    // e.g. "日用品・生活必需品 - 文房具・オフィス用品" (contains 2 dots if we consider the full path, but here we check individual node name)
    // The user example "日用品・生活必需品 - 文房具・オフィス用品" actually contains "・" and "-"
    // If the node name itself contains multiple "・", it's likely a composite junk category.
    const dotCount = (name.match(/・/g) || []).length;
    if (dotCount >= 2) {
      return false;
    }

    if (invalidPatterns.some((pattern) => pattern.test(name))) {
      return false;
    }

    // Check for generic "Store" suffix
    // User requested to exclude categories ending with "Store" (e.g., Drugstore)
    const genericStorePatterns = [/ストア$|Store$|ストア\s*[(（].*[)）]$/i];

    if (genericStorePatterns.some((pattern) => pattern.test(name))) {
      return false;
    }

    const blockList = [
      'Arborist Merchandising Root',
      'Babel 6-2',
      'Calendar Test',
      'Test',
      'テスト',
      '面だし用ASIN',
      'Hair Care',
      'HPC recommendation widget',
      'PBHome&Kitchen9999',
      'Panasonic-HA-HotAirStylers',
      'UMall',
      'SnS Acquisition Test HPC ASINs',
      'シャープの家電がお買い得',
      'ジュニアシート 3歳頃から',
      'チャイルドシート 1歳頃から',
      'チャイルドシート 新生児から',
      'カテゴリー別',
      '卒園式・入学式の撮影テクニック',
      'yobi',
      'P&G',
      '定期おトク便',
      '介護用品・生理用品',
      '花王',
      'Panasonic Beauty',
      'TWINBIRD',
      'Panasonic ヘアケア',
      'パナソニック ヘアケア',
      'パナソニック ヘアードライヤー',
      'おうちでヘアケア',
      'アウトドア用品',
      'スポーツ＆アウトドア',
      'Sports & Outdoors',
      'ホーム・日用品',
      '日用品・生活必需品：おもちゃ',
      '和書（アダルト除く）',
      'Featured Categories',
      'OMRON（オムロン）',
      '電池利用商品',
      'IO DATA',
      'Logicool',
      'CASIO',
      'Lenovo',
      'HPC_CreatorInfoHub',
      'Drugstore - AmazonGlobal',
      'PB_Home&Kitchen',
      '新生活ギフト',
      'YA-MAN',
      'others',
      'PB_Beauty',
      'パントリー',
      '対象ASIN',
      '面出し用ASIN',
      'Internal',
      'サンワサプライ',
      'PB_PC',
      'ベビー＆マタニティ',
      'ホーム＆キッチン',
      '食品・飲料・お酒',
      '服＆ファッション小物',
      'Beauty Store',
      '介護用品・生理用品',
      '花王',
      'Diapers',
      'シャープ',
      'Special Features Stores',
      'Self Service',
      'Amazon Global',
      'Amazon Basics',
      'Amazon Basic',
      'Amazon Store',
      'Kindle本',
      'ジャンル別',
      'Custom Stores',
      'Custom Stores Navigation',
      '無料本',
      'キャンペーン',
      'まとめ買い',
      '期間限定ポイント',
      'h&s',
      'Panasonic-HA-',
      'Amazonベーシック',
      'Kindle Popup',
      'Kindle書籍 5冊購入で15%ポイント還元',
      'Kindle電子書籍リーダー',
      '文房具図鑑',
      '受験対策文房具',
      'コクヨの文房具・事務用品',
      '美容・健康家電',
      '理美容家電',
      'Kindle書籍',
      'Kindle Unlimited',
      'おせちHQP紐付用',
      'AmazonGlobal',
      'クリスマスギフト･コフレ',
      '日用品・生活必需品 - ビューティー',
      'カー＆バイク用品',
      '車＆バイク',
      'Kindleオーナー ライブラリー',
      'Kindle本 (電子書籍) まとめ買いキャンペーン',
      'Kindle本 ポイントアップチャンスキャンペーン',
      'Kindle本はじめての購入に使える70%OFFクーポン',
      'Kindle Events',
      'ポイントフェア',
      'まとめ買い(期間限定ポイント)',
      '冬の読書応援',
      '秋',
      '冬',
      '春',
      '夏',
      'Amazon',
      'Baby',
      'ベビー',
      'GT Managed Stores',
      'スポーツ・アウトドア',
      'Sports - AmazonGlobal free shipping',
      'Babel',
      'nonmanga_',
      'new release non manga',
      'ブランド別インテリアコーディネート',
    ];

    if (
      blockList.some((block) => {
        if (name.toLowerCase().includes(block.toLowerCase())) {
          // Exception: "ベビーカー" is valid even if "ベビー" is blocked
          if (block === 'ベビー' && name === 'ベビーカー') {
            return false;
          }
          if (block === 'Baby' && name === 'Baby Strollers') {
            return false;
          }
          return true;
        }
        return false;
      })
    ) {
      return false;
    }

    return true;
  }

  private static sanitizeCategoryName(name: string): string {
    // Remove internal prefixes like PJ_
    const sanitized = name.replace(/^PJ_/i, '');
    // Remove special characters sometimes found in browse nodes
    return sanitized.replaceAll(/[【】|()_※]/g, '').trim();
  }
}
