import type { CreatorsAPIBrowseNode } from '../types/CreatorsAPITypes';

export type BrowseNode = CreatorsAPIBrowseNode;

export interface NormalizedCategory {
  main: string;
  sub: string;
  nameCount: number;
  score: number;
}

export class CategoryNormalizer {
  private static readonly preferredKeywords = [
    'スマートフォン', 'スマホ', 'タブレット', 'ノートパソコン', 'PC', 'ゲーミングPC', 
    'ディスプレー', 'モニター', 'キーボード', 'マウス', 'イヤホン', 'ヘッドホン', 
    'スピーカー', 'カメラ', 'レンズ', 'プロジェクター', 'テレビ', '冷蔵庫', '洗濯機',
    '炊飯器', '掃除機', '電子レンジ', 'エアコン', '健康食品', 'サプリメント', '補助食品', 'サプリ',
    'ボードゲーム', 'アナログゲーム', 'カードゲーム', 'おもちゃ', 'ホビー', 'フィギュア', 
    'プラモデル', '画材', '文房具', '文具', '絵具', 'オフィス用品', '収納',
    'チャイルドシート', 'ジュニアシート', 'ベビーカー', '抱っこ紐', 'おむつ', '紙おむつ',
    'ベビーおむつ', 'ゲーミングチェア', 'デスクチェア', 'パソコンチェア', 'オフィスチェア',
    'ワークチェア', 'Kindle', 'Fire', 'Echo', 'Alexa', 'Ring', 'Amazonデバイス',
    '本', '書籍', 'コントローラー', 'ヘッドセット', '替えブラシ', 'マッサージ機',
    '健康家電', 'ロボット', 'ガンダム', '美顔器', '美容家電', 'ブロック', 'レゴ',
    'Lego', 'ベビー', 'マタニティ', 'ビジネス'
  ];

  /**
   * Normalize a BrowseNode into a category
   * Policy: Use the Amazon category as is, but filter out inappropriate ones.
   */
  public static normalize(node?: BrowseNode): NormalizedCategory {
    if (!node) {
      return { main: 'その他', sub: 'Unknown', nameCount: 0, score: -1 };
    }

    const validNames: string[] = [];
    let currentNode: BrowseNode | undefined = node;

    while (currentNode) {
      const name = CategoryNormalizer.getValidNameFromNode(currentNode);
      if (name) {
        validNames.push(name);
      }
      currentNode = currentNode.ancestor || currentNode.Ancestor;
    }

    if (validNames.length > 0) {
      return {
        main: validNames[0] ?? 'Unknown',
        sub: validNames[1] ?? '',
        nameCount: validNames.length,
        score: CategoryNormalizer.calculateScore(validNames),
      };
    }

    return CategoryNormalizer.getFallbackCategory(node);
  }

  /**
   * Extract a single valid name from a node, prioritizing better variants
   */
  private static getValidNameFromNode(node: BrowseNode): string | null {
    const cfn = node.contextFreeName;
    const dn = node.displayName || node.DisplayName;
    
    const vCFN = cfn && CategoryNormalizer.isValidCategoryName(cfn) ? 
      CategoryNormalizer.sanitizeCategoryName(cfn) : null;
    const vDN = dn && CategoryNormalizer.isValidCategoryName(dn) ? 
      CategoryNormalizer.sanitizeCategoryName(dn) : null;

    if (!vCFN || !vDN) {
      return vDN || vCFN;
    }

    // If both exist, choose the better one
    const lowerCFN = vCFN.toLowerCase();
    const lowerDN = vDN.toLowerCase();
    
    // 1. More specific name (contains the other but is longer)
    if (lowerDN.includes(lowerCFN) && vDN.length > vCFN.length) return vDN;
    if (lowerCFN.includes(lowerDN) && vCFN.length > vDN.length) return vCFN;
    
    // 2. Prefer Japanese (Multibyte) over English
    const hasJpDN = /[ぁ-んァ-ヶー一-龠]/.test(vDN);
    const hasJpCFN = /[ぁ-んァ-ヶー一-龠]/.test(vCFN);
    if (hasJpDN && !hasJpCFN) return vDN;
    
    // Default to CFN as it's usually cleaner
    return vCFN;
  }

