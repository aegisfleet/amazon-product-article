import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

describe('Responsive Search Placeholder', () => {
  let filterCommonJsContent: string;

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../../static/js/filter-common.js');
    filterCommonJsContent = fs.readFileSync(filePath, 'utf8');
  });

  it('switches placeholder based on media query', () => {
    let mediaQueryListener: ((e: any) => void) | null = null;
    let isMatches = false;

    const mockInput = {
      placeholder: '商品名、ブランド、カテゴリ、商品説明などから検索...',
      dataset: {
        placeholderFull: '商品名、ブランド、カテゴリ、商品説明などから検索...',
        placeholderMobile: '商品名・ブランドで検索...',
      },
      getAttribute(name: string) {
        if (name === 'placeholder') return this.placeholder;
        return null;
      },
    };

    const mockDocument = {
      readyState: 'complete',
      querySelectorAll(selector: string) {
        if (selector === 'input[data-placeholder-mobile]') {
          return [mockInput];
        }
        return [];
      },
      addEventListener: jest.fn(),
    };

    const mockWindow = {
      matchMedia: jest.fn().mockImplementation((query: string) => ({
        matches: isMatches,
        media: query,
        addEventListener: jest.fn((event, handler) => {
          if (event === 'change') mediaQueryListener = handler;
        }),
        addListener: jest.fn((handler) => {
          mediaQueryListener = handler;
        }),
      })),
    };

    const context = vm.createContext({
      document: mockDocument,
      window: mockWindow,
      console,
      setTimeout,
      clearTimeout,
    });

    vm.runInContext(filterCommonJsContent, context);

    // Initial desktop check: should have full placeholder
    expect(mockInput.placeholder).toBe('商品名、ブランド、カテゴリ、商品説明などから検索...');

    // Simulate mobile viewport
    isMatches = true;
    if (mediaQueryListener) {
      (mediaQueryListener as any)({ matches: true });
    } else {
      vm.runInContext('setupResponsivePlaceholders()', context);
    }

    expect(mockInput.placeholder).toBe('商品名・ブランドで検索...');

    // Simulate switching back to desktop
    isMatches = false;
    if (mediaQueryListener) {
      (mediaQueryListener as any)({ matches: false });
    } else {
      vm.runInContext('setupResponsivePlaceholders()', context);
    }

    expect(mockInput.placeholder).toBe('商品名、ブランド、カテゴリ、商品説明などから検索...');
  });
});
