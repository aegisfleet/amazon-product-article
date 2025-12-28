/**
 * GitHub types for publisher and auto-merge functionality
 */

export interface PullRequest {
    number: number;
    title: string;
    body: string;
    head: string;
    base: string;
    author: string;
    state: 'open' | 'closed' | 'merged';
    draft: boolean;
    createdAt: Date;
    updatedAt: Date;
    labels: string[];
    changedFiles: string[];
}

export interface MergeDecision {
    shouldMerge: boolean;
    reason: string;
    validationResults: ValidationResult[];
    pathCheck: boolean;
    authorCheck: boolean;
}

export interface ValidationResult {
    check: string;
    passed: boolean;
    message: string;
}

export interface MergeConditions {
    allowedPaths: string[];
    requiredAuthor: string;
    requiredChecks: string[];
    excludedPaths: string[];
}

export interface MergeResult {
    success: boolean;
    prNumber: number;
    mergedAt?: Date;
    sha?: string;
    error?: string;
}

export interface CommitOptions {
    branch: string;
    message: string;
    author?: {
        name: string;
        email: string;
    };
}

export interface ArticleCommit {
    path: string;
    content: string;
    message: string;
    sha?: string;
}

export interface DeploymentStatus {
    status: 'pending' | 'in_progress' | 'success' | 'failure';
    environment: string;
    url?: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface SiteIndex {
    articles: ArticleIndexEntry[];
    categories: CategoryIndexEntry[];
    lastUpdated: Date;
}

export interface ArticleIndexEntry {
    path: string;
    title: string;
    description: string;
    category: string;
    asin: string;
    publishDate: Date;
}

export interface CategoryIndexEntry {
    name: string;
    slug: string;
    count: number;
    subcategories?: CategoryIndexEntry[];
}

export interface GitHubConfig {
    owner: string;
    repo: string;
    branch: string;
    token?: string;
}

export const DEFAULT_MERGE_CONDITIONS: MergeConditions = {
    allowedPaths: ['data/'],
    requiredAuthor: 'jules[bot]',
    requiredChecks: ['quality-check', 'format-validation'],
    excludedPaths: ['.github/', 'config/', '_config.yml', 'src/']
};
