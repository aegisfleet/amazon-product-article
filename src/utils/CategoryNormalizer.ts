import { CreatorsAPIBrowseNode } from '../types/CreatorsAPITypes';

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
            const displayName = currentNode.displayName || currentNode.DisplayName;
            const valid = displayName ? CategoryNormalizer.isValidCategoryName(displayName) : false;


            if (displayName && valid) {
                validNames.push(CategoryNormalizer.sanitizeCategoryName(displayName));
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
                'ボードゲーム', 'アナログゲーム', 'カードゲーム',
                'おもちゃ', 'ホビー', 'フィギュア', 'プラモデル',
                '画材', '文房具', '絵具', 'オフィス用品',
                'チャイルドシート', 'ジュニアシート', 'ベビーカー', '抱っこ紐',
                'おむつ', '紙おむつ', 'ベビーおむつ'
            ];

            if (preferredKeywords.some(k => main.includes(k) || sub.includes(k))) {
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
            score: -1
        };
    }

    /**
     * Check if a category name is valid (legacy logic from PAAPIClient)
     */
    public static isValidCategoryName(name: string): boolean {
        if (!name) return false;

        const invalidPatterns = [
            /Amazon/i,
            /Sale|Off|Coupon|Ranking|Best|Week|Fair|Event|Campaign/i,
            /セール|オフ(?!ィス)|クーポン|ランキング|おすすめ|ウィーク|フェア|イベント|キャンペーン|企画|向け|ほか$|など$|新商品|すべて$|・.*・|特設ページ|発売日お届け|父の日|割引|お買い得|利用シーン|あわせ買い|全商品$|関連製品$|新製品$/,
            /特集/,
            /新着/,
            /新規発売/,
            /予約/,
            /限定/,
            /recommendation/i,
            /eligible/i,
            /widget/i,
            /smartphones/i,
            /^All /i,
            /^Prime /i,
            /[【】|()_※]/,
            /^家電$/,
            /^アクセサリ$/,
            /^アクセサリー$/,
            // Block UUID-like patterns often used for internal nodes
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
        ];

        // Specific whitelist for valid multi-dot categories
        const allowedMultiDot = [
            "磁気・チタン・ゲルマニウムアクセサリー",
            "周辺機器・アクセサリ",
            "キーボード・マウス・入力機器",
            "体重・体脂肪・体組成計"
        ];
        if (allowedMultiDot.some(allowed => name.includes(allowed))) {
            return true;
        }

        if (invalidPatterns.some(pattern => {
            if (pattern.test(name)) {
                // console.log(`Category rejected by pattern ${pattern}: ${name}`);
                // require('fs').appendFileSync('debug_rejections.log', `[PATTERN] ${name} matched ${pattern}\n`);
                return true;
            }
            return false;
        })) {
            return false;
        }

        // Check for generic "Store" suffix
        // User requested to exclude categories ending with "Store" (e.g., Drugstore)
        const genericStorePatterns = [
            /ストア$|Store$/i,
        ];
        // const allowedStoreExceptions = [
        //     "ドラッグストア",
        //     "ペット用品ストア",
        //     "ビューティーストア",
        //     "食品ストア",
        //     "飲料ストア",
        //     "お酒ストア"
        // ];

        if (genericStorePatterns.some(pattern => pattern.test(name))) {
            // console.log(`Category rejected by Store pattern: ${name}`);
            return false;
            // }
        }

        // Check for specific nonsense categories reported
        const blockList = [
            "Arborist Merchandising Root",
            "Babel 6-2",
            "Calendar Test",
            "Test",
            "テスト",
            "面だし用ASIN",
            "Hair Care",
            "HPC recommendation widget",
            "PBHome&Kitchen9999",
            "Panasonic-HA-HotAirStylers",
            "UMall",
            "SnS Acquisition Test HPC ASINs",
            "シャープの家電がお買い得",
            "ジュニアシート 3歳頃から",
            "チャイルドシート 1歳頃から",
            "チャイルドシート 新生児から",
            "カテゴリー別",
            "卒園式・入学式の撮影テクニック",
            "yobi",
            "P&G",
            "定期おトク便",
            "介護用品・生理用品",
            "花王",
            "Panasonic-HA-PersonalCare",
            "Panasonic-HA-HotAirStylers",
            "Panasonic-HA-HairDryers",
            "Panasonic Beauty",
            "TWINBIRD",
            "Panasonic ヘアケア",
            "パナソニック ヘアケア",
            "パナソニック ヘアードライヤー",
            "おうちでヘアケア",
            "アウトドア用品",
            "スポーツ＆アウトドア",
            "Sports & Outdoors",
            "日用品・生活必需品：おもちゃ",
            "和書（アダルト除く）",
            "Featured Categories",
            "OMRON（オムロン）",
            "電池利用商品",
            "IO DATA",
            "Logicool",
            "CASIO",
            "Lenovo",
            "HPC_CreatorInfoHub",
            "Drugstore - AmazonGlobal",
            "PB_Home&Kitchen",
            "新生活ギフト",
            "YA-MAN",
            "others",
            "PB_Beauty",
            "パントリー",
            "対象ASIN",
            "面出し用ASIN",
            "Internal",
            "サンワサプライ",
            "PB_PC",
            "ベビー＆マタニティ",
            "ホーム＆キッチン",
            "食品・飲料・お酒",
            "服＆ファッション小物",
            "Beauty Store",
            "介護用品・生理用品",
            "花王",
            "Diapers",
            "シャープ",
            "Special Features Stores",
            "Self Service"
        ];

        if (blockList.some(block => {
            if (name.toLowerCase().includes(block.toLowerCase())) {
                // console.log(`Category rejected by blocklist '${block}': ${name}`);
                // require('fs').appendFileSync('debug_rejections.log', `[BLOCKLIST] ${name} matched ${block}\n`);
                return true;
            }
            return false;
        })) {
            return false;
        }

        return true;
    }

    private static sanitizeCategoryName(name: string): string {
        // Remove special characters sometimes found in browse nodes
        return name.replace(/[【】|()_※]/g, '').trim();
    }
}
