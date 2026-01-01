/**
 * Product data types for Amazon PA-API v5
 */

/**
 * 階層カテゴリ情報
 * PA-API BrowseNodesから抽出されたメイン/サブカテゴリを保持
 */
export interface CategoryInfo {
  main: string;          // メインカテゴリ（上位カテゴリ）
  sub?: string;          // サブカテゴリ（詳細カテゴリ）
  browseNodeId?: string; // PA-API BrowseNode ID（将来の拡張用）
}

export interface Product {
  asin: string;
  title: string;
  category: string;           // 後方互換性のため維持（メインカテゴリ）
  categoryInfo?: CategoryInfo; // 新規: 階層カテゴリ情報
  detailPageUrl?: string;     // Amazon DetailPageURL (affiliate link)
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
}

export interface ProductDetail extends Product {
  description?: string;
  features: string[];
  dimensions?: {
    height?: string;
    width?: string;
    length?: string;
    weight?: string;
  };
  manufacturer?: string;
  model?: string;
  // 新規追加フィールド（PA-API拡張）
  brand?: string;
  releaseDate?: string;
  isPrimeEligible?: boolean;
  availability?: string;
  externalIds?: {
    ean?: string;
    isbn?: string;
    upc?: string;
  };
  languages?: string[];
  contributors?: Array<{
    name: string;
    role: string;
  }>;
}

export interface ProductSearchParams {
  category: string;
  keywords: string[];
  maxResults: number;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'relevance' | 'price' | 'rating' | 'featured' | 'newest';
}

export interface ProductSearchResult {
  products: Product[];
  totalResults: number;
  searchParams: ProductSearchParams;
  timestamp: Date;
}