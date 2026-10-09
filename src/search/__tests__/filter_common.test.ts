import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

describe('filter-common.js duplicate execution and utility tests', () => {
  let filterCommonJsContent: string;

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../../static/js/filter-common.js');
    filterCommonJsContent = fs.readFileSync(filePath, 'utf8');
  });

  it('does not throw SyntaxError when evaluated multiple times in the same context', () => {
    const mockDocument = {
      readyState: 'complete',
      getElementById: jest.fn().mockReturnValue(null),
      querySelectorAll: jest.fn().mockReturnValue([]),
      addEventListener: jest.fn(),
    };

    const mockWindow = {
      matchMedia: jest.fn().mockReturnValue({
        matches: false,
        media: '',
        addEventListener: jest.fn(),
      }),
    };

    const context = vm.createContext({
      document: mockDocument,
      window: mockWindow,
      globalThis: mockWindow,
      console,
      setTimeout,
      clearTimeout,
    });

    // 1回目の実行
    expect(() => {
      vm.runInContext(filterCommonJsContent, context);
    }).not.toThrow();

    // 2回目の実行（二重ロードされた場合でも SyntaxError にならないこと）
    expect(() => {
      vm.runInContext(filterCommonJsContent, context);
    }).not.toThrow();
  });

  it('correctly resolves category URLs via getCategoryUrlFromName', () => {
    const mockCategoryData = {
      'イヤホン・ヘッドホン': '/categories/earphones/',
    };

    const mockElement = {
      textContent: JSON.stringify(mockCategoryData),
    };

    const mockDocument = {
      readyState: 'complete',
      getElementById: jest.fn((id: string) => {
        if (id === 'category-url-data') return mockElement;
        return null;
      }),
      querySelectorAll: jest.fn().mockReturnValue([]),
      addEventListener: jest.fn(),
    };

    const mockWindow = {
      matchMedia: jest.fn().mockReturnValue({
        matches: false,
        media: '',
        addEventListener: jest.fn(),
      }),
    };

    const context = vm.createContext({
      document: mockDocument,
      window: mockWindow,
      globalThis: mockWindow,
      console,
      setTimeout,
      clearTimeout,
    });

    vm.runInContext(filterCommonJsContent, context);

    const resolveExisting = vm.runInContext('getCategoryUrlFromName("イヤホン・ヘッドホン")', context);
    expect(resolveExisting).toBe('/categories/earphones/');

    const resolveFallback = vm.runInContext('getCategoryUrlFromName("未登録カテゴリ")', context);
    expect(resolveFallback).toBe(`/categories/${encodeURIComponent('未登録カテゴリ')}/`);

    const resolveEmpty = vm.runInContext('getCategoryUrlFromName("")', context);
    expect(resolveEmpty).toBe('');
  });

  it('price conversion utilities valueToPrice and priceToValue work correctly', () => {
    const context = vm.createContext({
      document: {
        readyState: 'complete',
        querySelectorAll: jest.fn().mockReturnValue([]),
        addEventListener: jest.fn(),
      },
      window: {},
      globalThis: {},
      console,
    });

    vm.runInContext(filterCommonJsContent, context);

    const priceMin = vm.runInContext('valueToPrice(0)', context);
    expect(priceMin).toBe(0);

    const priceMax = vm.runInContext('valueToPrice(1000)', context);
    expect(priceMax).toBe(200000);

    const bucketUnder3000 = vm.runInContext('getPriceBucket(2500)', context);
    expect(bucketUnder3000).toBe('under-3000');

    const bucketOver30000 = vm.runInContext('getPriceBucket(50000)', context);
    expect(bucketOver30000).toBe('30000-plus');
  });
});
