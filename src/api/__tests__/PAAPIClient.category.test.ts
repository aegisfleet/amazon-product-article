
import { PAAPIClient } from '../PAAPIClient';

describe('PAAPIClient Category Extraction', () => {
    let client: PAAPIClient;

    beforeEach(() => {
        client = new PAAPIClient();
    });

    it('should filter out invalid category nodes including business pricing and promotions', () => {
        const clientAny = client as any;

        const invalidCategories = [
            '【5％以上OFF】ホーム&キッチン用品 法人価格 | Amazonビジネス',
            'Amazon.co.jp: Panasonic(パナソニック) の家電商品',
            'Amazon.co.jp: 家電',
            'PB_Home&Kitchen_9999',
            'AmazonGlobal',
            'Panasonic-HE/CE-Audio',
            'Testing/Slash',
            'モバイルバッテリー ホワイト',
            'Audio Interfaces',
            '充電器・チャージャー [128191011]', // []で除外
            'カテゴリー別',
            '10% OFF',
            'Prime Day セール',
            'SnS Engagement Test Grocery ASINs',
            'SnS May Promo Code Campaign Grocery',
            'Grocery_over2000_BFW24',
            'ホーム＆キッチン Winter Sale',
            '家電 ストア',
            'キッチン ストア',
            'ホームストア',
            'パソコン ストア',
            'ドラッグストア',
            'Androidアプリストア',
            'インターネット経由で動くパワフルなAI',
            'Home & Kitchen - AmazonGlobal Free Shipping',
            'Musical Instruments - AmazonGlobal free shipping',
            'Office Products - AmazonGlobal free shipping',
            'HQP用',
            'IsWhiteGloveRequired',
            'コーヒーの日 パーソナルコーヒーを楽しもう',
            '【介護施設で選ばれています】プラズマクラスター空気清浄機',
            '高評価ブランド：ホーム・キッチン V2', // スペースで除外
            '毎日の料理をサポート　時短キッチングッズ',
            '【ペットとの暮らしに】プラズマクラスター空気清浄機',
            'KCAllBrand',
            '【子育てママに選ばれています】プラズマクラスター空気清浄機',
            '秋の味覚を楽しむ_キッチン用品・食器', // _で除外
            '時短で便利、圧力鍋（カレー）', // 、と（）で除外
            '人気の家電',
            'マッサージャーほか健康家電',
            'シャープ 家電 全商品', // スペースで除外
            'Arborist Merchandising Root',
            'DHC',
            '今旬コスメ',
            'プロテイン・サプリメント祭り | DHC', // |で除外
            'らくらくベビー Birth Day企画', // スペースで除外
            'おうちでヘアケアカーリングアイロン・2WAYアイロン', // おうちでパターンで除外
            'Beauty Recommendation Widget',
            '対象のSALONIA製品購入でクーポンプレゼント',
            'Drugstore - Amazon Global',
            'Amazon Global',
            '※PBS用',
            '※カテゴリ',
            'チャイルドシート 1歳頃から', // スペースで除外
            'チャイルドシート 新生児から', // スペースで除外
            '除外Node(薬事)', // ()で除外
            'サンプリング除外Node3',
            '売れ筋ランキング',
            'オーディオランキング',
            '45~59型テレビ',
            '32型テレビ',
            '大型家具・家電おまかせサービス対象テレビ', // おまかせパターンで除外
            'おまかせ設定',
            'メイ ク', // スペースで除外
            'ファンデーション 21N', // スペースで除外
            '4K モニター', // スペースで除外
            'Panasonic-HA-HairDryers', // -で除外
            'PC | Accessories' // |で除外
        ];

        invalidCategories.forEach(cat => {
            expect(clientAny.isValidCategoryNode(cat)).toBe(false);
        });

        // 「・」を含むカテゴリは有効（除外リストから削除）
        const validCategories = [
            'パソコン',
            'マウス',
            'ドラッグ',
            'キッチン用品',
            'コーヒー・ティー用品',  // 「・」は有効
            '鍼・灸',              // 「・」は有効
            '家電・PC・周辺機器'     // 「・」は有効
        ];

        validCategories.forEach(cat => {
            expect(clientAny.isValidCategoryNode(cat)).toBe(true);
        });
    });
});
