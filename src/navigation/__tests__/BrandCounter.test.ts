import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrandCounter } from '../BrandCounter';
import { BrandManager } from '../BrandManager';

describe('BrandCounter & BrandManager Integration', () => {
  const tmpDir = path.resolve(__dirname, 'tmp_test_brand');
  const articlesDir = path.resolve(tmpDir, 'articles');
  const brandGroupsPath = path.resolve(tmpDir, 'brandgroups.json');

  beforeEach(() => {
    fs.mkdirSync(articlesDir, { recursive: true });

    const brandGroupsData = {
      オムロン: {
        slug: 'omron',
        matcher: {
          type: 'brand',
          value: 'オムロン|OMRON',
        },
      },
    };
    fs.writeFileSync(brandGroupsPath, JSON.stringify(brandGroupsData, null, 2));

    // 10個の記事を作成 (表記揺れ: Omron, OMRON, オムロン)
    for (let i = 1; i <= 10; i++) {
      const brandVal = i % 3 === 0 ? 'Omron' : i % 3 === 1 ? 'OMRON' : 'オムロン';
      const content = `---\ntitle: "オムロン血圧計 ${i}"\nbrand: "${brandVal}"\n---\n`;
      fs.writeFileSync(path.join(articlesDir, `article_${i}.md`), content);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Omron / OMRON / オムロン の表記揺れを既存ブランド「オムロン」に名寄せしてカウントする', () => {
    const counter = new BrandCounter(articlesDir, 10, brandGroupsPath);
    const topBrands = counter.getTopBrands();

    expect(topBrands).toHaveLength(1);
    expect(topBrands[0]!.name).toBe('オムロン');
    expect(topBrands[0]!.count).toBe(10);
  });

  test('BrandManager.matchBrandKey が大文字小文字を無視して一致する', () => {
    const manager = new BrandManager(brandGroupsPath);
    manager.load();

    expect(manager.matchBrandKey('Omron')).toBe('オムロン');
    expect(manager.matchBrandKey('OMRON')).toBe('オムロン');
    expect(manager.matchBrandKey(null, 'オムロン(OMRON)')).toBe('オムロン');
  });
});
