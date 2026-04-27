import type { CreatorsAPIBrowseNode } from '../types/CreatorsAPITypes';

export type BrowseNode = CreatorsAPIBrowseNode;

export interface NormalizedCategory {
  main: string;
  sub: string;
  nameCount: number;
  score: number;
}

export class CategoryNormalizer {
  private static readonly PREFERRED_KEYWORDS = [
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
    'ブロック',
    'レゴ',
    'Lego',
    'ベビー',
    'マタニティ',
    'ビジネス',
    'ペット',
    '猫',
    '犬',
    'ヘアケア',
    'シャンプー',
    'トリートメント',
    'リンス',
    'マイク',
    'ビジネス・経済',
    'マネープラン',
    '節約・家計管理',
    '投資',
    '自己啓発',
    '実用書',
    'コミック・ラノベ',
    '暮らし・健康・子育て',
    '育毛',
    'トニック',
    'スカルプ',
  ];

  /**
   * Normalize a BrowseNode into a category
   * Policy: Use the Amazon category as is, but filter out inappropriate ones.
   */
  public static normalize(node?: BrowseNode): NormalizedCategory {
    if (!node) {
      return { main: 'その他', sub: 'Unknown', nameCount: 0, score: -1 };
    }

    const validNames = CategoryNormalizer.collectValidHierarchyNames(node);

    if (validNames.length > 0) {
      const main = validNames[0] ?? 'Unknown';
      const sub = validNames[1] ?? '';
      const score = CategoryNormalizer.calculateScore(validNames);

      return { main, sub, nameCount: validNames.length, score };
    }

    return CategoryNormalizer.getFallbackCategory(node);
  }

  /**
   * Collect all valid display names up the tree
   */
  private static collectValidHierarchyNames(node: BrowseNode): string[] {
    const validNames: string[] = [];
    let currentNode: BrowseNode | undefined = node;

    while (currentNode) {
      const cfn = currentNode.contextFreeName;
      const dn = currentNode.displayName || currentNode.DisplayName;

      const validCFN =
        cfn && CategoryNormalizer.isValidCategoryName(cfn) ? CategoryNormalizer.sanitizeCategoryName(cfn) : null;
      const validDN =
        dn && CategoryNormalizer.isValidCategoryName(dn) ? CategoryNormalizer.sanitizeCategoryName(dn) : null;

      const bestName = CategoryNormalizer.pickBestName(validCFN, validDN);
      if (bestName) {
        validNames.push(bestName);
      }

      currentNode = currentNode.ancestor || currentNode.Ancestor;
    }

    return validNames;
  }

  /**
   * Pick the best name between contextFreeName and displayName
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
   * Calculate score based on preferred keywords
   */
  private static calculateScore(names: string[]): number {
    const hasPreferredKeyword = names.some((name) =>
      CategoryNormalizer.PREFERRED_KEYWORDS.some((keyword) => name.toLowerCase().includes(keyword.toLowerCase())),
    );

    return hasPreferredKeyword ? 10 : 0;
  }

  /**
   * Get fallback category when no valid names found
   */
  private static getFallbackCategory(node: BrowseNode): NormalizedCategory {
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

      // Priority Policy: Depth (Specificity) > Score (Domain preference) > SalesRank
      // 1. Depth (Specificity): Prefer most specific leaf categories
      if (normB.nameCount !== normA.nameCount) {
        return normB.nameCount - normA.nameCount;
      }
      // 2. Score (Domain preference)
      if (normB.score !== normA.score) {
        return normB.score - normA.score;
      }
      // 3. Sales Rank
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
    const bestNode = sortedNodes[0];
    if (bestNode) {
      return CategoryNormalizer.attachBrowseNodeId(CategoryNormalizer.normalize(bestNode), bestNode);
    }

    return { main: 'その他', sub: 'Unknown', nameCount: 0, score: -1 };
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
      '草刈機・刈払機パーツ・アクセサリ',
      '育毛・養毛用トニック・エッセンス',
      'ヘアケアギフトセット',
      'ヘアケア・カラー・スタイリング',
    ];
    if (whitelist.some((item) => name.includes(CategoryNormalizer.getComparisonName(item)))) {
      return true;
    }

