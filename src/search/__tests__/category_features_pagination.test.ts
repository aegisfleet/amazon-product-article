import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

describe('category-features.js progressive reveal', () => {
  let filterCommonJs: string;
  let categoryFeaturesJs: string;

  beforeAll(() => {
    filterCommonJs = fs.readFileSync(path.join(__dirname, '../../../static/js/filter-common.js'), 'utf8');
    categoryFeaturesJs = fs.readFileSync(path.join(__dirname, '../../../static/js/category-features.js'), 'utf8');
  });

  interface MockCard {
    className: string;
    dataset: Record<string, string>;
    style: { display: string };
    querySelector: jest.Mock;
    querySelectorAll: jest.Mock;
  }

  function createMockCard(index: number): MockCard {
    return {
      className: 'card',
      dataset: {
        price: String((index + 1) * 1000),
        score: '80',
        categories: 'test-category',
        specs: '',
        hasDeal: 'false',
        date: String(Date.now()),
      },
      style: { display: '' },
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
    };
  }

  it('initially displays up to 30 items and hides the rest, then reveals more on click', () => {
    // 70個のカード要素を用意
    const cards: MockCard[] = [];
    for (let i = 0; i < 70; i++) {
      cards.push(createMockCard(i));
    }

    const mockLoadMoreContainer = {
      style: { display: 'none' },
    };

    let buttonClickHandler: (() => void) | null = null;
    const mockLoadMoreBtn = {
      textContent: '',
      addEventListener: jest.fn((event: string, handler: () => void) => {
        if (event === 'click') {
          buttonClickHandler = handler;
        }
      }),
    };

    const mockProductGrid = {
      querySelectorAll: jest.fn((sel: string) => {
        if (sel === '.card') return [...cards];
        return [];
      }),
      addEventListener: jest.fn(),
      innerHTML: '',
      appendChild: jest.fn(),
    };

    const mockProductCount = {
      textContent: '',
    };

    const elementsById: Record<string, any> = {
      'product-grid': mockProductGrid,
      'product-count': mockProductCount,
      'category-load-more-container': mockLoadMoreContainer,
      'category-load-more-btn': mockLoadMoreBtn,
    };

    const context = vm.createContext({
      document: {
        readyState: 'complete',
        getElementById: jest.fn((id: string) => elementsById[id] || null),
        querySelectorAll: jest.fn(() => []),
        querySelector: jest.fn(() => null),
        addEventListener: jest.fn(),
      },
      globalThis: {
        location: { search: '', pathname: '/test-cat/' },
        history: { replaceState: jest.fn() },
        addEventListener: jest.fn(),
      },
      URLSearchParams,
      IntersectionObserver: class {
        observe = jest.fn();
        disconnect = jest.fn();
      },
      console,
    });

    // 共通スクリプトおよびcategory-featuresを実行
    vm.runInContext(filterCommonJs, context);
    vm.runInContext(categoryFeaturesJs, context);

    // 検証1: 初期表示で先頭30件が表示され、31件目以降は非表示
    const visibleInitially = cards.filter((c) => c.style.display !== 'none');
    const hiddenInitially = cards.filter((c) => c.style.display === 'none');

    expect(visibleInitially).toHaveLength(30);
    expect(hiddenInitially).toHaveLength(40);
    expect(mockLoadMoreContainer.style.display).toBe('flex');
    expect(mockLoadMoreBtn.textContent).toBe('さらに読み込む (30 / 70件)');
    expect(mockProductCount.textContent).toBe('70 件の商品');

    // 検証2: 「さらに読み込む」ボタンをクリックすると次の30件（合計60件）が表示される
    expect(buttonClickHandler).toBeDefined();
    if (buttonClickHandler) {
      (buttonClickHandler as () => void)();
    }

    const visibleAfterFirstLoad = cards.filter((c) => c.style.display !== 'none');
    expect(visibleAfterFirstLoad).toHaveLength(60);
    expect(mockLoadMoreContainer.style.display).toBe('flex');
    expect(mockLoadMoreBtn.textContent).toBe('さらに読み込む (60 / 70件)');

    // 検証3: 再度クリックすると残り10件すべて表示され（合計70件）、ボタンが非表示になる
    if (buttonClickHandler) {
      (buttonClickHandler as () => void)();
    }

    const visibleAfterSecondLoad = cards.filter((c) => c.style.display !== 'none');
    expect(visibleAfterSecondLoad).toHaveLength(70);
    expect(mockLoadMoreContainer.style.display).toBe('none');
  });

  it('hides load more container when total cards are 30 or less', () => {
    const cards: MockCard[] = [];
    for (let i = 0; i < 25; i++) {
      cards.push(createMockCard(i));
    }

    const mockLoadMoreContainer = {
      style: { display: 'none' },
    };

    const mockLoadMoreBtn = {
      textContent: '',
      addEventListener: jest.fn(),
    };

    const mockProductGrid = {
      querySelectorAll: jest.fn((sel: string) => {
        if (sel === '.card') return [...cards];
        return [];
      }),
      addEventListener: jest.fn(),
      innerHTML: '',
      appendChild: jest.fn(),
    };

    const mockProductCount = {
      textContent: '',
    };

    const elementsById: Record<string, any> = {
      'product-grid': mockProductGrid,
      'product-count': mockProductCount,
      'category-load-more-container': mockLoadMoreContainer,
      'category-load-more-btn': mockLoadMoreBtn,
    };

    const context = vm.createContext({
      document: {
        readyState: 'complete',
        getElementById: jest.fn((id: string) => elementsById[id] || null),
        querySelectorAll: jest.fn(() => []),
        querySelector: jest.fn(() => null),
        addEventListener: jest.fn(),
      },
      globalThis: {
        location: { search: '', pathname: '/test-cat/' },
        history: { replaceState: jest.fn() },
        addEventListener: jest.fn(),
      },
      URLSearchParams,
      IntersectionObserver: class {
        observe = jest.fn();
        disconnect = jest.fn();
      },
      console,
    });

    vm.runInContext(filterCommonJs, context);
    vm.runInContext(categoryFeaturesJs, context);

    const visibleInitially = cards.filter((c) => c.style.display !== 'none');
    expect(visibleInitially).toHaveLength(25);
    expect(mockLoadMoreContainer.style.display).toBe('none');
  });
});
