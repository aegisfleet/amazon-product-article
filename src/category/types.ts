export interface CategoryGroup {
  name: string;
  slug: string;
  description?: string | undefined;
  visible?: boolean | undefined;
  priority?: number | undefined;
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
