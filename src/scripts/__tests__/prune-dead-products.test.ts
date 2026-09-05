import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanCompetitorReferences,
  findCompetitorReferences,
  findOrphanedFiles,
  parseArgs,
} from '../maintenance/prune-dead-products';

describe('prune-dead-products 参照整合性チェック', () => {
  let tempDir: string;
  let investDir: string;
  let articlesDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
    investDir = path.join(tempDir, 'data', 'investigations');
    articlesDir = path.join(tempDir, 'content', 'articles');
    fs.mkdirSync(investDir, { recursive: true });
    fs.mkdirSync(articlesDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('findCompetitorReferences', () => {
    it('削除対象ASINが競合に含まれる調査JSONを正しく検出する', () => {
      // 調査データ1: B0DEAD1234 を競合に含む
      const invest1 = {
        analysis: {
          productName: '商品A',
          competitiveAnalysis: [
            { asin: 'B0ALIVE999', name: '通常商品' },
            { asin: 'B0DEAD1234', name: '廃止商品' },
          ],
        },
      };
      fs.writeFileSync(path.join(investDir, 'B0AAA11111.json'), JSON.stringify(invest1, null, 2));

      // 調査データ2: 削除対象ASINを含まない
      const invest2 = {
        analysis: {
          productName: '商品B',
          competitiveAnalysis: [{ asin: 'B0ALIVE888', name: '通常商品2' }],
        },
      };
      fs.writeFileSync(path.join(investDir, 'B0BBB22222.json'), JSON.stringify(invest2, null, 2));

      const references = findCompetitorReferences(['B0DEAD1234'], investDir);
      expect(references).toHaveLength(1);
      expect(references[0]?.sourceAsin).toBe('B0AAA11111');
      expect(references[0]?.referencedDeadAsins).toEqual([{ asin: 'B0DEAD1234', name: '廃止商品' }]);
    });

    it('対象ASINが指定されていない、または存在しない場合は空配列を返す', () => {
      const references = findCompetitorReferences([], investDir);
      expect(references).toEqual([]);

      const nonExistentRefs = findCompetitorReferences(['B0NOTEXIST'], investDir);
      expect(nonExistentRefs).toEqual([]);
    });
  });

  describe('cleanCompetitorReferences', () => {
    it('dryRun=true の場合はファイルを改変しない', () => {
      const invest = {
        analysis: {
          productName: '商品A',
          competitiveAnalysis: [
            { asin: 'B0ALIVE999', name: '通常商品' },
            { asin: 'B0DEAD1234', name: '廃止商品' },
          ],
        },
      };
      const filePath = path.join(investDir, 'B0AAA11111.json');
      fs.writeFileSync(filePath, JSON.stringify(invest, null, 2));

      const references = findCompetitorReferences(['B0DEAD1234'], investDir);
      const result = cleanCompetitorReferences(references, true);

      expect(result.modifiedFilesCount).toBe(1);
      expect(result.removedEntriesCount).toBe(1);

      // ファイルの中身が変わっていないこと
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(raw.analysis.competitiveAnalysis).toHaveLength(2);
    });

    it('dryRun=false の場合は競合から削除対象ASINを除去して保存する', () => {
      const invest = {
        analysis: {
          productName: '商品A',
          competitiveAnalysis: [
            { asin: 'B0ALIVE999', name: '通常商品' },
            { asin: 'B0DEAD1234', name: '廃止商品' },
          ],
        },
      };
      const filePath = path.join(investDir, 'B0AAA11111.json');
      fs.writeFileSync(filePath, JSON.stringify(invest, null, 2));

      const references = findCompetitorReferences(['B0DEAD1234'], investDir);
      const result = cleanCompetitorReferences(references, false);

      expect(result.modifiedFilesCount).toBe(1);
      expect(result.removedEntriesCount).toBe(1);

      // ファイルが更新され、B0DEAD1234 が除去されていること
      const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(updated.analysis.competitiveAnalysis).toHaveLength(1);
      expect(updated.analysis.competitiveAnalysis[0]?.asin).toBe('B0ALIVE999');
    });
  });

  describe('findOrphanedFiles', () => {
    it('記事のみまたは調査データのみ存在する孤立ファイルを検出する', () => {
      // 正常ペア: B0PAIR1111
      fs.writeFileSync(path.join(articlesDir, 'B0PAIR1111.md'), '# 記事');
      fs.writeFileSync(path.join(investDir, 'B0PAIR1111.json'), '{}');

      // 記事のみ: B0ONLYART1
      fs.writeFileSync(path.join(articlesDir, 'B0ONLYART1.md'), '# 記事のみ');

      // 調査データのみ: B0ONLYINV1
      fs.writeFileSync(path.join(investDir, 'B0ONLYINV1.json'), '{}');

      const orphans = findOrphanedFiles(articlesDir, investDir);
      expect(orphans.articlesWithoutInvest).toEqual(['B0ONLYART1']);
      expect(orphans.investsWithoutArticle).toEqual(['B0ONLYINV1']);
    });
  });

  describe('parseArgs', () => {
    it('デフォルトで参照チェックとクリーンアップが有効である', () => {
      const options = parseArgs([]);
      expect(options.checkReferences).toBe(true);
      expect(options.cleanReferences).toBe(true);
      expect(options.checkOrphans).toBe(true);
    });

    it('--skip-references オプションで参照チェックとクリーンアップが無効化される', () => {
      const options = parseArgs(['--skip-references']);
      expect(options.checkReferences).toBe(false);
      expect(options.cleanReferences).toBe(false);
    });

    it('--no-clean-references オプションでクリーンアップのみ無効化される', () => {
      const options = parseArgs(['--no-clean-references']);
      expect(options.checkReferences).toBe(true);
      expect(options.cleanReferences).toBe(false);
    });

    it('--skip-orphans オプションで孤立ファイルチェックが無効化される', () => {
      const options = parseArgs(['--skip-orphans']);
      expect(options.checkOrphans).toBe(false);
    });
  });
});
