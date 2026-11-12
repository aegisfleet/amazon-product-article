import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getProductCategory,
  loadProductCategories,
  type ProductCategoryMap,
  saveProductCategories,
  setProductCategory,
} from '../ProductCategoryStore';

describe('ProductCategoryStore', () => {
  const tmpDir = path.resolve(process.cwd(), 'tmp/test-category-store');
  const tmpFile = path.join(tmpDir, 'test-product-categories.json');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return empty object if file does not exist', () => {
    const res = loadProductCategories(path.join(tmpDir, 'non-existent.json'));
    expect(res).toEqual({});
  });

  it('should save and load product categories in compact 1-line-per-entry format', () => {
    const data: ProductCategoryMap = {
      B000TEST02: {
        taxonomy_version: 2,
        category_parent: 'kitchen',
        category_child: 'pots-pans',
        amazon_category: 'フライパン',
        classification: {
          source: 'gemini-decision-1',
          parent_confidence: 0.99,
          child_confidence: 0.95,
          classified_at: '2026-11-12T00:00:00.000Z',
          input_hash: 'abc123',
          needs_review: false,
        },
      },
      B000TEST01: {
        taxonomy_version: 2,
        category_parent: 'audio-equipment',
        category_child: 'speakers',
      },
    };

    saveProductCategories(data, tmpFile);

    expect(fs.existsSync(tmpFile)).toBe(true);
    const content = fs.readFileSync(tmpFile, 'utf8');
    const lines = content.trim().split('\n');
    // Lines: {, B000TEST01 (sorted), B000TEST02, }
    expect(lines.length).toBe(4);
    expect(lines[0]).toBe('{');
    expect(lines[1]).toContain('"B000TEST01":');
    expect(lines[2]).toContain('"B000TEST02":');
    expect(lines[3]).toBe('}');

    const loaded = loadProductCategories(tmpFile);
    expect(loaded.B000TEST01?.category_parent).toBe('audio-equipment');
    expect(loaded.B000TEST02?.category_child).toBe('pots-pans');
  });

  it('should get and set category entries properly', () => {
    const map: ProductCategoryMap = {};
    setProductCategory(
      'B000TEST99',
      {
        taxonomy_version: 2,
        category_parent: 'smartphone-tablet',
        category_child: 'e-readers',
      },
      map,
    );

    const entry = getProductCategory('B000TEST99', map);
    expect(entry?.category_parent).toBe('smartphone-tablet');
    expect(entry?.category_child).toBe('e-readers');
  });
});
