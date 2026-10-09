import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type GenerateSummaryOptions,
  generateProductsSummary,
  type ProductSummaryItem,
  parseProductSummary,
} from '../generate-products-summary';

describe('generateProductsSummary', () => {
  let tempDir: string;
  let articlesDir: string;
  let outputPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'summary-test-'));
    articlesDir = path.join(tempDir, 'content', 'articles');
    outputPath = path.join(tempDir, 'static', 'products-summary.json');
    await fs.promises.mkdir(articlesDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('parseProductSummary', () => {
    it('正常なフロントマターから商品サマリー情報を正しく抽出できること', () => {
      const content = `---
title: "Audio-Technica AT2040 ダイナミックマイク"
brand: "Audio-Technica"
categories: ["マイク"]
asin: "B09BFPNW2J"
price: "￥11,800"
score: 88
affiliate_url: "https://www.amazon.co.jp/dp/B09BFPNW2J?tag=test-22"
---

## 本文
テストコンテンツ
`;

      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');

      expect(item).not.toBeNull();
      expect(item).toEqual({
        asin: 'B09BFPNW2J',
        title: 'Audio-Technica AT2040 ダイナミックマイク',
        brand: 'Audio-Technica',
        category: 'マイク',
        price: 11800,
        score: 88,
        url: 'https://www.amazon-hikaku.com/b09bfpnw2j/',
        affiliate_url: 'https://www.amazon.co.jp/dp/B09BFPNW2J?tag=test-22',
      });
    });

    it('ASINが存在しない場合はnullを返すこと', () => {
      const content = `---
title: "タイトルのみ"
---
`;
      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');
      expect(item).toBeNull();
    });

    it('価格表記が「1.2万円」など漢字表記の場合も数値化できること', () => {
      const content = `---
title: "高級商品"
asin: "B000000001"
price: "1.5万円"
score: 95
categories: ["家電"]
affiliate_url: "https://example.com"
---
`;
      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');
      expect(item?.price).toBe(15000);
    });

    it('scoreが未指定の場合は0になること', () => {
      const content = `---
title: "スコアなし商品"
asin: "B000000002"
affiliate_url: "https://example.com"
---
`;
      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');
      expect(item?.score).toBe(0);
    });
  });

  describe('generateProductsSummary 全体フロー', () => {
    it('複数記事から products-summary.json を正常に生成できること', async () => {
      const article1 = `---
title: "商品A"
brand: "ブランドA"
categories: ["カテゴリA"]
asin: "B00000000A"
price: "￥1,000"
score: 80
affiliate_url: "https://www.amazon.co.jp/dp/B00000000A?tag=test-22"
---
`;
      const article2 = `---
title: "商品B"
brand: "ブランドB"
categories: ["カテゴリB"]
asin: "B00000000B"
price: "￥2,500"
score: 90
affiliate_url: "https://www.amazon.co.jp/dp/B00000000B?tag=test-22"
---
`;

      await fs.promises.writeFile(path.join(articlesDir, 'B00000000A.md'), article1, 'utf-8');
      await fs.promises.writeFile(path.join(articlesDir, 'B00000000B.md'), article2, 'utf-8');
      await fs.promises.writeFile(path.join(articlesDir, '_index.md'), '--- title: Index ---', 'utf-8');

      const options: GenerateSummaryOptions = {
        articlesDir,
        outputPath,
        baseUrl: 'https://www.amazon-hikaku.com/',
      };

      const result = await generateProductsSummary(options);

      expect(result).toHaveLength(2);
      expect(fs.existsSync(outputPath)).toBe(true);

      const writtenJson = JSON.parse(await fs.promises.readFile(outputPath, 'utf-8')) as ProductSummaryItem[];
      expect(writtenJson).toHaveLength(2);

      const asins = writtenJson.map((i) => i.asin).sort();
      expect(asins).toEqual(['B00000000A', 'B00000000B']);
    });

    it('ディレクトリが存在しない場合は空配列を返しファイルを作成しないこと', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');
      const result = await generateProductsSummary({
        articlesDir: nonExistentDir,
        outputPath,
      });

      expect(result).toEqual([]);
      expect(fs.existsSync(outputPath)).toBe(false);
    });
  });
});
