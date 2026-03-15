import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fc from 'fast-check';
import { CategoryManager } from '../CategoryManager';
import { ProductCounter } from '../ProductCounter';
import type { CategoryGroup } from '../types';

describe('Integration Properties', () => {
  let tempDir: string;
  let contentDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-prop-test-'));
    contentDir = path.join(tempDir, 'content');
    if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir, { recursive: true });
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const clearDirs = () => {
    if (fs.existsSync(contentDir)) {
      fs.readdirSync(contentDir).forEach((file) => {
        fs.unlinkSync(path.join(contentDir, file));
      });
    }
  };

  // Feature: dynamic-category-control, Property 2: 商品数ゼロのカテゴリの非表示
  test('商品数ゼロのカテゴリの非表示', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record<CategoryGroup>({
            name: fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(s)),
            slug: fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(s)),
            children: fc.array(fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(s))),
          }),
        ),
        (categoryGroups) => {
          clearDirs();
          const manager = new CategoryManager('dummy.json');
          categoryGroups.forEach((group) => {
            manager.addCategoryGroup(group);
          });

          const counter = new ProductCounter(contentDir); // empty dir
          counter.countProductsByCategory();
          const enhanced = manager.enhanceCategoryGroups(counter);

          enhanced.forEach((group) => {
            expect(group.isVisible).toBe(false);
            expect(group.productCount).toBe(0);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: dynamic-category-control, Property 3: 商品追加・削除による表示状態の更新
  test('商品追加・削除による表示状態の更新', () => {
    fc.assert(
      fc.property(
        fc.record({
          categoryName: fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
          initialProductCount: fc.integer({ min: 0, max: 10 }),
          finalProductCount: fc.integer({ min: 0, max: 10 }),
        }),
        ({ categoryName, initialProductCount, finalProductCount }) => {
          clearDirs();

          const createProducts = (count: number) => {
            clearDirs();
            for (let i = 0; i < count; i++) {
              const content = `---\ncategories:\n  - "${categoryName}"\n---\n`;
              fs.writeFileSync(path.join(contentDir, `file_${i}.md`), content);
            }
          };

          const manager = new CategoryManager('dummy.json');
          manager.addCategoryGroup({
            name: categoryName,
            slug: 'test',
            children: [],
          });

          // Initial
          createProducts(initialProductCount);
          const initialCounter = new ProductCounter(contentDir);
          initialCounter.countProductsByCategory();
          const initialEnhanced = manager.enhanceCategoryGroups(initialCounter);

          expect(initialEnhanced.length).toBeGreaterThan(0);
          const initialVisible = initialEnhanced[0]?.isVisible;

          // Final
          createProducts(finalProductCount);
          const finalCounter = new ProductCounter(contentDir);
          finalCounter.countProductsByCategory();

          const finalManager = new CategoryManager('dummy.json');
          finalManager.addCategoryGroup({
            name: categoryName,
            slug: 'test',
            children: [],
          });
          const finalEnhanced = finalManager.enhanceCategoryGroups(finalCounter);

          expect(finalEnhanced.length).toBeGreaterThan(0);
          const finalVisible = finalEnhanced[0]?.isVisible;

          expect(initialVisible).toBe(initialProductCount > 0);
          expect(finalVisible).toBe(finalProductCount > 0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
