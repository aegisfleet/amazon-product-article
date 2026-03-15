import * as os from 'node:os';
import * as fs from 'node:fs';
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
});
