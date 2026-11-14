import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CategoryManager } from '../CategoryManager';
import { ProductCounter } from '../ProductCounter';

describe('CategoryManager', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'category-manager-test-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  });

  test('空のカテゴリグループを読み込む', () => {
    const jsonPath = path.join(tempDir, 'empty.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ categoryGroups: [] }));

    const manager = new CategoryManager(jsonPath);
    manager.loadCategoryGroups();

    expect(manager.getCategoryGroups().length).toBe(0);
  });

  test('不正なJSON形式の場合に元の例外をcauseに保持する', () => {
    const jsonPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(jsonPath, '{ "invalid": json }'); // Syntax Error

    const manager = new CategoryManager(jsonPath);
    let error: any;
    try {
      manager.loadCategoryGroups();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain(`Invalid JSON format in ${jsonPath}`);
    expect(error.cause).toBeDefined();
    expect(error.cause instanceof SyntaxError).toBe(true);
    expect(error.cause.message).toContain('Unexpected token');
  });

  test('名前が欠けている場合にエラーを投げる', () => {
    const jsonPath = path.join(tempDir, 'missing_name.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        categoryGroups: [{ slug: 'missing-name', children: [] }],
      }),
    );

    const manager = new CategoryManager(jsonPath);
    expect(() => manager.loadCategoryGroups()).toThrow(TypeError);
    try {
      manager.loadCategoryGroups();
    } catch (e) {
      expect(e).toBeInstanceOf(TypeError);
      expect((e as Error).message).toContain('Missing required field: name in category missing-name');
    }
  });

  test('必須フィールドが欠けている場合にTypeErrorを投げる', () => {
    const jsonPath = path.join(tempDir, 'missing_field.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        categoryGroups: [{ name: 'MissingSlug', children: [] }],
      }),
    );

    const manager = new CategoryManager(jsonPath);
    expect(() => manager.loadCategoryGroups()).toThrow(TypeError);
    try {
      manager.loadCategoryGroups();
    } catch (e) {
      expect(e).toBeInstanceOf(TypeError);
      expect((e as Error).message).toContain('Missing required field: slug in category MissingSlug');
    }
  });

  test('childrenが文字列の配列でない場合にTypeErrorを投げる', () => {
    const jsonPath = path.join(tempDir, 'invalid_children.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        categoryGroups: [{ name: 'InvalidChildren', slug: 'invalid', children: [1, 2, 3] }],
      }),
    );

    const manager = new CategoryManager(jsonPath);
    expect(() => manager.loadCategoryGroups()).toThrow(TypeError);
    try {
      manager.loadCategoryGroups();
    } catch (e) {
      expect(e).toBeInstanceOf(TypeError);
      expect((e as Error).message).toContain(
        'Missing required field: children (string array) in category InvalidChildren',
      );
    }
  });

  test('カテゴリ名の重複チェックテスト', () => {
    const jsonPath = path.join(tempDir, 'duplicate_name.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        categoryGroups: [
          { name: 'SameName', slug: 'slug1', children: [] },
          { name: 'SameName', slug: 'slug2', children: [] },
        ],
      }),
    );

    const manager = new CategoryManager(jsonPath);
    expect(() => manager.loadCategoryGroups()).toThrow('Duplicate category name: SameName');
  });

  test('YAMLとJSONの両方に正しく出力する', () => {
    const categoryData = {
      categoryGroups: [{ name: 'TestCat', slug: 'test-cat', children: ['ChildA'] }],
    };
    const jsonPath = path.join(tempDir, 'source.json');
    fs.writeFileSync(jsonPath, JSON.stringify(categoryData));

    const manager = new CategoryManager(jsonPath);
    manager.loadCategoryGroups();

    // Stub out ProductCounter to avoid scanning
    const mockCounter = new ProductCounter(tempDir);
    const mockIds = new Set(['p1', 'p2', 'p3', 'p4', 'p5']);
    jest.spyOn(mockCounter, 'getProductIds').mockReturnValue(mockIds);
    jest.spyOn(mockCounter, 'getProductCount').mockReturnValue(5);

    manager.enhanceCategoryGroups(mockCounter);

    const outJson = path.join(tempDir, 'out.json');
    const outYaml = path.join(tempDir, 'out.yml');

    manager.exportToJSON(outJson);
    manager.exportToYAML(outYaml);

    expect(fs.existsSync(outJson)).toBe(true);
    expect(fs.existsSync(outYaml)).toBe(true);

    const jsonOutput = JSON.parse(fs.readFileSync(outJson, 'utf-8'));
    expect(jsonOutput['TestCat']).toBeDefined();
    expect(jsonOutput['TestCat'].slug).toBe('test-cat');
    expect(jsonOutput['TestCat'].categories).toEqual(['ChildA']);
  });

  test('should load taxonomy-v2.json format correctly', () => {
    const v2Path = path.join(tempDir, 'taxonomy-v2.json');
    const v2Data = {
      version: 2,
      updated_at: '2026-11-12',
      parents: [
        {
          slug: 'pc-workstation',
          name: 'パソコン／周辺機器',
          icon: '💻',
          priority: 1,
          legacy_slugs: ['pc-peripheral'],
          criteria: 'PC本体や周辺機器',
          children: [
            { slug: 'laptops', name: 'ノートパソコン', criteria: 'ノートPC本体' },
            { slug: 'monitors', name: 'モニター', criteria: '液晶モニター' },
          ],
        },
      ],
    };

    fs.writeFileSync(v2Path, JSON.stringify(v2Data));
    const manager = new CategoryManager(v2Path);
    manager.loadCategoryGroups();

    const groups = manager.getCategoryGroups();
    expect(groups.length).toBe(1);
    expect(groups[0]?.name).toBe('パソコン／周辺機器');
    expect(groups[0]?.slug).toBe('pc-workstation');
    expect(groups[0]?.legacySlugs).toEqual(['pc-peripheral']);
    expect(groups[0]?.children).toEqual(['ノートパソコン', 'モニター']);
  });

  test('その他／未分類で始まる子カテゴリが件数に関わらず常に末尾に配置されること', () => {
    const jsonPath = path.join(tempDir, 'other_sort.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        categoryGroups: [
          {
            name: 'テスト親',
            slug: 'test-parent',
            children: ['その他テスト', '未分類テスト', '子カテゴリA', '子カテゴリB'],
          },
        ],
      }),
    );

    const manager = new CategoryManager(jsonPath);
    manager.loadCategoryGroups();

    const mockCounter = new ProductCounter(tempDir);
    jest.spyOn(mockCounter, 'getProductIds').mockImplementation((name: string) => {
      if (name === 'その他テスト') return new Set(['p1', 'p2', 'p3', 'p4', 'p5']);
      if (name === '未分類テスト') return new Set(['p6', 'p7', 'p8', 'p9']);
      if (name === '子カテゴリA') return new Set(['p10']);
      if (name === '子カテゴリB') return new Set(['p11', 'p12']);
      return new Set<string>();
    });

    const enhanced = manager.enhanceCategoryGroups(mockCounter);
    expect(enhanced[0]?.childrenWithCounts.map((c) => c.name)).toEqual([
      '子カテゴリB',
      '子カテゴリA',
      'その他テスト',
      '未分類テスト',
    ]);
    expect(enhanced[0]?.children).toEqual(['子カテゴリB', '子カテゴリA', 'その他テスト', '未分類テスト']);
  });
});
