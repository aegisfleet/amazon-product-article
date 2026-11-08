import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanCompetitorReferences,
  collectTargetAsins,
  findCompetitorReferences,
  findOrphanedFiles,
  isLongOutOfStockEntry,
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

    it('--scope stale, --stale-days, --max-prune, --include-stale を正しく解釈する', () => {
      const options1 = parseArgs(['--scope', 'stale', '--stale-days', '60', '--max-prune', '25']);
      expect(options1.scope).toBe('stale');
      expect(options1.staleDays).toBe(60);
      expect(options1.maxPrune).toBe(25);

      const options2 = parseArgs(['--include-stale']);
      expect(options2.scope).toBe('stale');
      expect(options2.staleDays).toBe(90);
    });
  });

  describe('isLongOutOfStockEntry & collectTargetAsins', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    it('outOfStockSince が閾値以前であれば true、閾値より新しければ false を返す', () => {
      const now = Date.now();
      const cutoff = now - 90 * DAY_MS;

      expect(
        isLongOutOfStockEntry(
          'B0STALE001',
          { status: 'valid', timestamp: now, outOfStockSince: now - 95 * DAY_MS, data: null },
          cutoff,
          articlesDir,
          investDir,
        ),
      ).toBe(true);

      expect(
        isLongOutOfStockEntry(
          'B0RECENT01',
          { status: 'valid', timestamp: now, outOfStockSince: now - 10 * DAY_MS, data: null },
          cutoff,
          articlesDir,
          investDir,
        ),
      ).toBe(false);
    });

    it('outOfStockSince 未設定時でも記事またはキャッシュが在庫切れかつ最終調査日が閾値以前なら true を返す', () => {
      const now = Date.now();
      const cutoff = now - 90 * DAY_MS;
      const oldDateIso = new Date(now - 100 * DAY_MS).toISOString();

      fs.writeFileSync(path.join(articlesDir, 'B0LEGACY01.md'), '---\ntitle: "テスト"\nin_stock: false\n---\n本文');
      fs.writeFileSync(
        path.join(investDir, 'B0LEGACY01.json'),
        JSON.stringify({ analysis: { lastInvestigated: oldDateIso } }),
      );

      expect(isLongOutOfStockEntry('B0LEGACY01', undefined, cutoff, articlesDir, investDir)).toBe(true);
    });

    it('collectTargetAsins は scope=stale で permanent_invalid と長期在庫切れ候補の両方を抽出する', () => {
      const now = Date.now();
      fs.writeFileSync(path.join(investDir, 'B0PERM0001.json'), '{}');
      fs.writeFileSync(path.join(investDir, 'B0STALE001.json'), '{}');
      fs.writeFileSync(path.join(investDir, 'B0VALID001.json'), '{}');

      const cache = {
        B0PERM0001: { status: 'permanent_invalid', timestamp: now, data: null },
        B0STALE001: { status: 'valid', timestamp: now, outOfStockSince: now - 95 * DAY_MS, data: null },
        B0VALID001: {
          status: 'valid',
          timestamp: now,
          data: { price: { amount: 1500, currency: 'JPY', formatted: '￥1,500' }, availability: '在庫あり' },
        },
      };

      const options = parseArgs(['--scope', 'stale', '--stale-days', '90']);
      const targets = collectTargetAsins(options, cache, articlesDir, investDir);

      expect(targets.sort()).toEqual(['B0PERM0001', 'B0STALE001']);
    });
  });
});
