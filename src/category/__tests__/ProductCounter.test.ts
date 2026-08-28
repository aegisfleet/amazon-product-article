import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProductCounter } from '../ProductCounter';

describe('ProductCounter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-counter-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('商品が存在しないカテゴリは0を返す', () => {
    const counter = new ProductCounter(tempDir);
    counter.countProductsByCategory();
    expect(counter.getProductCount('NonExistent')).toBe(0);
  });

  test('Front Matterが不正な商品ファイルをスキップする', () => {
    fs.writeFileSync(path.join(tempDir, 'invalid.md'), '---\ninvalid: yaml:\n---\ncontent');
    const counter = new ProductCounter(tempDir);
    const counts = counter.countProductsByCategory();
    expect(counts.size).toBe(0);
  });

  test('categories フィールドが配列でない場合をスキップする', () => {
    const validContent = '---\ncategories:\n  - "TestCategory"\n---\ncontent';
    const invalidContent1 = '---\ncategories: "NotArray"\n---\ncontent';
    const invalidContent2 = '---\ntitle: "NoCategory"\n---\ncontent';

    fs.writeFileSync(path.join(tempDir, 'valid.md'), validContent);
    fs.writeFileSync(path.join(tempDir, 'invalid1.md'), invalidContent1);
    fs.writeFileSync(path.join(tempDir, 'invalid2.md'), invalidContent2);

    const counter = new ProductCounter(tempDir);
    const counts = counter.countProductsByCategory();

    expect(counts.size).toBe(1);
    expect(counter.getProductCount('TestCategory')).toBe(1);
  });

  test('カテゴリ名の正規化と重複排除（空白・空文字）', () => {
    const content = `---
categories:
  - "  CategoryA  "
  - "CategoryA"
  - " "
  - "  "
  - "CategoryB"
---`;
    fs.writeFileSync(path.join(tempDir, 'normalize.md'), content);

    const counter = new ProductCounter(tempDir);
    counter.countProductsByCategory();

    expect(counter.getProductCount('CategoryA')).toBe(1);
    expect(counter.getProductCount('  CategoryA  ')).toBe(1); // normalized
    expect(counter.getProductCount('CategoryB')).toBe(1);
    expect(counter.getProductCount(' ')).toBe(0); // empty after trim
  });

  test('大文字・小文字が異なる場合でも同一カテゴリとしてカウントされる', () => {
    const content = `---
categories:
  - "microSDカード"
---`;
    fs.writeFileSync(path.join(tempDir, 'microsd.md'), content);

    const counter = new ProductCounter(tempDir);
    counter.countProductsByCategory();

    expect(counter.getProductCount('microSDカード')).toBe(1);
    expect(counter.getProductCount('MicroSDカード')).toBe(1);
    expect(counter.getProductCount('MICROSDカード')).toBe(1);
  });
});
