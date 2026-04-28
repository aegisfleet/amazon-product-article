import { type BrowseNode, CategoryNormalizer } from './CategoryNormalizer';

describe('CategoryNormalizer', () => {
  describe('isValidCategoryName', () => {
    it('should return true for valid category names', () => {
      expect(CategoryNormalizer.isValidCategoryName('electronics')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('ビジネス・経済')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('ボードゲーム')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('草刈機・刈払機パーツ・アクセサリ')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('category_with_dash')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('育毛・養毛用トニック・エッセンス')).toBe(true);
    });

    it('should return false for empty or undefined names', () => {
      expect(CategoryNormalizer.isValidCategoryName('')).toBe(false);
      // @ts-expect-error - Testing undefined input
      expect(CategoryNormalizer.isValidCategoryName(undefined)).toBe(false);
      // @ts-expect-error - Testing null input
      expect(CategoryNormalizer.isValidCategoryName(null)).toBe(false);
    });

    it('should return false for names matching invalid patterns', () => {
      const invalidNames = [
        'Fire TV 商品一覧ページ',
        'L202StorageItems02Sub',
        'ブラックフライデー',
        'ブラックフライデーDealKitchen',
        'ブラックフライデーdealelectronics',
        'お得なブラックフライデーセール',
        '文房具・オフィス用品ヤスいいね対象商品2',
        '文房具・オフィス用品ヤスいいね対象外商品1',
        'UMall',
        '文具・事務用品（その他）',
        '日本ヒルズ・コルゲート199T',
        '引っ越し祝い',
        'Home Gift（ホームギフト）',
        'BrandName変更確認',
        'ブラックフライデー_Deal_Kitchen',
        'BF_Deal',
        'BauhutteYAMAHABXGY',
        'Beauty - AmazonGlobal Free Shipping',
        'Drugstore - AmazonGlobal Free Shipping',
        'Home & Kitchen - AmazonGlobal Free Shipping',
        'SnS Acquisition Test HPC ASINs Low Price',
        'Toys - AmazonGlobal Free Shipping',
        'ドラッグストア 表示されている方限定キャンペーン',
        'テスト　半額ストア',
        'Drugstore - AmazonGlobal free shipping',
        'HPC_CreatorInfoHub_栄養補助食品',
        'ホーム&キッチン用品ポイントアップ+1% _1',
        'ポイントアップキャンペーン',
        '定期おトク便初回最大30%OFF',
        '定期おトク便',
        'HPCAFC2409under2000',
        'HPCAFC2410under3000',
        'HPCCreatorInfoHubベビーケア・おむつ',
        'hpc recommendation widget',
        'hpc_creatorinfohub',
        'Kindle書籍・本',
        'マッサージャーほか健康家電特集',
        'Home > Kitchen',
        'テスト用カテゴリ',
        'Kindle書籍タイトル 600円～',
        'Drugstore - Amazon Global',
        'L201Skincare01Cat',
        'L202StorageItems02Sub',
        'L205HairBodyCare01Cat',
        'L802AnimalCare99Sub',
        'Fire TV 商品一覧ページ',
        'Fire TV 関連商品一覧',
        'ソニー2025SpringCamera',
        'パナソニック ヘアケア特集',
        'アイリス 人気収納一覧',
        'ブランド別インテリアコーディネート',
        'Primeday2023 セール',
        'ブラックフライデー お買い得',
        'カテゴリ＞収納棚・ボックス',
        'J-POP・日本の音楽',
        'パントリー事務用品テープ・結束具',
        'ベビー・幼児用おもちゃ',
        'ベビー家具・収納',
        'コクヨ　「文房具図鑑 その文具のいい所から悪い所まで最強解説」 掲載文房具',
        'コクヨの文房具・事務用品',
        'PBBeauty9999',
        '3P beauty',
        'CMLBeauty9999',
        'Beautyover2000B',
        '本日の特選品　非常用品・家具や家電の転倒防止用品',
        '本日のセール商品',
        '特選タイムセール',
        'CMLHome9999',
        'CMLSports9999',
        'ソニー2025SpringCamera',
        'ソニー2026SpringVlog',
        'PBPC9999',
        'PBHome&Kitchen9999',
        'N&NBeauty9999',
        'PBSports&Outdoor9999',
        '08ビジネス',
        'Spring Must Haves Womens',
        'Kindle Unlimited:読み放題 ジャンル',
        'Kindleオーナー ライブラリー',
        'Kindleマンガ 10冊購入で15%ポイント還元',
        'Kindleマンガスタンプカード',
        'Kindle本 まとめでお得秋25',
        'Kindle本マンガフェス第2弾',
        'Kindle電子書籍対象タイトル',
        '[書籍] 200円以下以下タイトル',
        'カドカワのKindle本・Kindleコミック',
        '無料本（文学・評論）',
        '２万円以上の書籍',
        'ポイント還元本',
        'ポイント還元本対象商品',
        '書籍タイトル',
        '[書籍] 読み放題タイトル（ポイント還元本）',
        'Babel 6-4',
        'Babel 1-1',
        'DIY & Garden - AmazonGlobal Free Shipping',
        'Smart Home Store - AmazonGlobal Free Shipping',
        'ピアノ・キーボード｜ヘッドホン',
        'piano・keyboard｜headphones',
        "Customers' Most-Loved：おもちゃ&ホビー",
        '3歳～',
        '6歳才～',
        '2,001-3,000円',
        '10,000-15,000円',
        '犬用品 ゲージ',
        '燃料',
        '「なるほど家電」はアイリスオーヤマ',
        'なるほど家電が毎日お買い得',
        'IsWhiteGloveRequired',
        '本',
        '書籍',
        '和書',
        'Kindle本',
        '秀和システム新社 今すぐ使える実用書コレクション！',
        '毎日使う水だから 家庭用浄水器ならクリンスイ',
        'プロも納得 スチールラックのすごい収納',
        'その他のビジネス・経済関連書籍',
        'その他',
        '収納ラック　セット（ルミナス）',
        '理美容以外の本体',
        'ドラッグストア HOTW',
        '第2類医薬品-濫用の恐れ無し',
        'CC installments Banner4',
        'ビューティー',
        'ビューティーストア',
        '収納・生活雑貨',
        'GroAFC2409under2000',
        'Gro_AFC_2409_under2000',
        'Groceryunder2000BFW24',
        'Grocery_under2000_BFW24',
        'SnS Acquisition Test Grocery ASINs Low Price',
        'Grocery Recommendation Widget',
        'タケオキクチ、コムサイズム他 ビジネスファッション・小物',
        '【最大60％OFF】タケオキクチ、コムサイズム他 就活・ビジネスファッション',
        'ゲーミングチェア＆デスク',
      ];
      invalidNames.forEach((name) => {
        expect(CategoryNormalizer.isValidCategoryName(name)).toBe(false);
      });
    });

    it('should distinguish between "替えブラシ" and "替えブラシS"', () => {
      expect(CategoryNormalizer.isValidCategoryName('替えブラシ')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('替えブラシs')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('替えブラシ_s')).toBe(false);
    });

    it('should handle multi-dot logic correctly', () => {
      expect(CategoryNormalizer.isValidCategoryName('category・subcategory・item')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('a・b・c')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('category・subcategory')).toBe(true);
    });

    it('should allow "ヘアケアギフトセット" even though it contains "ギフト"', () => {
      expect(CategoryNormalizer.isValidCategoryName('ヘアケアギフトセット')).toBe(true);
    });

    it('should allow "育毛・養毛用" categories even with 2+ dots', () => {
      expect(CategoryNormalizer.isValidCategoryName('育毛・養毛用シャンプー')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('育毛・養毛用トリートメント')).toBe(true);
    });

    it('should allow "ヘアケア・カラー・スタイリング" even with 2 dots', () => {
      expect(CategoryNormalizer.isValidCategoryName('ヘアケア・カラー・スタイリング')).toBe(true);
    });
  });

  describe('normalize', () => {
    it('should extract main and sub categories from ancestor chain', () => {
      const grandParent: BrowseNode = { displayName: 'toys', id: '1' };
      const parent: BrowseNode = { displayName: 'games', id: '2', ancestor: grandParent };
      const leaf: BrowseNode = { displayName: 'board games', id: '3', ancestor: parent };

      const result = CategoryNormalizer.normalize(leaf);
      expect(result).toEqual({
        main: 'board games',
        sub: 'games',
        nameCount: 3,
        score: 0,
      });
    });

    it('should prioritize contextFreeName over displayName', () => {
      const node: BrowseNode = {
        contextFreeName: 'Specific Name',
        displayName: 'Generic Name',
        id: '123',
      };
      const result = CategoryNormalizer.normalize(node);
      expect(result.main).toBe('Specific Name');
    });

    it('should skip invalid categories in the chain', () => {
      const grandParent: BrowseNode = { displayName: 'toys', id: '1' };
      const parent: BrowseNode = { displayName: 'test', id: '2', ancestor: grandParent };
      const leaf: BrowseNode = { displayName: 'board games', id: '3', ancestor: parent };

      const result = CategoryNormalizer.normalize(leaf);
      expect(result).toEqual({
        main: 'board games',
        sub: 'toys',
        nameCount: 2,
        score: 0,
      });
    });

    it('should handle both camelCase and PascalCase properties', () => {
      const node: BrowseNode = { DisplayName: 'valid category', Id: '456' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.main).toBe('valid category');
    });

    it('should normalize non-breaking spaces (NBSP) to normal spaces', () => {
      const node: BrowseNode = {
        displayName: 'L-シトルリン\u00a0サプリメント',
        id: '3457016051',
      };
      const result = CategoryNormalizer.normalize(node);
      expect(result.main).toBe('L-シトルリン サプリメント');
    });

    it('should score pet/cat categories correctly', () => {
      const node: BrowseNode = {
        contextFreeName: '猫用エンクロージャ',
        displayName: 'エンクロージャ',
        id: '10479667051',
      };
      const result = CategoryNormalizer.normalize(node);
      expect(result.main).toBe('猫用エンクロージャ');
      expect(result.score).toBe(10); // Now it should be 10 due to '猫' keyword
    });

    it('should score beauty/haircare categories correctly', () => {
      const shampooNode: BrowseNode = {
        contextFreeName: 'シャンプー',
        displayName: 'シャンプー',
        id: '123',
      };
      const result = CategoryNormalizer.normalize(shampooNode);
      expect(result.main).toBe('シャンプー');
      expect(result.score).toBe(10);

      const fuelNode: BrowseNode = {
        contextFreeName: '燃料',
        displayName: '燃料',
        id: '211760089051',
      };
      const fuelResult = CategoryNormalizer.normalize(fuelNode);
      expect(fuelResult.main).toBe('その他／全般'); // Because '燃料' is invalid
    });

    it('should score "育毛・養毛用トニック・エッセンス" as 10', () => {
      const node: BrowseNode = { displayName: '育毛・養毛用トニック・エッセンス', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.score).toBe(10);
    });

    it('should score categories with "スカルプ" as 10', () => {
      const node: BrowseNode = { displayName: 'スカルプシャンプー', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.score).toBe(10);
    });
  });

  describe('Book categorization', () => {
    it('should skip generic "本" node and pick specific genre node', () => {
      const grandParent: BrowseNode = { displayName: '本', id: '1' };
      const parent: BrowseNode = { displayName: 'ビジネス・経済', id: '2', ancestor: grandParent };
      const leaf: BrowseNode = { displayName: 'マネープラン', id: '3', ancestor: parent };

      const result = CategoryNormalizer.normalize(leaf);
      expect(result).toEqual({
        main: 'マネープラン',
        sub: 'ビジネス・経済',
        nameCount: 2,
        score: 10,
      });
    });

    it('should score "ビジネス・経済" as 10', () => {
      const node: BrowseNode = { displayName: 'ビジネス・経済', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.score).toBe(10);
    });
  });

  describe('selectBestCategory', () => {
    it('should prefer specific beauty categories over generic/junk ones', () => {
      const nodes: BrowseNode[] = [
        { displayName: '燃料', id: '211760089051' },
        { displayName: 'シャンプー', id: '123' },
        { displayName: 'ヘアケア', id: '456' },
      ];

      const result = CategoryNormalizer.selectBestCategory(nodes);
      expect(result.main).toBe('シャンプー');
      expect(result.score).toBe(10);
    });
  });
});
