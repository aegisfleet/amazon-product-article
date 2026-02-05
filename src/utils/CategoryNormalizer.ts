export interface BrowseNode {
    id: string;
    displayName: string;
    contextFreeName?: string;
    ancestor?: BrowseNode;
    salesRank?: number;
}

export interface NormalizedCategory {
    main: string;
    sub: string;
}

export class CategoryNormalizer {
    /**
     * Normalize a BrowseNode into a category
     * Policy: Use the Amazon category as is, but filter out inappropriate ones.
     */
    public static normalize(node?: BrowseNode): NormalizedCategory {
        if (!node) {
            return { main: 'その他', sub: 'Unknown' };
        }

        // Collect all valid display names up the tree
        const validNames: string[] = [];
        let currentNode: any = node;

        while (currentNode) {
            const displayName = currentNode.displayName || currentNode.DisplayName;
            if (displayName && CategoryNormalizer.isValidCategoryName(displayName)) {
                validNames.push(CategoryNormalizer.sanitizeCategoryName(displayName));
            }
            currentNode = currentNode.ancestor || currentNode.Ancestor;
        }

        if (validNames.length > 0) {
            // main is the broadest (last in the list if collected from leaf up)
            // sub is the most specific (first in the list)
            const main = validNames[validNames.length - 1]!;
            const sub = validNames.length > 1 ? validNames[0]! : '一般';

            return { main, sub };
        }

        // If no valid category found in the tree, fallback to Other
        const fallbackName = (node as any).displayName || (node as any).DisplayName || 'Unknown';
        return {
            main: 'その他',
            sub: CategoryNormalizer.sanitizeCategoryName(fallbackName)
        };
    }

    /**
     * Check if a category name is valid (legacy logic from PAAPIClient)
     */
    private static isValidCategoryName(name: string): boolean {
        if (!name) return false;

        const invalidPatterns = [
            /Amazon/i,
            /Sale|Off|Coupon|Ranking|Best|Week|Fair|Event|Campaign/i,
            /セール|オフ|クーポン|ランキング|おすすめ|ウィーク|フェア|イベント|キャンペーン/,
            /特集/,
            /新着/,
            /予約/,
            /限定/,
            /^All /i,
            /^Prime /i
        ];

        if (invalidPatterns.some(pattern => pattern.test(name))) {
            return false;
        }

        // Specifically block "Store" or "ストア" only if it's a generic campaign/ranking store
        // but ALLOW "ドラッグストア", "ペット用品ストア" etc.
        const genericStorePatterns = [
            /ストア$|Store$/i,
        ];
        const allowedStoreExceptions = [
            "ドラッグストア",
            "ペット用品ストア",
            "ビューティーストア",
            "食品ストア",
            "飲料ストア",
            "お酒ストア"
        ];

        if (genericStorePatterns.some(pattern => pattern.test(name))) {
            if (!allowedStoreExceptions.some(exception => name.includes(exception))) {
                return false;
            }
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
            "卒園式・入学式の撮影テクニック"
        ];

        if (blockList.some(block => name.includes(block))) {
            return false;
        }

        return true;
    }

    private static sanitizeCategoryName(name: string): string {
        // Remove special characters sometimes found in browse nodes
        return name.replace(/[【】|()_※]/g, '').trim();
    }
}
