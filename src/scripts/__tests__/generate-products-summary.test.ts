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
description: "ポッドキャストや配信に最適なハイパーカーディオイドダイナミックマイク。"
brand: "Audio-Technica"
categories: ["マイク"]
asin: "B09BFPNW2J"
price: "￥11,800"
score: 88
images: ["https://m.media-amazon.com/images/I/51test.jpg", "https://m.media-amazon.com/images/I/52test.jpg"]
---

## 本文
テストコンテンツ
`;

      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');

      expect(item).not.toBeNull();
      expect(item).toEqual({
        asin: 'B09BFPNW2J',
        title: 'Audio-Technica AT2040 ダイナミックマイク',
        description: 'ポッドキャストや配信に最適なハイパーカーディオイドダイナミックマイク。',
        brand: 'Audio-Technica',
        category: 'マイク',
        price: 11800,
        score: 88,
        url: 'https://www.amazon-hikaku.com/b09bfpnw2j/',
        image: 'https://m.media-amazon.com/images/I/51test.jpg',
      });
    });

    it('ブロックスタイルの画像リストから先頭画像を抽出できること', () => {
      const content = `---
title: "ブロック画像商品"
asin: "B000000003"
images:
  - "https://m.media-amazon.com/images/I/first.jpg"
  - "https://m.media-amazon.com/images/I/second.jpg"
---
`;
      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');
      expect(item?.image).toBe('https://m.media-amazon.com/images/I/first.jpg');
    });

    it('画像が存在しない場合は空文字になること', () => {
      const content = `---
title: "画像なし商品"
asin: "B000000004"
---
`;
      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');
      expect(item?.image).toBe('');
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
---
`;
      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');
      expect(item?.price).toBe(15000);
    });

    it('scoreが未指定の場合は0になること', () => {
      const content = `---
title: "スコアなし商品"
asin: "B000000002"
---
`;
      const item = parseProductSummary(content, 'https://www.amazon-hikaku.com/');
      expect(item?.score).toBe(0);
    });
  });

  describe('generateProductsSummary 全体フロー', () => {
    it('複数記事から products-summary.json を独自スコア降順で正常に生成できること', async () => {
      const article1 = `---
title: "商品A"
description: "商品Aの説明"
brand: "ブランドA"
categories: ["カテゴリA"]
asin: "B00000000A"
price: "￥1,000"
score: 80
---
`;
      const article2 = `---
title: "商品B"
description: "商品Bの説明"
brand: "ブランドB"
categories: ["カテゴリB"]
asin: "B00000000B"
price: "￥2,500"
score: 90
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

      // スコア降順（90点の商品Bが先頭、80点の商品Aが2番目）に並んでいることを検証
      expect(writtenJson[0]?.asin).toBe('B00000000B');
      expect(writtenJson[0]?.score).toBe(90);
      expect(writtenJson[0]?.description).toBe('商品Bの説明');
      expect(writtenJson[1]?.asin).toBe('B00000000A');
      expect(writtenJson[1]?.score).toBe(80);
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
