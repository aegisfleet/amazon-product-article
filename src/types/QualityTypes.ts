/**
 * Quality management types for article validation
 */

export interface QualityScore {
    overall: number;
    completeness: number;
    structure: number;
    readability: number;
    seoOptimization: number;
    issues: QualityIssue[];
}

export interface QualityIssue {
    type: 'error' | 'warning' | 'info';
    category: 'structure' | 'content' | 'seo' | 'style' | 'compliance';
    message: string;
    location?: string;
    suggestion?: string;
}

export interface ValidationResult {
    isValid: boolean;
    score: QualityScore;
    errors: QualityIssue[];
    warnings: QualityIssue[];
    suggestions: QualityIssue[];
}

export interface StyleRule {
    rule: string;
    description: string;
    example?: string;
    validator?: (content: string) => boolean;
}

export interface ContentRequirements {
    minWordCount: number;
    maxWordCount?: number;
    requiredSections: string[];
    requiredElements: string[];
    styleGuidelines: StyleRule[];
}

export interface TemplateSection {
    title: string;
    minWordCount: number;
    maxWordCount?: number;
    requiredElements: string[];
    structure: string;
}

export interface QualityPromptConfig {
    productName: string;
    sectionRequirements: Record<string, TemplateSection>;
    qualityRequirements: ContentRequirements;
    targetAudience: string;
    tone: 'formal' | 'casual' | 'professional';
}
