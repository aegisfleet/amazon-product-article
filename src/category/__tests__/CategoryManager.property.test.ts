import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CategoryManager } from '../CategoryManager';
import { ProductCounter } from '../ProductCounter';

describe('CategoryManager Properties', () => {
    const tempDir = path.join(__dirname, 'temp_cm_props');

    beforeAll(() => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    afterAll(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    // Feature: dynamic-category-control, Property 4: カテゴリ設定のラウンドトリップ
    test('カテゴリ設定のラウンドトリップ', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
                    slug: fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
                    description: fc.option(fc.string()),
                    visible: fc.option(fc.boolean()),
                    priority: fc.option(fc.integer({ min: 0, max: 999 })),
                    children: fc.array(fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))),
                }),
                (categoryGroup) => {
                    const manager = new CategoryManager('dummy.json');
                    manager.addCategoryGroup(categoryGroup as any);

                    const mockCounter = new ProductCounter(tempDir);
                    const output = manager.enhanceCategoryGroups(mockCounter);

                    expect(output.length).toBeGreaterThan(0);
                    expect(output[0]?.name).toBe(categoryGroup.name);
                    expect(output[0]?.slug).toBe(categoryGroup.slug);
                    expect(output[0]?.description).toBe(categoryGroup.description);
                    expect(output[0]?.visible).toBe(categoryGroup.visible ?? true);
                    expect(output[0]?.priority).toBe(categoryGroup.priority ?? 999);
                }
            ),
            { numRuns: 100 }
        );
    });

    // Feature: dynamic-category-control, Property 5: 後方互換性の維持
    test('後方互換性の維持', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
                    slug: fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
                    children: fc.array(fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))),
                }),
                (legacyCategoryGroup) => {
                    const manager = new CategoryManager('dummy.json');
                    manager.addCategoryGroup(legacyCategoryGroup);

                    const mockCounter = new ProductCounter(tempDir);
                    const output = manager.enhanceCategoryGroups(mockCounter);

                    expect(output.length).toBeGreaterThan(0);
                    expect(output[0]?.visible).toBe(true);
                    expect(output[0]?.priority).toBe(999);
                    expect(output[0]?.description).toBeUndefined();
                }
            ),
            { numRuns: 100 }
        );
    });
});
