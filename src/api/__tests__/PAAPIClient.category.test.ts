
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
            '充電器・チャージャー [128191011]',
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
            'ドラッグストア', // Should be excluded based on user request "exclude EVERYTHING ending in store"
            'Androidアプリストア',
            'インターネット経由で動くパワフルなAI',
            'Home & Kitchen - AmazonGlobal Free Shipping',
            'Musical Instruments - AmazonGlobal free shipping',
            'Office Products - AmazonGlobal free shipping',
            'HQP用',
            'IsWhiteGloveRequired',
            'コーヒーの日 パーソナルコーヒーを楽しもう',
            '【介護施設で選ばれています】プラズマクラスター空気清浄機',
            '高評価ブランド：ホーム・キッチン V2',
            '毎日の料理をサポート　時短キッチングッズ',
            '【ペットとの暮らしに】プラズマクラスター空気清浄機',
            'KCAllBrand',
            '【子育てママに選ばれています】プラズマクラスター空気清浄機',
            '秋の味覚を楽しむ_キッチン用品・食器',
            '時短で便利、圧力鍋（カレー）',
            '人気の家電',
            '肌・髪のお悩み',
            '食品・飲料・お酒のみ',
            'マッサージャーほか健康家電',
            'シャープ 家電 全商品',
            'Arborist Merchandising Root',
            'DHC',
            '今旬コスメ',
            'プロテイン・サプリメント祭り | DHC',
            'らくらくベビー Birth Day企画',
            'おうちでヘアケアカーリングアイロン・2WAYアイロン',
            'Beauty Recommendation Widget',
            '対象のSALONIA製品購入でクーポンプレゼント',
            'Drugstore - Amazon Global',
            'Amazon Global',
            '※PBS用',
            '※カテゴリ',
            'チャイルドシート 1歳頃から',
            'チャイルドシート 新生児から',
            '除外Node(薬事)',
            'サンプリング除外Node3',
            '売れ筋ランキング',
            'オーディオランキング',
            '45~59型テレビ',
            '32型テレビ',
            '大型家具・家電おまかせサービス対象テレビ',
            'おまかせ設定',
            'メイ ク',
            'ファンデーション 21N',
            '4K モニター',
            'Panasonic-HA-HairDryers',
            'Wi-Fiルーター',
            'T-Fal-Cookware'
        ];

        invalidCategories.forEach(cat => {
            expect(clientAny.isValidCategoryNode(cat)).toBe(false);
        });

        const validCategories = [
            'ホーム＆キッチン',
            'キッチン用品',
            'コーヒー・ティー用品'
        ];

        validCategories.forEach(cat => {
            expect(clientAny.isValidCategoryNode(cat)).toBe(true);
        });
    });
});
