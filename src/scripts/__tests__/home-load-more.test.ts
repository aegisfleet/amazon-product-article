import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

interface IndexItem {
  permalink: string;
  title: string;
  specs_html?: string;
  specs_json?: string;
  categories?: string[];
  category_url?: string;
  summary?: string;
  image?: string;
  price?: string;
  price_value?: number;
  score?: number;
  last_investigated?: string;
  asin?: string;
  parent_asin?: string;
  affiliate_url?: string;
  savings_percentage?: number | null;
  availability?: string;
  in_stock?: boolean;
}

interface MappedProduct {
  url: string;
  title: string;
  image: string;
  category: string;
  categoryUrl: string;
  description: string;
  price: string;
  priceRaw: number;
  score: number;
  lastInvestigated: string;
  asin: string;
  parentAsin: string;
  affiliateUrl: string;
  savingsPercentage: number | null;
  availability: string;
  inStock: boolean;
  specsHtml: string;
}

describe('home-load-more mapIndexItemToProduct', () => {
  let mapIndexItemToProduct: (item: IndexItem) => MappedProduct;

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../../static/js/home-load-more.js');
    const content = fs.readFileSync(filePath, 'utf8');

    const context = vm.createContext({
      document: undefined,
      window: {},
      globalThis: {},
      console,
    });

    vm.runInContext(content, context);
    mapIndexItemToProduct = vm.runInContext('mapIndexItemToProduct', context) as (item: IndexItem) => MappedProduct;
  });

  it('uses item.specs_html when provided', () => {
    const item: IndexItem = {
      permalink: '/articles/test/',
      title: 'テスト商品',
      specs_html: '<span class="card-spec-tag">重量: 1000g</span><span class="card-spec-tag">容量: 1kg</span>',
      specs_json: JSON.stringify({ その他: '長文データ', 重量: '1000g' }),
    };

    const result = mapIndexItemToProduct(item);
    expect(result.specsHtml).toBe(
      '<span class="card-spec-tag">重量: 1000g</span><span class="card-spec-tag">容量: 1kg</span>',
    );
    expect(result.specsHtml).not.toContain('その他');
  });

  it('falls back to specs_json with strict ordering and excludes "その他"', () => {
    const rawSpecs = {
      その他: 'ライフステージ: オールライフステージ / 主原料: 生肉',
      サイズ: '280mm × 180mm × 80mm',
      容量: '1kg',
      素材: 'ドッグフード',
      重量: '1000g',
      OS: '不明',
    };

    const item: IndexItem = {
      permalink: '/articles/dog-food/',
      title: 'POCHI ドッグフード',
      specs_json: JSON.stringify(rawSpecs),
    };

    const result = mapIndexItemToProduct(item);

    // "その他" と "不明" は除外されること
    expect(result.specsHtml).not.toContain('その他');
    expect(result.specsHtml).not.toContain('ライフステージ');
    expect(result.specsHtml).not.toContain('OS: 不明');

    // 定義された優先順（重量 -> 容量 -> 素材 -> サイズ）で並んでいること
    const expectedOrder = [
      '<span class="card-spec-tag">重量: 1000g</span>',
      '<span class="card-spec-tag">容量: 1kg</span>',
      '<span class="card-spec-tag">素材: ドッグフード</span>',
      '<span class="card-spec-tag">サイズ: 280mm × 180mm × 80mm</span>',
    ].join('');

    expect(result.specsHtml).toBe(expectedOrder);
  });

  it('escapes special HTML characters in fallback specs_json', () => {
    const item: IndexItem = {
      permalink: '/articles/test/',
      title: 'エスケープテスト',
      specs_json: JSON.stringify({
        画面: '6.1" <OLED> & HDR',
      }),
    };

    const result = mapIndexItemToProduct(item);
    expect(result.specsHtml).toBe('<span class="card-spec-tag">画面: 6.1&quot; &lt;OLED&gt; &amp; HDR</span>');
  });

  it('returns empty specsHtml when neither specs_html nor specs_json is provided', () => {
    const item: IndexItem = {
      permalink: '/articles/test/',
      title: 'スペックなし商品',
    };

    const result = mapIndexItemToProduct(item);
    expect(result.specsHtml).toBe('');
  });
});