  /**
   * Calculate score based on preferred keywords
   */
  private static calculateScore(validNames: string[]): number {
    const hasPreferredKeyword = validNames.some((name) =>
      CategoryNormalizer.preferredKeywords.some((keyword) => 
        name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
    return hasPreferredKeyword ? 10 : 0;
  }

  /**
   * Fallback logic when no valid category is found in hierarchy
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
      if (normB.nameCount !== normA.nameCount) {
        return normB.nameCount - normA.nameCount;
      }
      if (normB.score !== normA.score) {
        return normB.score - normA.score;
      }
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
      .replaceAll(/[＿_]/g, ' ')
      .replaceAll(/\s+/g, ' ')
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
      /ポイントアップ/,
      /^・.*・$/,
      /non\s*manga/i,
      /kos_/i,
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
      /^家電$/,
      /^アクセサリ$/,
      /^アクセサリー$/,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      /[^[]]{1,200} \[\d+\]/,
      /arborist merchandising root/i,
      /(?:ストア|store)(?:\s*[(（].*[)）])?$/i,
      /ブラックフライデー/i,
      /文房具・オフィス用品ヤスいいね対象/,
      /日本ヒルズ・コルゲート/i,
      /umall/i,
      /祝い|ギフト/i,
      /brandname変更/i,
      /deal/i,
      /^hpc/i,
      /^\d{2}\s*ビジネス/,
      /spring must haves/i,
      /(?:kindle|無料|[0-9０-９]+万円|円|テスト|マッサージャーほか健康家電)/i,
      /(?:amazon\s*global|amazonglobal|babel|コクヨ|beauty|パントリー|本日の|特選品|cml|customers' most-loved|ソニー|9999$|ポイント還元本|書籍タイトル)/i,
      /\d+[歳才]+～/,
      /\d+(?:,\d+)?-\d+(?:,\d+)?円/,
      /ゲージ/,
      /l[\d\s_]+[a-z]+[\d\s_]+(?:cat|sub)/i,
      /(?:kindle|fire|echo|alexa|amazon|ring).*(?:一覧|ページ|ストア|store|popup|体験|イベント)/i,
      /(?:sony|ソニー|panasonic|パナソニック|logicool|ロジクール|elecom|エレコム|iris|アイリス|brother|ブラザー|nestle|ネスレ).*(?:特集|一覧|プロモーション|キャンペーン|限定|コーディネート)/i,
    ];

    if (invalidPatterns.some((pattern) => pattern.test(name))) {
      return false;
    }

    // 3. Dot Count Check
    const dotCount = (name.match(/・/g) || []).length;
    if (dotCount >= 2) {
      return false;
    }

    // 4. Blacklist
    const blacklist = [
      'ドラッグストア', 'ビューティー', 'パソコン・周辺機器', '大型家電', '家電＆カメラ',
      'ホーム＆キッチン', 'DIY・工具・ガーデン', 'スポーツ＆アウトドア', 'おもちゃ', 'ホビー',
      'ベビー＆マタニティ', 'ペット用品', 'キッチン用品', '食器・カトラリー', '調理・製菓道具',
      '弁当箱・水筒', 'キッチン用品・食器', 'バス・トイレ・洗面用品', 'タオル',
      'ラグ・カーペット・マット', 'カーテン・ブラインド', 'クッション・座布団', '寝具',
      'インテリア', '生活雑貨', '防犯・防災用品', '掃除用品', '洗濯用品', '手芸・画材',
      '文房具・オフィス用品', '楽器・音響機器', '本', '洋書', '雑誌', 'コミック',
      'Kindle本', 'デジタルミュージック', 'ビデオ・DVD', 'TVゲーム', 'PCソフト',
      'お酒', '飲料', '食品・飲料・お酒', '服＆ファッション小物', 'シューズ＆バッグ',
      'ジュエリー', '時計', 'Amazonブランド', 'Amazon限定商品', 'Featured Categories',
      'Categories', 'カテゴリー', 'カテゴリ', '定期おトク便', '対象asin', '面出し用asin',
      'internal', 'others', 'パントリー', 'amazon global', 'amazon basics',
      'amazon basic', 'amazon store', 'kindle本', 'ジャンル別', 'custom stores',
      '無料本', 'キャンペーン', 'まとめ買い', '期間限定ポイント',
    ];

    if (blacklist.includes(name)) {
      return false;
    }

    return true;
  }

  private static sanitizeCategoryName(name: string): string {
    let sanitized = name.replace(/^PJ_/i, '');
    
    // Normalize spaces (convert any whitespace to a single half-width space)
    sanitized = sanitized.replaceAll(/\s+/g, ' ');

    // Remove text inside parentheses (e.g., "(30日分)", "【限定】", etc.)
    sanitized = sanitized.replaceAll(/[（(].*?[)）]/g, '');
    sanitized = sanitized.replaceAll(/[【［[].*?[】］\]]/g, '');

    // Remove remaining symbols and trim
    return sanitized.replaceAll(/[【】|()（）_※]/g, '').trim();
  }
}
