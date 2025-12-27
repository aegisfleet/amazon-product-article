/**
 * Product data types for Amazon PA-API v5
 */

export interface Product {
  asin: string;
  title: string;
  category: string;
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
  availability: string;
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
}

export interface ProductSearchParams {
  category: string;
  keywords: string[];
  maxResults: number;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'relevance' | 'price' | 'rating';
}

export interface ProductSearchResult {
  products: Product[];
  totalResults: number;
  searchParams: ProductSearchParams;
  timestamp: Date;
}