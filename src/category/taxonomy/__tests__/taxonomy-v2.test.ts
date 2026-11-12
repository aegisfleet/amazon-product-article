import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaxonomyV2 } from '../types';

describe('Taxonomy v2 Definition Validation', () => {
  const taxonomyPath = path.resolve(process.cwd(), 'data/taxonomy-v2.json');
  let taxonomy: TaxonomyV2;

  beforeAll(() => {
    expect(fs.existsSync(taxonomyPath)).toBe(true);
    const raw = fs.readFileSync(taxonomyPath, 'utf8');
    taxonomy = JSON.parse(raw);
  });

  test('should have valid version and parents array', () => {
    expect(taxonomy.version).toBe(2);
    expect(Array.isArray(taxonomy.parents)).toBe(true);
    expect(taxonomy.parents.length).toBe(27); // 26 + others
  });

  test('all parent names should be 14 characters or less (UI rule)', () => {
    for (const parent of taxonomy.parents) {
      expect(parent.name.length).toBeLessThanOrEqual(14);
    }
  });

  test('all child names should be 16 characters or less (card/pill UI rule)', () => {
    for (const parent of taxonomy.parents) {
      for (const child of parent.children) {
        expect(child.name.length).toBeLessThanOrEqual(16);
      }
    }
  });

  test('parent slugs must be unique', () => {
    const slugs = taxonomy.parents.map((p) => p.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  test('child slugs must be unique across all parents', () => {
    const childSlugs: string[] = [];
    for (const parent of taxonomy.parents) {
      for (const child of parent.children) {
        childSlugs.push(child.slug);
      }
    }
    const uniqueSlugs = new Set(childSlugs);
    expect(uniqueSlugs.size).toBe(childSlugs.length);
  });

  test('all parents and children must have non-empty criteria', () => {
    for (const parent of taxonomy.parents) {
      expect(parent.criteria?.trim().length).toBeGreaterThan(10);
      expect(parent.children.length).toBeGreaterThan(0);
      for (const child of parent.children) {
        expect(child.criteria?.trim().length).toBeGreaterThan(10);
      }
    }
  });

  test('each parent must have a fallback other child prefixed with zz-', () => {
    for (const parent of taxonomy.parents) {
      if (parent.slug === 'others') {
        continue;
      }
      const hasOther = parent.children.some((c) => c.slug.startsWith('zz-'));
      expect(hasOther).toBe(true);
    }
  });
});
