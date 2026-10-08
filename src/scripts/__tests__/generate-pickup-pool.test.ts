import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { derivePriceBucket, generatePickupPool, parsePickupItem } from '../generate-pickup-pool';

describe('generate-pickup-pool', () => {
  let tempDir: string;
  let articlesDir: string;
  let categoryGroupsPath: string;
  let outputPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pickup-pool-test-'));
    articlesDir = path.join(tempDir, 'articles');
    fs.mkdirSync(articlesDir, { recursive: true });

    categoryGroupsPath = path.join(tempDir, 'categorygroups.json');
    const mockCategoryGroups = {
      'PC／モニター／入力機器': {
        slug: 'pc-workstation',
        categories: ['キーボード', 'マウス'],
      },
      'スマホ／タブレット本体': {
        slug: 'smartphones',
        categories: ['スマートフォン本体', 'タブレット'],
      },
      'イヤホン／ヘッドホン／音響': {
        slug: 'audio',
        categories: ['イヤホン', 'ヘッドホン'],
      },
    };
    fs.writeFileSync(categoryGroupsPath, JSON.stringify(mockCategoryGroups, null, 2), 'utf8');

    outputPath = path.join(tempDir, 'data', 'recommendations', 'pickup-pool.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('derivePriceBucket', () => {
    it('価格文字列から正しいバケットを返すこと', () => {
      expect(derivePriceBucket('￥2,500')).toBe('under-3000');
      expect(derivePriceBucket('￥5,000')).toBe('3000-6999');
      expect(derivePriceBucket('￥12,000')).toBe('7000-14999');
      expect(derivePriceBucket('￥25,000')).toBe('15000-29999');
      expect(derivePriceBucket('￥50,000')).toBe('30000-plus');
      expect(derivePriceBucket('')).toBe('unknown');
    });
  });

  describe('parsePickupItem', () => {
    it('80点以上の記事を正しくパースできること', () => {
      const mdContent = `---
title: "テストキーボード"
asin: "B00KEY0001"
score: 88
price: "￥8,980"
categories: ["キーボード"]
last_investigated: "2026-08-01"
images: ["https://example.com/img.jpg"]
specs:
  os: "Windows"
---
記事本文`;

      const catToGroup = { キーボード: 'PC／モニター／入力機器' };
      const item = parsePickupItem(mdContent, 'B00KEY0001.md', catToGroup);

      expect(item).not.toBeNull();
      expect(item?.title).toBe('テストキーボード');
      expect(item?.asin).toBe('B00KEY0001');
      expect(item?.score).toBe(88);
      expect(item?.category).toBe('キーボード');
      expect(item?.group).toBe('PC／モニター／入力機器');
      expect(item?.priceBucket).toBe('7000-14999');
      expect(item?.image).toBe('https://example.com/img.jpg');
      expect(item?.url).toBe('/articles/B00KEY0001/');
    });

    it('80点未満の記事はnullを返すこと', () => {
      const mdContent = `---
title: "低スコア商品"
asin: "B00LOW0001"
score: 75
price: "￥1,000"
category: "マウス"
---`;
      const catToGroup = { マウス: 'PC／モニター／入力機器' };
      const item = parsePickupItem(mdContent, 'B00LOW0001.md', catToGroup);
      expect(item).toBeNull();
    });
  });

  describe('generatePickupPool', () => {
    it('グループ均等サンプリングと全体上位確保を行い、JSONを出力すること', () => {
      // 3グループから複数記事を作成
      const articles = [
        // PCグループ (3件: スコア 95, 85, 82)
        { file: 'pc1.md', title: 'PC1', asin: 'B00PC1', score: 95, cat: 'キーボード', price: '￥10,000' },
        { file: 'pc2.md', title: 'PC2', asin: 'B00PC2', score: 85, cat: 'マウス', price: '￥5,000' },
        { file: 'pc3.md', title: 'PC3', asin: 'B00PC3', score: 82, cat: 'キーボード', price: '￥3,000' },
        // スマホグループ (2件: スコア 90, 84)
        { file: 'sp1.md', title: 'SP1', asin: 'B00SP1', score: 90, cat: 'スマートフォン本体', price: '￥40,000' },
        { file: 'sp2.md', title: 'SP2', asin: 'B00SP2', score: 84, cat: 'タブレット', price: '￥30,000' },
        // オーディオグループ (2件: スコア 88, 81)
        { file: 'au1.md', title: 'AU1', asin: 'B00AU1', score: 88, cat: 'イヤホン', price: '￥8,000' },
        { file: 'au2.md', title: 'AU2', asin: 'B00AU2', score: 81, cat: 'ヘッドホン', price: '￥12,000' },
      ];

      for (const a of articles) {
        const content = `---
title: "${a.title}"
asin: "${a.asin}"
score: ${a.score}
price: "${a.price}"
categories: ["${a.cat}"]
last_investigated: "2026-08-01"
images: ["https://example.com/img.jpg"]
---`;
        fs.writeFileSync(path.join(articlesDir, a.file), content, 'utf8');
      }

      // maxPerGroup: 1, topOverall: 2 でテスト
      const result = generatePickupPool({
        articlesDir,
        categoryGroupsPath,
        outputPath,
        maxPerGroup: 1,
        topOverallCount: 2,
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      const jsonContent = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Array<{ asin: string }>;
      expect(Array.isArray(jsonContent)).toBe(true);

      // 全体上位2件: pc1 (score 95), sp1 (score 90)
      // 各グループ上限1件追加:
      // pc: pc1 はすでに採用済み
      // sp: sp1 はすでに採用済み
      // audio: au1 (score 88) が採用
      // 合計3件 (B00PC1, B00SP1, B00AU1)
      const asins = jsonContent.map((item) => item.asin);
      expect(asins).toContain('B00PC1');
      expect(asins).toContain('B00SP1');
      expect(asins).toContain('B00AU1');
      expect(asins).toHaveLength(3);
      expect(result).toHaveLength(3);
    });
  });
});
