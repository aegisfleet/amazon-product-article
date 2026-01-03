
import { PAAPIClient } from '../PAAPIClient';

describe('PAAPIClient Category Extraction', () => {
    let client: PAAPIClient;
    let clientAny: any;

    beforeEach(() => {
        client = new PAAPIClient();
        clientAny = client as any;
    });

    // 除外されるべきカテゴリのテスト
    describe('should exclude invalid categories', () => {
        const invalidCategories: Array<{ category: string; reason: string }> = [
            // 特殊文字による除外
            { category: '【5％以上OFF】ホーム&キッチン用品 法人価格 | Amazonビジネス', reason: '【】と|を含む' },
            { category: 'Amazon.co.jp: Panasonic(パナソニック) の家電商品', reason: '()とスペースを含む' },
            { category: 'Amazon.co.jp: 家電', reason: 'Amazonパターン' },
            { category: 'PB_Home&Kitchen_9999', reason: '_を含む' },
            { category: 'AmazonGlobal', reason: 'Amazonパターン' },
            { category: 'Panasonic-HE/CE-Audio', reason: '-と/を含む' },
            { category: 'Testing/Slash', reason: '/を含む' },
            { category: 'モバイルバッテリー ホワイト', reason: 'スペースとホワイトパターン' },
            { category: 'Audio Interfaces', reason: 'Audio Interfacesパターン' },
            { category: '充電器・チャージャー [128191011]', reason: '[]を含む' },
            { category: 'カテゴリー別', reason: 'カテゴリー別パターン' },
            { category: '10% OFF', reason: 'OFFパターン' },
            { category: 'Prime Day セール', reason: 'スペースとセールパターン' },
            { category: 'ホーム＆キッチン Winter Sale', reason: '＆とスペースを含む' },

            // ストア関連
            { category: '家電 ストア', reason: 'スペースを含む' },
            { category: 'キッチン ストア', reason: 'スペースを含む' },
            { category: 'ホームストア', reason: 'ストアパターン' },
            { category: 'パソコン ストア', reason: 'スペースを含む' },
            { category: 'ドラッグストア', reason: 'ストアパターン' },
            { category: 'Androidアプリストア', reason: 'ストアパターン' },

            // システム・内部管理用
            { category: 'SnS Engagement Test Grocery ASINs', reason: 'SnSパターン' },
            { category: 'SnS May Promo Code Campaign Grocery', reason: 'SnSパターン' },
            { category: 'Grocery_over2000_BFW24', reason: '_を含む' },
            { category: 'HQP用', reason: 'HQPパターン' },
            { category: 'IsWhiteGloveRequired', reason: 'IsWhiteGloveRequiredパターン' },
            { category: 'KCAllBrand', reason: 'KCAllBrandパターン' },
            { category: 'Arborist Merchandising Root', reason: 'Arboristパターン' },
            { category: 'サンプリング除外Node3', reason: '除外パターン' },

            // プロモーション
            { category: 'コーヒーの日 パーソナルコーヒーを楽しもう', reason: 'スペースを含む' },
            { category: '【介護施設で選ばれています】プラズマクラスター空気清浄機', reason: '【】を含む' },
            { category: '高評価ブランド：ホーム・キッチン V2', reason: 'スペースと高評価ブランドパターン' },
            { category: '毎日の料理をサポート　時短キッチングッズ', reason: '全角スペースを含む' },
            { category: '【ペットとの暮らしに】プラズマクラスター空気清浄機', reason: '【】を含む' },
            { category: '【子育てママに選ばれています】プラズマクラスター空気清浄機', reason: '【】を含む' },
            { category: '秋の味覚を楽しむ_キッチン用品・食器', reason: '_を含む' },
            { category: '時短で便利、圧力鍋（カレー）', reason: '、と（）を含む' },
            { category: '人気の家電', reason: '人気の家電パターン' },
            { category: 'インターネット経由で動くパワフルなAI', reason: 'インターネット経由パターン' },

            // ブランド専用ページ
            { category: 'マッサージャーほか健康家電', reason: 'マッサージャーほか健康家電パターン' },
            { category: 'シャープ 家電 全商品', reason: 'シャープとスペース' },
            { category: 'DHC', reason: 'DHCパターン' },
            { category: '今旬コスメ', reason: '今旬コスメパターン' },
            { category: 'プロテイン・サプリメント祭り | DHC', reason: '|とDHCパターン' },
            { category: 'らくらくベビー Birth Day企画', reason: 'スペースと企画パターン' },
            { category: 'おうちでヘアケアカーリングアイロン・2WAYアイロン', reason: 'おうちでパターン' },
            { category: 'Beauty Recommendation Widget', reason: 'Beauty Recommendationパターン' },
            { category: '対象のSALONIA製品購入でクーポンプレゼント', reason: 'クーポンパターン' },

            // AmazonGlobal
            { category: 'Home & Kitchen - AmazonGlobal Free Shipping', reason: 'スペースと-を含む' },
            { category: 'Musical Instruments - AmazonGlobal free shipping', reason: 'スペースと-を含む' },
            { category: 'Office Products - AmazonGlobal free shipping', reason: 'スペースと-を含む' },
            { category: 'Drugstore - Amazon Global', reason: '-とスペースを含む' },
            { category: 'Amazon Global', reason: 'スペースとAmazonパターン' },

            // その他
            { category: '※PBS用', reason: '※を含む' },
            { category: '※カテゴリ', reason: '※を含む' },
            { category: 'チャイルドシート 1歳頃から', reason: 'スペースと頃からパターン' },
            { category: 'チャイルドシート 新生児から', reason: 'スペースと新生児からパターン' },
            { category: '除外Node(薬事)', reason: '()と除外パターン' },
            { category: '売れ筋ランキング', reason: 'ランキングパターン' },
            { category: 'オーディオランキング', reason: 'ランキングパターン' },
            { category: '45~59型テレビ', reason: '型テレビパターン' },
            { category: '32型テレビ', reason: '型テレビパターン' },
            { category: '大型家具・家電おまかせサービス対象テレビ', reason: 'おまかせパターン' },
            { category: 'おまかせ設定', reason: 'おまかせパターン' },
            { category: 'メイ ク', reason: 'スペースを含む' },
            { category: 'ファンデーション 21N', reason: 'スペースを含む' },
            { category: '4K モニター', reason: 'スペースを含む' },
            { category: 'Panasonic-HA-HairDryers', reason: '-を含む' },
            { category: 'PC | Accessories', reason: '|とスペースを含む' }
        ];

        test.each(invalidCategories)(
            '除外: "$category" ($reason)',
            ({ category }) => {
                expect(clientAny.isValidCategoryNode(category)).toBe(false);
            }
        );
    });

    // 有効なカテゴリのテスト
    describe('should accept valid categories', () => {
        const validCategories: Array<{ category: string; reason: string }> = [
            { category: 'パソコン', reason: '通常のカテゴリ' },
            { category: 'マウス', reason: '通常のカテゴリ' },
            { category: 'ドラッグ', reason: '通常のカテゴリ（ストアではない）' },
            { category: 'キッチン用品', reason: '通常のカテゴリ' },
            { category: 'コーヒー・ティー用品', reason: '「・」は有効' },
            { category: '鍼・灸', reason: '「・」は有効' },
            { category: '家電・PC・周辺機器', reason: '「・」は有効' },
            { category: '無線・有線LANルーター', reason: '「・」は有効' },
            { category: '無線・有線LAN中継器', reason: '「・」は有効' }
        ];

        test.each(validCategories)(
            '有効: "$category" ($reason)',
            ({ category }) => {
                expect(clientAny.isValidCategoryNode(category)).toBe(true);
            }
        );
    });

    // SalesRank優先ロジックのテスト
    describe('extractCategoryInfo with SalesRank priority', () => {
        test('should prioritize node with SalesRank over first valid node', () => {
            // Wi-Fiルーターの実際のPA-APIレスポンスを模したテストデータ
            const mockItem = {
                ASIN: 'B0F5B58YV8',
                DetailPageURL: 'https://example.com',
                BrowseNodeInfo: {
                    BrowseNodes: [
                        { Id: '214332128051', DisplayName: '家電・PC・周辺機器', ContextFreeName: '家電・PC・周辺機器' },
                        { Id: '207342683051', DisplayName: 'Wi-Fiルーター', ContextFreeName: 'Wi-Fiルーター' },
                        { Id: '2151996051', DisplayName: '無線・有線LANルーター', ContextFreeName: '無線・有線LANルーター', SalesRank: 1 }
                    ]
                }
            };

            const result = clientAny.extractCategoryInfo(mockItem);

            // SalesRankを持つノードがメインカテゴリになるべき
            expect(result.main).toBe('無線・有線LANルーター');
            expect(result.browseNodeId).toBe('2151996051');
        });

        test('should use first valid node as sub when SalesRank node is main', () => {
            const mockItem = {
                ASIN: 'B0D2NXKK3X',
                DetailPageURL: 'https://example.com',
                BrowseNodeInfo: {
                    BrowseNodes: [
                        { Id: '214332128051', DisplayName: '家電・PC・周辺機器', ContextFreeName: '家電・PC・周辺機器' },
                        { Id: '5334402051', DisplayName: '無線・有線LAN中継器', ContextFreeName: '無線・有線LAN中継器', SalesRank: 1 }
                    ]
                }
            };

            const result = clientAny.extractCategoryInfo(mockItem);

            expect(result.main).toBe('無線・有線LAN中継器');
            expect(result.sub).toBe('家電・PC・周辺機器');
        });

        test('should fall back to first valid node if no SalesRank exists', () => {
            const mockItem = {
                ASIN: 'TEST123',
                DetailPageURL: 'https://example.com',
                BrowseNodeInfo: {
                    BrowseNodes: [
                        { Id: '1', DisplayName: 'カテゴリA', ContextFreeName: 'カテゴリA' },
                        { Id: '2', DisplayName: 'カテゴリB', ContextFreeName: 'カテゴリB' }
                    ]
                }
            };

            const result = clientAny.extractCategoryInfo(mockItem);

            // フォールバック: 最初の有効なノードを使用
            expect(result.main).toBe('カテゴリA');
            expect(result.sub).toBe('カテゴリB');
        });
    });
});