    // 2. Structural & General Invalid Patterns (Regex)
    const invalidPatterns = [
      /sale|off|coupon|ranking|best|week|fair|event|campaign|bauhutte|free shipping|test/i,
      /セール|オフ(?!ィス)|クーポン|ランキング|おすすめ|ウィーク|フェア|イベント|キャンペーン/,
      /企画|向け|ほか$|など$|他(?:$|[\s、])|新商品|すべて$|特設ページ|発売日お届け|父の日/,
      /替えブラシ[_＿\s]*[sｓ]/i,
      /割引|お買い得|利用シーン|あわせ買い|合わせ買い|全商品$|関連製品$|新製品$|ヤスいいね|対象商品|人気商品|レビュー評価/,
      /まとめ買い|まとめでお得|中止|hqp|紐付|新生活|入園入学/,
      /定期おトク便/,
      /ポイントアップ/,
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
      /l\d+.*cat$/i,
      /^all /i,
      /^prime /i,
      /[【】|()（）※]/,
      /^家電$/,
      /^アクセサリ$/,
      /^アクセサリー$/,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      // Block "Name [ID]" pattern (e.g. "家電 [124048011]")
      /[^[\]]{1,200} \[\d+\]/,
      /arborist merchandising root/i,
      // Generic "Store" pages
      /(?:ストア|store)(?:\s*[(（].*[)）])?$/i,
      /ブラックフライデー/i,
      /文房具・オフィス用品ヤスいいね対象/,
      /日本ヒルズ・コルゲート/i,
      /umall/i,
      /祝い|ギフト/i,
      /brandname変更/i,
      /deal/i,
      /^hpc/i,
      /\w*afc[\s\d]*under/i,
      /\w+[\s\d]*under\d+/i,
      /^\d{2}\s*ビジネス/,
      /spring must haves/i,
      /(?:kindle|無料|[0-9０-９]+万円|円|テスト|test|マッサージャーほか健康家電|[>＞]|表示されている方限定|widget)/i,
      /(?:amazon\s*global|amazonglobal|babel|コクヨ|beauty|パントリー|本日の|特選品|cml|customers' most-loved|ソニー|9999$|ポイント還元本|書籍タイトル|free\s*shipping)/i,
      // Age ranges and price ranges
      /\d+[歳才]+～/,
      /\d+(?:,\d+)?-\d+(?:,\d+)?円/,
      /ゲージ/,
      // Machine-generated IDs (e.g. L202StorageItems02Sub, L2_02_StorageItems_02Sub)
      /l[\d\s_]+[a-z]+[\d\s_]+(?:cat|sub)/i,
      // Device and Store management pages
      /(?:kindle|fire|echo|alexa|amazon|ring).*(?:一覧|ページ|ストア|store|popup|体験|イベント)/i,
      // Brand-specific promotion/coordinated pages
      /(?:sony|ソニー|panasonic|パナソニック|logicool|ロジクール|elecom|エレコム).*(?:特集|一覧|プロモーション|キャンペーン|限定|コーディネート)/i,
      /(?:iris|アイリス|brother|ブラザー|nestle|ネスレ|cleansui|クリンスイ|luminous|ルミナス).*(?:特集|一覧|プロモーション|キャンペーン|限定|コーディネート)/i,
      /毎日使う水/i,
      /primeday|black\s*friday|ブラックフライデー|新生活|入園入学|父の日|母の日/i,
      /^燃料$/,
      /なるほど家電/i,
      /iswhitegloverequired/i,
      /秀和システム.*コレクション/i,
      /プロも納得/i,
      /スチールラックのすごい収納/i,
      /収納ラック.*セット/i,
      /理美容以外の本体/i,
      /ドラッグストア\s*HOTW/i,
      /第[123一二三]類医薬品/i,
      /濫用の恐れ/i,
      /その他の.*(?:書籍|本|関連)$/,
      /banner|installments|membership/i,
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
      'featured categories',
      'omron（オムロン）',
      '電池利用商品',
      'io data',
      'logicool',
      'casio',
      'lenovo',
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
      'ビューティー',
      'ビューティーストア',
      'diapers',
      'シャープ',
      'special features stores',
      'self service',
      'amazon global',
      'amazon basics',
      'amazon basic',
      'amazon store',
      'その他',
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
      'piano・keyboard｜headphones',
      'ピアノ・キーボード｜ヘッドホン',
      'プライム感謝祭ポイントアップ商品',
      'home&kitchen用品ポイントアップ+1% 1',
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
      'j-pop・日本の音楽',
      'パントリー事務用品テープ・結束具',
      'ベビー・幼児用おもちゃ',
      'ベビー家具・収納',
      'ネスレ日本',
      '本',
      '書籍',
      '和書',
      'Kindle本',
      '収納・生活雑貨',
      'タケオキクチ、コムサイズム他 ビジネスファッション・小物',
    ];

    if (blacklist.includes(name)) {
      return false;
    }

    return true;
  }

  private static sanitizeCategoryName(name: string): string {
    // Remove internal prefixes like PJ_
    const sanitized = name.replace(/^PJ_/i, '');
    // Normalize spaces (including NBSP \u00a0) and remove special characters
    return sanitized
      .replaceAll(/[\u00a0\s]+/g, ' ')
      .replaceAll(/[【】|()（）_※]/g, '')
      .trim();
  }
}
