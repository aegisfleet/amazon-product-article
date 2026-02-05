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

        // Traverse up the tree to find the first valid category
        let currentNode: BrowseNode | undefined = node;

        while (currentNode) {
            if (CategoryNormalizer.isValidCategoryName(currentNode.displayName)) {
                // Found a valid category
                // For sub-category, we try to use the original node's name if valid, 
                // otherwise the same as main
                const sub = CategoryNormalizer.isValidCategoryName(node.displayName)
                    ? node.displayName
                    : currentNode.displayName;

                return {
                    main: CategoryNormalizer.sanitizeCategoryName(currentNode.displayName),
                    sub: CategoryNormalizer.sanitizeCategoryName(sub)
                };
            }

            currentNode = currentNode.ancestor;
        }

        // If no valid category found in the tree, fallback to Other
        return {
            main: 'その他',
            sub: CategoryNormalizer.sanitizeCategoryName(node.displayName)
        };
    }

    /**
     * Check if a category name is valid (legacy logic from PAAPIClient)
     */
    private static isValidCategoryName(name: string): boolean {
        if (!name) return false;

        const invalidPatterns = [
            /Amazon/i,
            /ストア$|Store$/i, // Ends with Store
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

        // Check for specific nonsense categories reported
        const blockList = [
            "Arborist Merchandising Root",
            "Babel 6-2",
            "Calendar Test",
            "HPC Recommendation Widget",
            "Test",
            "テスト",
            "面だし用ASIN"
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
