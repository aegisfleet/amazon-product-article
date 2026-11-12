import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaxonomyV2 } from './types';

const DEFAULT_TAXONOMY_PATH = path.resolve(process.cwd(), 'data/taxonomy-v2.json');

/**
 * taxonomy-v2.json の slug から日本語表示名を引くためのルックアップ。
 */
export class TaxonomyLookup {
  private readonly parentNames = new Map<string, string>();
  private readonly childNames = new Map<string, string>();

  constructor(taxonomy: TaxonomyV2) {
    for (const parent of taxonomy.parents) {
      this.parentNames.set(parent.slug, parent.name);
      for (const child of parent.children) {
        this.childNames.set(child.slug, child.name);
      }
    }
  }

  static load(taxonomyPath: string = DEFAULT_TAXONOMY_PATH): TaxonomyLookup {
    if (!fs.existsSync(taxonomyPath)) {
      return new TaxonomyLookup({ version: 2, updated_at: '', parents: [] });
    }
    const raw = fs.readFileSync(taxonomyPath, 'utf8');
    return new TaxonomyLookup(JSON.parse(raw) as TaxonomyV2);
  }

  getParentName(slug: string): string | undefined {
    return this.parentNames.get(slug);
  }

  getChildName(slug: string): string | undefined {
    return this.childNames.get(slug);
  }
}
