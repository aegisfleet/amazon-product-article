import { type BrowseNode, CategoryNormalizer } from './CategoryNormalizer';

describe('CategoryNormalizer', () => {
  describe('isValidCategoryName', () => {
    it('should return true for valid category names', () => {
      expect(CategoryNormalizer.isValidCategoryName('ビジネス・経済')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('ボードゲーム')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('草刈機・刈払機パーツ・アクセサリ')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('category_with_dash')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('育毛・養毛用トニック・エッセンス')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('魚介類・水産加工品ギフト')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('グルメギフト')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('ドラッグストア')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('腰・腰椎用サポーター')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('肩こり・腰痛・筋肉痛緩和')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('保温・保冷カップ・マグ')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('アダプタ・充電器・ケーブル')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('スープギフト')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('ドリンクギフト')).toBe(true);
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
        '3P grocery',
        '3P beauty',
        '3p grocery',
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
        'ワイモバイルラインナップ',
        'ワイモバイル申込ガイド',
        'Huawei 話題のスマートフォン・スマートウォッチ',
        'Fitbit',
        'XiaomiAll',
        'moto g66y 5G',
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
        '02_リビング_リビング収納_チェスト',
        '02 リビング リビング収納 チェスト',
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
        '理美容・健康家電',
        'Panasonic-HA-PersonalCare',
        'Philips 理美容家電',
        'おうちでヘアケアカーリングアイロン・2WAYアイロン',
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
        'ELECOM エレコム - スマートフォン・携帯電話',
        'エレコム USB充電・データ転送ケーブル',
        'Panasonic スマホーム',
        'ロジクール ウェブカメラ・ヘッドセット',
        'パナソニック 衣類・ふとん乾燥機',
        '日用品・生活必需品 - ホーム＆キッチン',
        'Panasonic',
        'ProductAlertStampcard3500',
        'Multibuy Experiment',
        '3MAone人気アイテム',
        '3M_Aone_人気アイテム',
        '特選健康家電 オムロン、タニタ、ルルド、スライブ',
        'CosPOP_26PD_exclude',
        'CosPOP26PDexclude',
        'スリムウォーク、マスク、スマートルーペなどがお得',
        'スポーツプレイヤーのサポートアイテム',
        '6',
        '100',
        '０',
        'デジタルの日',
        'pony k',
        'ebook non series',
        '高評価・レビュー多数の書籍',
        '注目の著者',
        'electronics',
        '食品',
        '酒のみ',
        '鈴鹿8耐で役立つキャンプ用品',
        'おうちでキャンプ',
        '野外フェス用品',
        'Data Warehouse Queries with Dynamic Selection',
        'ExcludeASIN',
        'お客様都合の返品不可',
        'お客様都合の返品不可_電動歯ブラシ、口腔洗浄器',
        'メモリーカードストア：スマホで使う microSDカード',
        'Micro SDカード選び方ガイド',
        'CEROレーティングB',
        '2014C-TAX Video Game',
        'すべてのゲーム',
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
      expect(result.score).toBe(20);

      const fuelNode: BrowseNode = {
        contextFreeName: '燃料',
        displayName: '燃料',
        id: '211760089051',
      };
      const fuelResult = CategoryNormalizer.normalize(fuelNode);
      expect(fuelResult.main).toBe('その他／全般'); // Because '燃料' is invalid
    });

    it('should score "育毛・養毛用トニック・エッセンス" as 20', () => {
      const node: BrowseNode = { displayName: '育毛・養毛用トニック・エッセンス', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.score).toBe(20);
    });

    it('should score categories with "スカルプ" as 20', () => {
      const node: BrowseNode = { displayName: 'スカルプシャンプー', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.score).toBe(20);
    });

    it('should sanitize "PS4ハンドル・ジョイスティック" to "ハンドルコントローラー"', () => {
      const node: BrowseNode = { displayName: 'PS4ハンドル・ジョイスティック', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.main).toBe('ハンドルコントローラー');
      expect(result.score).toBe(10);
    });

    it('should sanitize "PS5ハンドル・ジョイスティック" to "ハンドルコントローラー"', () => {
      const node: BrowseNode = { displayName: 'PS5ハンドル・ジョイスティック', id: '1' };
      const result = CategoryNormalizer.normalize(node);
      expect(result.main).toBe('ハンドルコントローラー');
      expect(result.score).toBe(10);
    });

    it('should sanitize "PS5ハンドル・ジョイスティック" to "コントローラー・周辺機器" when title contains game pad keywords', () => {
      const node: BrowseNode = { displayName: 'PS5ハンドル・ジョイスティック', id: '1' };
      const result = CategoryNormalizer.normalize(node, '【純正品】DualSense ワイヤレスコントローラー');
      expect(result.main).toBe('コントローラー・周辺機器');
      expect(result.score).toBe(10);
    });

    it('should sanitize "PS5ハンドル・ジョイスティック" to "ハンドルコントローラー" when title does not contain game pad keywords', () => {
      const node: BrowseNode = { displayName: 'PS5ハンドル・ジョイスティック', id: '1' };
      const result = CategoryNormalizer.normalize(node, 'Logicool G レーシングコックピット');
      expect(result.main).toBe('ハンドルコントローラー');
      expect(result.score).toBe(10);
    });

    it('should sanitize "60型以上テレビ" to "液晶テレビ" or "有機ELテレビ" based on title', () => {
      const node: BrowseNode = { displayName: '60型以上テレビ', id: '5335535051' };
      const res1 = CategoryNormalizer.normalize(node, 'TCL テレビ 75V型 4K 量子ドット 液晶 75T6C');
      expect(res1.main).toBe('液晶テレビ');
      const res2 = CategoryNormalizer.normalize(node, 'LG OLED テレビ 65型 有機EL');
      expect(res2.main).toBe('有機ELテレビ');
    });

    it('should sanitize "イヤ・ヘッド" to "イヤホン・ヘッドホン"', () => {
      const node: BrowseNode = { displayName: 'イヤ・ヘッド', id: '7356944051' };
      const res = CategoryNormalizer.normalize(node);
      expect(res.main).toBe('イヤホン・ヘッドホン');
    });

    it('should sanitize "家電＆カメラ" or "カテゴリー別" to detailed category based on title', () => {
      const node: BrowseNode = { displayName: 'カテゴリー別', contextFreeName: '家電＆カメラ', id: '3210991' };

      const res1 = CategoryNormalizer.normalize(node, 'ゼンハイザー HD 599 SE 開放型スタジオヘッドホン');
      expect(res1.main).toBe('イヤホン・ヘッドホン');

      const res2 = CategoryNormalizer.normalize(node, 'イヤホン bluetooth 耳掛け ワイヤレスイヤホン');
      expect(res2.main).toBe('イヤホン・ヘッドホン');

      const res3 = CategoryNormalizer.normalize(node, 'TCL テレビ 75V型 液晶テレビ');
      expect(res3.main).toBe('液晶テレビ');

      const res4 = CategoryNormalizer.normalize(node, 'Anker Nano Charger 急速充電器');
      expect(res4.main).toBe('アダプタ・充電器・ケーブル');

      const resEmpty = CategoryNormalizer.normalize(node, '全然関係ない商品');
      expect(resEmpty.main).toBe('その他／全般');
    });

    it('should sanitize "バイクアクセサリ" to "バイク用マウントステー・ホルダー" when title contains mount/holder keywords', () => {
      const node: BrowseNode = { displayName: 'バイクアクセサリ', id: '2045223051' };
      const title =
        'エスピーコネクト（SP CONNECT）バークランプマウント Pro SPC+｜バイク用スマホホルダー｜スマホマウント｜高強度CNCアルミ製｜ハンドルバークランプ取付｜53232';
      const res = CategoryNormalizer.normalize(node, title);
      expect(res.main).toBe('バイク用マウントステー・ホルダー');
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
      expect(result.score).toBe(20);
    });

    it('should exclude "日用品・生活必需品 - ペット用品" and prefer specific pet food category', () => {
      const junkNode: BrowseNode = { displayName: '日用品・生活必需品 - ペット用品', id: '204812631051' };
      const specificNode: BrowseNode = { displayName: 'ドライキャットフード', id: '2155308051' };

      expect(CategoryNormalizer.isValidCategoryName('日用品・生活必需品 - ペット用品')).toBe(false);

      const result = CategoryNormalizer.selectBestCategory([junkNode, specificNode]);
      expect(result.main).toBe('ドライキャットフード');
      expect(result.score).toBe(10);
    });

    it('should prefer specific hair dryers over generic haircare category', () => {
      const nodes: BrowseNode[] = [
        { displayName: 'ヘアケア', id: '212411571051' },
        { displayName: 'ヘアドライヤー', id: '212411570051' },
      ];

      const result = CategoryNormalizer.selectBestCategory(nodes);
      expect(result.main).toBe('ヘアドライヤー');
      expect(result.score).toBe(20);
    });

    it('should prefer head spa appliances over generic haircare category', () => {
      const nodes: BrowseNode[] = [
        { displayName: 'ヘアケア', id: '212411571051' },
        { displayName: '電動頭皮ブラシ', id: '212411562051' },
      ];

      const result = CategoryNormalizer.selectBestCategory(nodes);
      expect(result.main).toBe('電動頭皮ブラシ');
      expect(result.score).toBe(20);
    });

    it('should prefer electric toothbrush over mismatched phone or return policy nodes (B0DHX93H1Y)', () => {
      const nodes: BrowseNode[] = [
        { displayName: 'スマホ本体', contextFreeName: 'スマホ本体', id: '7474288051' },
        { displayName: '回転式', contextFreeName: '回転式電動歯ブラシ', id: '10509662051' },
        { displayName: 'お客様都合の返品不可', contextFreeName: 'お客様都合の返品不可', id: '23674311051' },
        {
          displayName: 'お客様都合の返品不可_電動歯ブラシ、口腔洗浄器',
          contextFreeName: 'お客様都合の返品不可_電動歯ブラシ、口腔洗浄器',
          id: '23711669051',
        },
      ];
      const title =
        'ブラウン 電動歯ブラシ オーラルB 【電動初心者の決定版】iO3S iOG3.1C6.0 WT_H 静かでなめらかな磨き心地 防水 歯科医推奨No.1ブランド【Amazon.co.jp 限定】';

      const result = CategoryNormalizer.selectBestCategory(nodes, title);
      expect(result.main).toBe('回転式電動歯ブラシ');
      expect(result.sub).not.toBe('スマホ本体');
      expect(result.score).toBeGreaterThanOrEqual(10);
      expect(result.browseNodeId).toBe('10509662051');
    });

    it('should invalidate smartphone categories if title does not contain smartphone keywords', () => {
      expect(CategoryNormalizer.isValidCategoryName('スマホ本体', 'Google Pixel 8a 128GB')).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('スマホ本体', 'iPhone 15 128GB')).toBe(true);
      expect(
        CategoryNormalizer.isValidCategoryName(
          'スマートフォン本体',
          '【本体一括購入】Y!mobile moto g66y 5G【新規申込・シンプルS専用】 購入後申込必須 ※開通後発送',
        ),
      ).toBe(true);
      expect(CategoryNormalizer.isValidCategoryName('スマホ本体', 'ブラウン 電動歯ブラシ オーラルB')).toBe(false);
      expect(CategoryNormalizer.isValidCategoryName('スマートフォン本体', 'Anker モバイルバッテリー')).toBe(false);
    });

    it('should select "スマートフォン本体" for Y!mobile moto smartphone (B0FFG6GMD2)', () => {
      const nodes: BrowseNode[] = [
        {
          contextFreeName: 'スマートフォン本体',
          displayName: 'スマートフォン本体',
          id: '2497181051',
          salesRank: 660,
          ancestor: {
            contextFreeName: '携帯電話・スマートフォン本体',
            displayName: '携帯電話・スマートフォン本体',
            id: '128188011',
            ancestor: {
              contextFreeName: '携帯電話・スマートフォン',
              displayName: '携帯電話・スマートフォン',
              id: '128187011',
            },
          },
        },
        {
          contextFreeName: 'おうちで機種変更',
          displayName: 'おうちで機種変更',
          id: '8106713051',
        },
        {
          contextFreeName: 'Windows 10 Mobile 搭載 スマートフォン 特集',
          displayName: 'Windows 10 Mobile 搭載 スマートフォン 特集',
          id: '4145429051',
        },
        {
          contextFreeName: 'スマホ本体',
          displayName: 'スマホ本体',
          id: '7474288051',
        },
        {
          contextFreeName: 'moto g66y 5G',
          displayName: 'moto g66y 5G',
          id: '210339057051',
          ancestor: {
            contextFreeName: 'ワイモバイルラインナップ',
            displayName: 'ワイモバイルラインナップ',
            id: '8151631051',
            ancestor: {
              contextFreeName: 'ワイモバイル申込ガイド',
              displayName: 'ワイモバイル申込ガイド',
              id: '7058347051',
            },
          },
        },
        {
          contextFreeName: 'スマートフォン関連製品',
          displayName: 'スマートフォン関連製品',
          id: '8419041051',
        },
      ];
      const title = '【本体一括購入】Y!mobile moto g66y 5G【新規申込・シンプルS専用】 購入後申込必須 ※開通後発送';

      const result = CategoryNormalizer.selectBestCategory(nodes, title);
      expect(result.main).toBe('スマートフォン本体');
      expect(result.browseNodeId).toBe('2497181051');
    });

    it('should select "バイク用マウントステー・ホルダー" for motorcycle phone mount (B07Y28FJKM)', () => {
      const nodes: BrowseNode[] = [
        {
          contextFreeName: 'スマートフォン関連製品',
          displayName: 'スマートフォン関連製品',
          id: '8419041051',
          ancestor: {
            contextFreeName: 'Special Features Stores',
            displayName: 'Special Features Stores',
            id: '2678488051',
          },
        },
        {
          contextFreeName: 'バイク用時計・コンパス・温度計',
          displayName: 'バイク用時計・コンパス・温度計',
          id: '5303003051',
          salesRank: 34,
          ancestor: {
            contextFreeName: 'バイクアクセサリ',
            displayName: 'バイクアクセサリ',
            id: '2045223051',
          },
        },
      ];
      const title =
        'エスピーコネクト（SP CONNECT）バークランプマウント Pro SPC+｜バイク用スマホホルダー｜スマホマウント｜高強度CNCアルミ製｜ハンドルバークランプ取付｜53232';

      const result = CategoryNormalizer.selectBestCategory(nodes, title);
      expect(result.main).toBe('バイク用マウントステー・ホルダー');
      expect(result.browseNodeId).toBe('5303003051');
    });

    it('should select "microSDカード" for KIOXIA microSD card (B08PTPTMH5)', () => {
      const nodes: BrowseNode[] = [
        {
          contextFreeName: 'SDカード',
          displayName: 'SDカード',
          id: '8054241051',
        },
        {
          contextFreeName: 'microSDカード',
          displayName: 'microSDカード',
          id: '171386011',
        },
        {
          contextFreeName: 'メモリーカード',
          displayName: 'メモリーカード',
          id: '26157601051',
        },
        {
          contextFreeName: 'メモリーカードストア：スマホで使う microSDカード',
          displayName: 'メモリーカードストア：スマホで使う microSDカード',
          id: '4714074051',
        },
        {
          contextFreeName: 'パソコン ストア',
          displayName: 'パソコン ストア',
          id: '8182084051',
        },
        {
          contextFreeName: 'microSDカード',
          displayName: 'microSDカード',
          id: '203888214051',
        },
        {
          contextFreeName: 'Micro SDカード選び方ガイド',
          displayName: 'Micro SDカード選び方ガイド',
          id: '23320333051',
        },
        {
          contextFreeName: 'eero_Testpage',
          displayName: 'eero_Testpage',
          id: '213837823051',
        },
      ];
      const title =
        'KIOXIA(キオクシア) 旧東芝メモリ microSD 128GB UHS-I Class10 (最大読出速度100MB/s) Nintendo Switch動作確認済 国内サポート正規品 メーカー保証5年 KLMEA128G';

      const result = CategoryNormalizer.selectBestCategory(nodes, title);
      expect(result.main).toBe('microSDカード');
      expect(result.sub).not.toContain('ストア');
      expect(result.sub).not.toContain('ガイド');
      expect(result.browseNodeId).toBe('171386011');
    });

    it('should select "ノートパソコン用ドッキングステーション" for Logitec docking station (B0CQYKF6CM)', () => {
      const nodes: BrowseNode[] = [
        {
          contextFreeName: 'ELECOM エレコム - スマートフォン・携帯電話',
          displayName: 'ELECOM エレコム - スマートフォン・携帯電話',
          id: '3557094051',
          isRoot: false,
        },
        {
          contextFreeName: '家電 ストア',
          displayName: '家電 ストア',
          id: '8185003051',
          isRoot: false,
        },
        {
          contextFreeName: 'ノートパソコン用ドッキングステーション',
          displayName: 'ドッキングステーション',
          id: '2151884051',
          isRoot: false,
        },
      ];
      const title =
        'ロジテック USB Type-C ハブ ドッキングステーション 6-in-1 画面表示ON/OFFボタン付 USB PD 100W対応 USBA×2 4K60Hz HDMI×1 USB-C×1 SD＋microSDスロット LHB-PMP6U3S';

      const result = CategoryNormalizer.selectBestCategory(nodes, title);
      expect(result.main).toBe('ノートパソコン用ドッキングステーション');
      expect(result.browseNodeId).toBe('2151884051');
    });

    it('should select "PC用ゲームパッド" for Leadjoy game controller (B0GWJHDCBQ / B0H4QJ8N89)', () => {
      const nodes: BrowseNode[] = [
        {
          contextFreeName: 'CEROレーティングB',
          displayName: 'CEROレーティングB',
          id: '4752358051',
          isRoot: false,
        },
        {
          contextFreeName: 'ビデオゲーム',
          displayName: 'ビデオゲーム',
          id: '8185309051',
          isRoot: false,
        },
        {
          contextFreeName: 'すべてのゲーム',
          displayName: 'すべてのゲーム',
          id: '5364230051',
          isRoot: false,
        },
        {
          contextFreeName: '2014C-TAX Video Game',
          displayName: '2014C-TAX Video Game',
          id: '3050863051',
          isRoot: false,
        },
        {
          contextFreeName: 'PC用ゲームパッド',
          displayName: 'ゲームパッド',
          id: '2151971051',
          isRoot: false,
        },
      ];
      const title =
        'Leadjoy Saber Plus ゲームコントロー, 2.4G/Bluetooth/有線 対応 ポーリングレート 1000Hz TMR RGB ライト 10個マイクロスイッチボタン ホール 4個のカスタムボタン PS4/PC/Switch1&2/iOS/Android対応 ゲームパッド 黒';

      const result = CategoryNormalizer.selectBestCategory(nodes, title);
      expect(result.main).toBe('PC用ゲームパッド');
      expect(result.browseNodeId).toBe('2151971051');
    });
  });
});
