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
      const main = validNames[0] as string;
      const sub = (validNames.length > 1 ? validNames[1] : '') as string;

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
        '替えブラシ',
        'マッサージ機',
        '健康家電',
        'ロボット',
        'ガンダム',
        '美顔器',
        '美容家電',
      ];

      if (
        preferredKeywords.some(
          (k) => main.toLowerCase().includes(k.toLowerCase()) || sub.toLowerCase().includes(k.toLowerCase()),
        )
      ) {
        score = 10;
      }

      return { main: main, sub: sub, nameCount: validNames.length, score };
    }

    // If no valid category found in the tree, fallback to Other
    const fallbackName = node.displayName || node.DisplayName || 'Unknown';
    const subName = CategoryNormalizer.isValidCategoryName(fallbackName)
      ? CategoryNormalizer.sanitizeCategoryName(fallbackName)
      : '一般';

    return {
      main: 'その他',
      sub: subName,
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
    const bestNode = sortedNodes[0] as BrowseNode;
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
   * Get a normalized name for comparison
   */
  private static getComparisonName(name: string): string {
    return name
      .toLowerCase()
      .replaceAll(/[＿_]/g, ' ') // アンダースコアをスペースに
      .replaceAll(/\s+/g, ' ') // 連続スペースを1つに
      .trim();
  }

  /**
   * Check if a category name is valid
   */
  public static isValidCategoryName(originalName: string): boolean {
    if (!originalName) return false;

    const name = CategoryNormalizer.getComparisonName(originalName);

    // 1. Whitelist (Highest Priority)
    const whitelist = [
      '磁気・チタン・ゲルマニウムアクセサリー',
      '周辺機器・アクセサリ',
      'キーボード・マウス・入力機器',
      '体重・体脂肪・体組成計',
      'ベビーカー',
    ];
    if (whitelist.some((item) => name.includes(CategoryNormalizer.getComparisonName(item)))) {
      return true;
    }

    // 2. Structural & General Invalid Patterns (Regex)
    const invalidPatterns = [
      /sale|off|coupon|ranking|best|week|fair|event|campaign|bauhutte|free shipping|test/i,
      /セール|オフ(?!ィス)|クーポン|ランキング|おすすめ|ウィーク|フェア|イベント|キャンペーン/,
      /企画|向け|ほか$|など$|新商品|すべて$|特設ページ|発売日お届け|父の日/,
      /替えブラシ[_＿\s]*[sｓ]/i,
      /割引|お買い得|利用シーン|あわせ買い|合わせ買い|全商品$|関連製品$|新製品$|ヤスいいね|対象商品|人気商品|レビュー評価/,
      /まとめ買い|まとめでお得|中止|hqp|紐付|新生活|入園入学/,
      /定期おトク便/,
      /^・.*・$/,
      /non\s*manga/i,
      /^kos_/i,
      /winter favorites/i,
      /高評価ブランド/,
      /今旬/,
      /サンプリング除外/,
      /おもちゃ.*column/i,
      /node\d+/i,
      /特集/,
      /新着/,
      /新規発売/,
      /予約/,
      /限定/,
      /recommendation/i,
      /eligible/i,
      /widget/i,
      /smartphones/i,
      /l\d+[_a-z].*cat$/i,
      /^all /i,
      /^prime /i,
      /[【】|()※]/,
      /^家電$/,
      /^アクセサリ$/,
      /^アクセサリー$/,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      // Block "Name [ID]" pattern (e.g. "家電 [124048011]")
      /[^[\]]{1,200} \[\d+\]/,
      /managed stores/i,
      /custom stores navigation/i,
      /special features stores/i,
      /arborist merchandising root/i,
      /ストア$|store$|ストア\s*[(（].*[)）]$/i,
      /ブラックフライデー/i,
      /文房具・オフィス用品ヤスいいね対象/,
      /日本ヒルズ・コルゲート/i,
      /umall/i,
      /祝い|ギフト/i,
      /brandname変更/i,
      /deal/i,
    ];

    if (invalidPatterns.some((pattern) => pattern.test(name))) {
      return false;
    }

    // 3. Dot Count Check
    const dotCount = (name.match(/・/g) || []).length;
    if (dotCount >= 2) {
      return false;
    }

    // 4. Blacklist (Full Match after normalization)
    const blacklist = [
      'arborist merchandising root',
      'babel 6-2',
      'calendar test',
      'test',
      'テスト',
      '面だし用asin',
      'hair care',
      'hpc recommendation widget',
      'pbhome&kitchen9999',
      'panasonic-ha-hotairstylers',
      'umall',
      'sns acquisition test hpc asins',
      'シャープの家電がお買い得',
      'ジュニアシート 3歳頃から',
      'チャイルドシート 1歳頃から',
      'チャイルドシート 新生児から',
      'カテゴリー別',
      '卒園式・入学式の撮影テクニック',
      'yobi',
      'p&g',
      '定期おトク便',
      '介護用品・生理用品',
      '花王',
      'panasonic beauty',
      'twinbird',
      'panasonic ヘアケア',
      'パナソニック ヘアケア',
      'パナソニック ヘアードライヤー',
      'おうちでヘアケア',
      'アウトドア用品',
      'スポーツ＆アウトドア',
      'sports & outdoors',
      'ホーム・日用品',
      '日用品・生活必需品：おもちゃ',
      '和書（アダルト除く）',
      'featured categories',
      'omron（オムロン）',
      '電池利用商品',
      'io data',
      'logicool',
      'casio',
      'lenovo',
      'hpc_creatorinfohub',
      'drugstore - amazonglobal',
      'pb_home&kitchen',
      '新生活ギフト',
      'ya-man',
      'others',
      'pb_beauty',
      'パントリー',
      '対象asin',
      '面出し用asin',
      'internal',
      'サンワサプライ',
      'pb_pc',
      'ベビー＆マタニティ',
      'ホーム＆キッチン',
      '食品・飲料・お酒',
      '服＆ファッション小物',
      'beauty store',
      'diapers',
      'シャープ',
      'special features stores',
      'self service',
      'amazon global',
      'amazon basics',
      'amazon basic',
      'amazon store',
      'kindle本',
      'ジャンル別',
      'custom stores',
      'custom stores navigation',
      '無料本',
      'キャンペーン',
      'まとめ買い',
      '期間限定ポイント',
      'h&s',
      'panasonic-ha-',
      'amazonベーシック',
      'kindle popup',
      'kindle書籍 5冊購入で15%ポイント還元',
      'kindle電子書籍リーダー',
      '文房具図鑑',
      '受験対策文房具',
      'コクヨの文房具・事務用品',
      '美容・健康家電',
      '理美容家電',
      'kindle書籍',
      'kindle unlimited',
      'おせちhqp紐付用',
      'amazonglobal',
      'クリスマスギフト･コフレ',
      '日用品・生活必需品 - ビューティー',
      'スッキリ片づける・収納する',
      'カー＆バイク用品',
      '車＆バイク',
      'kindleオーナー ライブラリー',
      'kindle本 (電子書籍) まとめ買いキャンペーン',
      'kindle本 ポイントアップチャンスキャンペーン',
      'kindle本はじめての購入に使える70%offクーポン',
      'kindle events',
      'ポイントフェア',
      'まとめ買い(期間限定ポイント)',
      '冬の読書応援',
      '秋',
      '冬',
      '春',
      '夏',
      'amazon',
      'baby',
      'ベビー',
      'gt managed stores',
      'スポーツ・アウトドア',
      'sports - amazonglobal free shipping',
      'babel',
      'nonmanga_',
      'new release non manga',
      'ブランド別インテリアコーディネート',
      'bauhutteyamahabxgy',
      'cmldeals on most home&kitchen9999',
      'hpcafc2409under2000',
      'l201skincare01cat',
      'l202storageitems01cat',
      'l205hairbodycare01cat',
      'nthamzfundcontrol',
      'nthamzfundtreatment',
      '「なるほど家電」はアイリスオーヤマ',
      'おもちゃ2column',
      'ソニー2025springcamera',
      'ソニー2026springvlog',
      'ピアノ・キーボード｜ヘッドホン',
      'プライム感謝祭ポイントアップ商品',
      'ホーム&キッチン用品ポイントアップ+1% 1',
      '文具・事務用品（その他）',
      '日本ヒルズ・コルゲート199t',
      '新学期文具',
      '替えブラシs',
      '家電 本体',
      '家電 新商品',
      '理美容家電 新商品',
      '理美容家電新商品特集',
      'スキンケア他美容家電新商品',
      '白系家電特集',
      '母の日特集',
    ];

    if (blacklist.includes(name)) {
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
