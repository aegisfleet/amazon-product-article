import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fc from 'fast-check';
import * as yaml from 'js-yaml';
import { ProductCounter } from '../ProductCounter';

describe('ProductCounter Properties', () => {
  // Feature: dynamic-category-control, Property 7: 商品数カウントの正確性
  test('商品数カウントの正確性', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            categories: fc.array(
              fc.string({ minLength: 1 }).filter((s) => !s.includes('"') && !s.includes('\n') && !s.includes(':')),
              { minLength: 1 },
            ),
          }),
          { maxLength: 50 },
        ),
        (products) => {
          const runTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-counter-prop-run-'));
          try {
            let fileIndex = 0;
            const expectedCounts = new Map<string, number>();

            for (const product of products) {
              const normalizedCategories = Array.from(
                new Set(product.categories.map((c) => c.trim()).filter((c) => c.length > 0)),
              );

              if (normalizedCategories.length === 0) continue;

              const frontMatter = yaml.dump({ categories: product.categories });
              const content = `---\n${frontMatter}---\ncontent`;
              fs.writeFileSync(path.join(runTempDir, `product_${fileIndex++}.md`), content);

              for (const category of normalizedCategories) {
                expectedCounts.set(category, (expectedCounts.get(category) || 0) + 1);
              }
            }

            const counter = new ProductCounter(runTempDir);
            counter.countProductsByCategory();

            expectedCounts.forEach((count, category) => {
              expect(counter.getProductCount(category)).toBe(count);
            });
          } finally {
            if (fs.existsSync(runTempDir)) {
              fs.rmSync(runTempDir, { recursive: true, force: true });
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  // Feature: dynamic-category-control, Property 8: Front Matterからのカテゴリ抽出
  test('Front Matterからのカテゴリ抽出', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1 }).filter((s) => !s.includes('"') && !s.includes('\n') && !s.includes(':')),
          { minLength: 1, maxLength: 10 },
        ),
        (categories) => {
          const runTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-counter-prop-extract-'));
          try {
            const frontMatterData = yaml.dump({ categories });
            const frontMatter = `---\n${frontMatterData}---`;
            fs.writeFileSync(path.join(runTempDir, 'test.md'), frontMatter);

            const counter = new ProductCounter(runTempDir);
            counter.countProductsByCategory();

            const normalizedCategories = Array.from(
              new Set(categories.map((c) => c.trim()).filter((c) => c.length > 0)),
            );

            for (const category of normalizedCategories) {
              expect(counter.getProductCount(category)).toBe(1);
            }
          } finally {
            if (fs.existsSync(runTempDir)) {
              fs.rmSync(runTempDir, { recursive: true, force: true });
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
