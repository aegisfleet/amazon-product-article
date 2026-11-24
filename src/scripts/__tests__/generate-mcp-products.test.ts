import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildMcpProductItem,
  extractGiftAttributes,
  extractScoreRationale,
  generateMcpProducts,
} from '../generate-mcp-products';

describe('generateMcpProducts', () => {
  let tempDir: string;
  let investigationsDir: string;
  let cacheDir: string;
  let outputPath: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcp-products-test-'));
    investigationsDir = path.join(tempDir, 'data', 'investigations');
    cacheDir = path.join(tempDir, 'data', 'cache', 'paapi');
    outputPath = path.join(tempDir, 'static', 'mcp-products.json');
    await fs.promises.mkdir(investigationsDir, { recursive: true });
    await fs.promises.mkdir(cacheDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('extractScoreRationale', () => {
    it('調査結果JSONからスコア根拠を取り出せること', () => {
      const investigation = {
        analysis: { recommendation: { scoreRationale: '[基本点: 70]\n[加点: +5] 信頼性' } },
      };
      expect(extractScoreRationale(investigation)).toBe('[基本点: 70]\n[加点: +5] 信頼性');
    });

    it('スコア根拠が無い・空の場合は null を返すこと', () => {
      expect(extractScoreRationale({})).toBeNull();
      expect(extractScoreRationale({ analysis: { recommendation: {} } })).toBeNull();
      expect(extractScoreRationale({ analysis: { recommendation: { scoreRationale: '  ' } } })).toBeNull();
    });
  });

  describe('buildMcpProductItem', () => {
    it('ASINを大文字化し、ブランドとスコア根拠を組み立てること', () => {
      const item = buildMcpProductItem(
        'b07dy4xynd',
        { analysis: { recommendation: { scoreRationale: '根拠テキスト' } } },
        'DECORATIVE EYES',
      );
      expect(item).toEqual({
        asin: 'B07DY4XYND',
        brand: 'DECORATIVE EYES',
        score_rationale: '根拠テキスト',
      });
    });
  });

  describe('extractGiftAttributes', () => {
    it('ギフト文脈から相手とシーンを抽出できること', () => {
      const investigation = {
        analysis: {
          useCases: ['彼女へのクリスマスプレゼントに', '自分用に日常使い'],
          userStories: [{ scenario: '誕生日プレゼントとして妻に贈る', experience: '喜ばれた' }],
        },
      };
      expect(extractGiftAttributes(investigation)).toEqual({
        gift_recipients: ['partner', 'female'],
        gift_occasions: ['christmas', 'birthday'],
      });
    });

    it('ギフト文脈が無ければ null を返すこと（使用者本人の記述だけでは付けない）', () => {
      const investigation = {
        analysis: {
          useCases: ['共働き家庭の洗濯を楽に'],
          userStories: [{ scenario: '妻と相談して購入', experience: '女性にも扱いやすい' }],
        },
      };
      expect(extractGiftAttributes(investigation)).toBeNull();
    });

    it('結婚記念日は wedding として拾い、anniversary と重複させないこと', () => {
      const investigation = { analysis: { useCases: ['結婚記念日のプレゼントに夫婦で使う'] } };
      expect(extractGiftAttributes(investigation)?.gift_occasions).toEqual(['wedding']);
    });

    it('母の日のギフトは相手に両親を補完すること', () => {
      const investigation = { analysis: { useCases: ['母の日のプレゼントとして贈る'] } };
      expect(extractGiftAttributes(investigation)).toEqual({
        gift_recipients: ['parents'],
        gift_occasions: ['mothers_day'],
      });
    });

    it('ギフト文脈はあるが相手・シーンが特定できない場合は空配列で返すこと', () => {
      const investigation = { analysis: { productUsage: ['プレゼント用にも使える'] } };
      expect(extractGiftAttributes(investigation)).toEqual({ gift_recipients: [], gift_occasions: [] });
    });
  });

  describe('generateMcpProducts', () => {
    it('調査結果とキャッシュを結合して mcp-products.json を生成すること', async () => {
      await fs.promises.writeFile(
        path.join(investigationsDir, 'B07DY4XYND.json'),
        JSON.stringify({
          analysis: { recommendation: { score: 100, scoreRationale: '[基本点: 70]' } },
        }),
        'utf-8',
      );
      await fs.promises.writeFile(
        path.join(investigationsDir, 'B0AAAAAAAA.json'),
        JSON.stringify({ analysis: { recommendation: { score: 50 } } }),
        'utf-8',
      );
      // ASIN形式でないファイルは対象外
      await fs.promises.writeFile(path.join(investigationsDir, 'notes.json'), '{}', 'utf-8');
      await fs.promises.writeFile(
        path.join(cacheDir, 'ND.json'),
        JSON.stringify({ B07DY4XYND: { data: { brand: 'DECORATIVE EYES' }, status: 'valid' } }),
        'utf-8',
      );

      const items = await generateMcpProducts({ investigationsDir, cacheDir, outputPath });

      expect(items).toEqual([
        { asin: 'B07DY4XYND', brand: 'DECORATIVE EYES', score_rationale: '[基本点: 70]' },
        { asin: 'B0AAAAAAAA', brand: '', score_rationale: null },
      ]);
      const written = JSON.parse(await fs.promises.readFile(outputPath, 'utf-8')) as unknown;
      expect(written).toEqual(items);
    });

    it('調査ディレクトリが無い場合は空配列を返すこと', async () => {
      const items = await generateMcpProducts({
        investigationsDir: path.join(tempDir, 'does-not-exist'),
        cacheDir,
        outputPath,
      });
      expect(items).toEqual([]);
    });
  });
});
