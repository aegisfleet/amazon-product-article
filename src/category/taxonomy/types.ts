/**
 * Taxonomy v2 Types
 */

export interface ChildCategoryDef {
  slug: string;
  name: string;
  criteria: string;
  legacy_names?: string[];
}

export interface ParentCategoryDef {
  slug: string;
  name: string;
  icon: string;
  priority: number;
  legacy_slugs?: string[];
  criteria: string;
  children: ChildCategoryDef[];
}

export interface TaxonomyV2 {
  version: number;
  updated_at: string;
  parents: ParentCategoryDef[];
}
