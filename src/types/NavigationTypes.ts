/**
 * Navigation types for site navigation and filtering
 */

import { ArticleMetadata } from '../article/ArticleGenerator';

export interface Category {
    id: string;
    name: string;
    description: string;
    subcategories: Category[];
    articleCount: number;
    featuredProducts: string[];
}

export interface CategoryIndex {
    categories: Category[];
    totalArticles: number;
    lastUpdated: Date;
    featuredArticles: ArticleMetadata[];
}

export interface FilterInterface {
    categories: CategoryFilter[];
    manufacturers: ManufacturerFilter[];
    priceRanges: PriceRangeFilter[];
    ratings: RatingFilter[];
    keywords: KeywordFilter;
}

export interface CategoryFilter {
    category: string;
    count: number;
    subcategories: SubcategoryFilter[];
}

export interface SubcategoryFilter {
    name: string;
    count: number;
}

export interface ManufacturerFilter {
    name: string;
    count: number;
    categories: string[];
}

export interface PriceRangeFilter {
    range: string;
    min: number;
    max: number;
    count: number;
}

export interface RatingFilter {
    stars: number;
    count: number;
}

export interface KeywordFilter {
    popular: string[];
    recent: string[];
}

export interface NavigationMenuItem {
    id: string;
    label: string;
    url: string;
    children?: NavigationMenuItem[];
    isActive?: boolean;
    badge?: string;
}

export interface Breadcrumb {
    label: string;
    url: string;
}

export interface FilterParams {
    category?: string;
    subcategory?: string;
    manufacturer?: string;
    priceRange?: string;
    minRating?: number;
    keywords?: string[];
    sortBy?: 'date' | 'rating' | 'price';
    sortOrder?: 'asc' | 'desc';
}

export interface FilterResult {
    articles: ArticleMetadata[];
    totalCount: number;
    appliedFilters: FilterParams;
    availableFilters: FilterInterface;
}
