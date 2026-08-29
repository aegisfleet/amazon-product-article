import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { CompareHelper, type CompareItem } from '../CompareHelper';

describe('CompareHelper', () => {
  const sampleItems: CompareItem[] = [
    {
      asin: 'ASIN001',
      title: '商品A',
      url: '/articles/asin001/',
      affiliateUrl: 'https://amazon.co.jp/dp/ASIN001',
      image: 'https://example.com/a.jpg',
      price: '￥3,555',
      priceNum: 3555,
      score: 85,
      savingsPercentage: 20,
      category: 'PC',
      specs: { 重量: '120g', 素材: 'ABS' },
      addedAt: 1000,
    },
    {
      asin: 'ASIN002',
      title: '商品B',
      url: '/articles/asin002/',
      affiliateUrl: 'https://amazon.co.jp/dp/ASIN002',
      image: 'https://example.com/b.jpg',
      price: '￥2,980',
      priceNum: 2980,
      score: 90,
      savingsPercentage: 10,
      category: 'PC',
      specs: { 重量: '150g', サイズ: '10x5cm' },
      addedAt: 2000,
    },
    {
      asin: 'ASIN003',
      title: '商品C',
      url: '/articles/asin003/',
      affiliateUrl: 'https://amazon.co.jp/dp/ASIN003',
      image: 'https://example.com/c.jpg',
      price: '￥5,000',
      priceNum: 5000,
      score: 90,
      savingsPercentage: 0,
      category: 'PC',
      specs: { 素材: 'アルミ', サイズ: '12x6cm' },
      addedAt: 3000,
    },
  ];

  describe('parsePrice', () => {
    it('正しい価格数値を取り出すこと', () => {
      expect(CompareHelper.parsePrice('￥3,555')).toBe(3555);
      expect(CompareHelper.parsePrice('3,555円')).toBe(3555);
      expect(CompareHelper.parsePrice('オープン価格')).toBe(0);
      expect(CompareHelper.parsePrice('')).toBe(0);
    });
  });

  describe('findBestScoreAsins', () => {
    it('最高スコアのASINリストを返すこと', () => {
      const best = CompareHelper.findBestScoreAsins(sampleItems);
      expect(best).toEqual(['ASIN002', 'ASIN003']);
    });

    it('アイテムが空の場合は空配列を返すこと', () => {
      expect(CompareHelper.findBestScoreAsins([])).toEqual([]);
    });

    it('スコアが全件0の場合は空配列を返すこと', () => {
      const zeroItems = sampleItems.map((item) => ({ ...item, score: 0 }));
      expect(CompareHelper.findBestScoreAsins(zeroItems)).toEqual([]);
    });
  });

  describe('findLowestPriceAsins', () => {
    it('最安価格のASINリストを返すこと', () => {
      const lowest = CompareHelper.findLowestPriceAsins(sampleItems);
      expect(lowest).toEqual(['ASIN002']);
    });

    it('アイテムが空の場合は空配列を返すこと', () => {
      expect(CompareHelper.findLowestPriceAsins([])).toEqual([]);
    });

    it('価格がすべて0（不明）の場合は空配列を返すこと', () => {
      const zeroPriceItems = sampleItems.map((item) => ({ ...item, priceNum: 0 }));
      expect(CompareHelper.findLowestPriceAsins(zeroPriceItems)).toEqual([]);
    });
  });

  describe('getAllSpecKeys', () => {
    it('全アイテムのスペックキーを重複なく収集すること', () => {
      const keys = CompareHelper.getAllSpecKeys(sampleItems);
      expect(keys).toEqual(['重量', '素材', 'サイズ']);
    });
  });

  describe('compare.js client-side behavior', () => {
    let compareJsContent: string;

    beforeAll(() => {
      const compareJsPath = path.join(__dirname, '../../../static/js/compare.js');
      compareJsContent = fs.readFileSync(compareJsPath, 'utf8');
    });

    function MockElement() {}

    const createMockElement = (tagName: string, className = '', dataset: Record<string, string> = {}) => {
      const children: any[] = [];
      const attrs: Record<string, string> = {};
      const el: any = Object.create(MockElement.prototype);
      el.tagName = tagName.toUpperCase();
      el.className = className;
      el.dataset = dataset;
      el.style = {
        setProperty: jest.fn(),
        removeProperty: jest.fn(),
      };
      el.classList = {
        add: jest.fn((c: string) => {
          if (!el.className.includes(c)) el.className += ` ${c}`;
        }),
        remove: jest.fn((c: string) => {
          el.className = el.className.replace(c, '').trim();
        }),
        toggle: jest.fn((c: string, force?: boolean) => {
          const has = el.className.includes(c);
          const next = force !== undefined ? force : !has;
          if (next && !has) el.className += ` ${c}`;
          if (!next && has) el.className = el.className.replace(c, '').trim();
          return next;
        }),
        contains: jest.fn((c: string) => el.className.includes(c)),
      };
      el.setAttribute = jest.fn((k: string, v: string) => {
        attrs[k] = v;
      });
      el.getAttribute = jest.fn((k: string) => attrs[k] || null);
      el.appendChild = jest.fn((child: any) => {
        children.push(child);
      });
      el.querySelector = jest.fn(() => null);
      el.querySelectorAll = jest.fn(() => []);
      el.closest = jest.fn((selector: string) => {
        if (selector === '[data-compare-btn]' && el.dataset.compareBtn) return el;
        return null;
      });
      el.click = () => {
        if (clickListener) {
          clickListener({
            target: el,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
          });
        }
      };
      return el;
    };

    let clickListener: ((e: any) => void) | null = null;
    let mockStorage: Record<string, string> = {};
    let mockElements: any[] = [];

    const runScriptWithDOM = (initialStorage: Record<string, string> = {}) => {
      mockStorage = { ...initialStorage };
      mockElements = [];
      clickListener = null;

      const elementRegistry: Record<string, any> = {};

      const mockDocument: any = {
        addEventListener: jest.fn((event: string, handler: (e: any) => void) => {
          if (event === 'click') {
            clickListener = handler;
          }
        }),
        body: {
          appendChild: jest.fn((el: any) => {
            mockElements.push(el);
            if (el.id) elementRegistry[el.id] = el;
          }),
          style: {},
        },
        getElementById: jest.fn((id: string) => {
          if (elementRegistry[id]) return elementRegistry[id];
          const found = mockElements.find((e) => e.id === id);
          if (found) return found;
          const placeholder = createMockElement('div');
          placeholder.id = id;
          elementRegistry[id] = placeholder;
          return placeholder;
        }),
        querySelector: jest.fn((sel: string) => {
          if (sel.includes('.btn-compare-hero')) {
            return mockElements.find((e) => e.className.includes('btn-compare-hero')) || null;
          }
          return null;
        }),
        querySelectorAll: jest.fn((sel: string) => {
          if (sel === '[data-compare-btn]') {
            return mockElements.filter((e) => e.dataset.compareBtn);
          }
          return [];
        }),
        createElement: jest.fn((tag: string) => {
          const el = createMockElement(tag);
          return el;
        }),
      };

      const localStorageMock = {
        getItem: jest.fn((key: string) => mockStorage[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete mockStorage[key];
        }),
      };

      const sandbox: any = {
        document: mockDocument,
        window: {
          addEventListener: jest.fn(),
        },
        localStorage: localStorageMock,
        console: console,
        setTimeout: jest.fn((cb: () => void) => cb()),
        CustomEvent: class CustomEvent {},
        Element: MockElement,
      };
      sandbox.globalThis = sandbox;

      vm.runInNewContext(compareJsContent, sandbox);
      return { mockDocument, sandbox };
    };

    it('比較リストが空の状態で競合商品の比較ボタンを押すと、メイン商品（Hero）と競合商品の両方が登録されること', () => {
      runScriptWithDOM();

      const heroBtn = createMockElement('button', 'btn-compare-hero', {
        compareBtn: '1',
        asin: 'HERO_ASIN_001',
        title: 'メイン商品A',
        price: '￥5,000',
        score: '85',
        category: 'イヤホン',
      });
      mockElements.push(heroBtn);

      const competitorBtn = createMockElement('button', 'btn-compare-card', {
        compareBtn: '1',
        asin: 'COMP_ASIN_002',
        title: '競合商品B',
        price: '￥4,500',
        score: '90',
        category: 'イヤホン',
      });
      mockElements.push(competitorBtn);

      competitorBtn.click();

      const list = JSON.parse(mockStorage['apa-compare-v1'] || '[]');
      expect(list).toHaveLength(2);
      expect(list[0].asin).toBe('HERO_ASIN_001');
      expect(list[0].title).toBe('メイン商品A');
      expect(list[1].asin).toBe('COMP_ASIN_002');
      expect(list[1].title).toBe('競合商品B');
    });

    it('メイン商品（Hero）の比較ボタンを押した場合はメイン商品のみが1件追加されること', () => {
      runScriptWithDOM();

      const heroBtn = createMockElement('button', 'btn-compare-hero', {
        compareBtn: '1',
        asin: 'HERO_ASIN_001',
        title: 'メイン商品A',
      });
      mockElements.push(heroBtn);

      heroBtn.click();

      const list = JSON.parse(mockStorage['apa-compare-v1'] || '[]');
      expect(list).toHaveLength(1);
      expect(list[0].asin).toBe('HERO_ASIN_001');
    });

    it('既に商品が1件登録されている場合は、競合商品のみが追加されること', () => {
      const initial = {
        'apa-compare-v1': JSON.stringify([
          {
            asin: 'OTHER_ASIN_999',
            title: '別商品X',
            price: '￥1,000',
            priceNum: 1000,
            score: 70,
            savingsPercentage: 0,
            category: 'イヤホン',
            specs: {},
            addedAt: 1,
          },
        ]),
      };
      runScriptWithDOM(initial);

      const heroBtn = createMockElement('button', 'btn-compare-hero', {
        compareBtn: '1',
        asin: 'HERO_ASIN_001',
        title: 'メイン商品A',
      });
      mockElements.push(heroBtn);

      const competitorBtn = createMockElement('button', 'btn-compare-card', {
        compareBtn: '1',
        asin: 'COMP_ASIN_002',
        title: '競合商品B',
      });
      mockElements.push(competitorBtn);

      competitorBtn.click();

      const list = JSON.parse(mockStorage['apa-compare-v1'] || '[]');
      expect(list).toHaveLength(2);
      expect(list[0].asin).toBe('OTHER_ASIN_999');
      expect(list[1].asin).toBe('COMP_ASIN_002');
    });
  });
});
