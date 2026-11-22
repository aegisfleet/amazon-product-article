import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMcpProductItem, extractScoreRationale, generateMcpProducts } from '../generate-mcp-products';

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
