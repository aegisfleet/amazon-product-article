export interface CategoryGroup {
    name: string;
    slug: string;
    description?: string;
    visible?: boolean;
    priority?: number;
    children: string[];
}

export interface EnhancedCategoryGroup extends CategoryGroup {
    productCount: number;
    childrenWithCounts: Array<{
        name: string;
        productCount: number;
    }>;
    isVisible: boolean;
}
