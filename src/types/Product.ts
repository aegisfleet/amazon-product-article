/**
 * Product data types for Amazon Creators API v1
 */

/**
 * 階層カテゴリ情報
 * Creators API BrowseNodesから抽出されたメイン/サブカテゴリを保持
 */
export interface CategoryInfo {
  main: string; // メインカテゴリ（上位カテゴリ）
  sub?: string | undefined; // サブカテゴリ（詳細カテゴリ）
  browseNodeId?: string | undefined; // Creators API BrowseNode ID（将来の拡張用）
}

export interface Product {
  asin: string;
  title: string;
  category: string; // 後方互換性のため維持（メインカテゴリ）
  categoryInfo?: CategoryInfo; // 新規: 階層カテゴリ情報
  parentAsin?: string | undefined; // 親ASIN（バリエーション商品の識引用）
  detailPageUrl?: string | undefined; // Amazon DetailPageURL (affiliate link)
  price: {
    amount: number;
    currency: string;
    formatted: string;
  };
  images: {
    primary: string;
    thumbnails: string[];
  };
  specifications: Record<string, string>;
  rating: {
    average: number;
    count: number;
  };

  isAmazonDirect?: boolean | undefined;
  isAmazonHaul?: boolean | undefined;
  isFurusato?: boolean | undefined;
  municipality?: string | undefined;
  availability?: string | undefined;
  brand?: string | undefined;
  loyaltyPoints?: number | undefined;
  dealBadge?: string | undefined;
  dealAccessType?: string | undefined;
  savingsPercentage?: number | undefined;
}

export interface ProductDetail extends Product {
  description?: string | undefined;
  features: string[];
  dimensions?:
    | {
        height?: string | undefined;
        width?: string | undefined;
        length?: string | undefined;
        weight?: string | undefined;
      }
    | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  // 新規追加フィールド（Creators API拡張）
  releaseDate?: string | undefined;
  externalIds?:
    | {
        ean?: string | undefined;
        isbn?: string | undefined;
        upc?: string | undefined;
      }
    | undefined;
  languages?: string[];
  contributors?: Array<{
    name: string;
    role: string;
  }>;
}

export interface ProductSearchParams {
  category: string;
  searchIndex?: string;
  keywords: string[];
  maxResults: number;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'relevance' | 'price' | 'rating' | 'featured' | 'newest';
  merchant?: 'Amazon' | 'All';
  ignoreExclusion?: boolean;
  itemPage?: number;
}

export interface ProductSearchResult {
  products: Product[];
  totalResults: number;
  searchParams: ProductSearchParams;
  timestamp: Date;
}
