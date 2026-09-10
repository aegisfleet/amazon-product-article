import type { Product } from '../../types/Product';
import { InvestigationPromptBuilder } from '../InvestigationPromptBuilder';

describe('InvestigationPromptBuilder', () => {
  const baseProduct: Product = {
    asin: 'B0TESTASIN1',
    title: 'テスト用ペット給水ボトル',
    category: '犬用水入れ・ウォーターボトル',
    price: {
      amount: 1500,
      currency: 'JPY',
      formatted: '￥1,500',
    },
    images: {
      primary: 'https://example.com/primary.jpg',
      thumbnails: [],
    },
    specifications: {
      color: 'ピンク',
      size: '700ml',
    },
    rating: {
      average: 4.0,
      count: 10,
    },
  };

  it('should include features when product has features', () => {
    const productWithFeatures: Product = {
      ...baseProduct,
      features: ['約285mlの水を収納できるコンパクト設計', '片手で操作できる2WAY仕様'],
    };

    const builder = new InvestigationPromptBuilder(productWithFeatures);
    const prompt = builder.build();

    expect(prompt).toContain('- 商品特徴 (箇条書き):');
    expect(prompt).toContain('  - 約285mlの水を収納できるコンパクト設計');
    expect(prompt).toContain('  - 片手で操作できる2WAY仕様');
  });

  it('should not include features section when product features are empty or undefined', () => {
    const builderEmpty = new InvestigationPromptBuilder({
      ...baseProduct,
      features: [],
    });
    expect(builderEmpty.build()).not.toContain('- 商品特徴 (箇条書き):');

    const builderUndefined = new InvestigationPromptBuilder(baseProduct);
    expect(builderUndefined.build()).not.toContain('- 商品特徴 (箇条書き):');
  });

  it('should include conflict verification and physical consistency instruction in prompt', () => {
    const builder = new InvestigationPromptBuilder(baseProduct);
    const prompt = builder.build();

    expect(prompt).toContain('仕様値と商品特徴（features）・寸法の数値乖離・物理的整合性の検証義務');
    expect(prompt).toContain('仕様項目を無批判に真実と信じてはならない');
  });
});
