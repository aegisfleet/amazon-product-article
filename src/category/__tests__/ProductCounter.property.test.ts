import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fc from 'fast-check';
import * as yaml from 'js-yaml';
import { ProductCounter } from '../ProductCounter';

describe('ProductCounter Properties', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-counter-prop-test-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const clearTempDir = () => {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
    }
  };

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
          clearTempDir();

          let fileIndex = 0;
          const expectedCounts = new Map<string, number>();

          products.forEach((product) => {
            const normalizedCategories = Array.from(
              new Set(product.categories.map((c) => c.trim()).filter((c) => c.length > 0)),
            );

            if (normalizedCategories.length === 0) return;

            const frontMatter = yaml.dump({ categories: product.categories });
            const content = `---\n${frontMatter}---\ncontent`;
            fs.writeFileSync(path.join(tempDir, `product_${fileIndex++}.md`), content);

            normalizedCategories.forEach((category) => {
              expectedCounts.set(category, (expectedCounts.get(category) || 0) + 1);
            });
          });

          const counter = new ProductCounter(tempDir);
          counter.countProductsByCategory();

          expectedCounts.forEach((count, category) => {
            expect(counter.getProductCount(category)).toBe(count);
          });
        },
      ),
      { numRuns: 100 },
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
          clearTempDir();
          const frontMatterData = yaml.dump({ categories });
          const frontMatter = `---\n${frontMatterData}---`;
          fs.writeFileSync(path.join(tempDir, 'test.md'), frontMatter);

          const counter = new ProductCounter(tempDir);
          counter.countProductsByCategory();

          const normalizedCategories = Array.from(new Set(categories.map((c) => c.trim()).filter((c) => c.length > 0)));

          normalizedCategories.forEach((category) => {
            expect(counter.getProductCount(category)).toBe(1);
          });

          // 期待されるユニークなカテゴリ数と実際のMapのサイズを比較
          // ただし他のテストの影響を避けるため独立した比較は難しいがここでは各カテゴリの確認で十分
        },
      ),
      { numRuns: 100 },
    );
  });
});
