import fs from 'fs';
import path from 'path';

// Declare dummy interfaces/types if DOM lib is not included in tsconfig
declare const global: any;

describe('Article Reading Features (article-reading.js)', () => {
  let jsCode: string;

  beforeAll(() => {
    const jsPath = path.resolve(__dirname, '../../../static/js/article-reading.js');
    jsCode = fs.readFileSync(jsPath, 'utf-8');
  });

  beforeEach(() => {
    // Basic DOM-like mock in Node/Jest environment
    const storageMap = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => storageMap.get(key) || null,
      setItem: (key: string, value: string) => storageMap.set(key, value),
      clear: () => storageMap.clear(),
    };

    (global as any).localStorage = mockLocalStorage;
    (global as any).window = {
      innerHeight: 1000,
      scrollY: 100,
      addEventListener: jest.fn(),
      requestAnimationFrame: (cb: Function) => cb(),
    };
  });

  test('article-reading.js file exists and can be loaded', () => {
    expect(jsCode).toContain('scroll-progress-bar');
    expect(jsCode).toContain('font-size-btn');
    expect(jsCode).toContain('article-font-size');
  });
});
