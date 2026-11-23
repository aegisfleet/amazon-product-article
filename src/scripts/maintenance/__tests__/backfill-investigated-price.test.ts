import {
  applyInvestigatedPriceToInvestigation,
  extractValidPriceFormatted,
  type InvestigationJsonLike,
} from '../backfill-investigated-price';

describe('extractValidPriceFormatted', () => {
  it('returns formatted price when amount and formatted string are valid', () => {
    expect(extractValidPriceFormatted({ amount: 1760, formatted: '￥1,760' })).toBe('￥1,760');
  });

  it('returns null for missing, zero, or 価格情報なし', () => {
    expect(extractValidPriceFormatted(undefined)).toBeNull();
    expect(extractValidPriceFormatted({ amount: 0, formatted: '価格情報なし' })).toBeNull();
    expect(extractValidPriceFormatted({ amount: 0, formatted: '￥0' })).toBeNull();
    expect(extractValidPriceFormatted({ amount: 100, formatted: '' })).toBeNull();
  });
});

describe('applyInvestigatedPriceToInvestigation', () => {
  it('sets analysis.investigatedPrice when missing and cache has valid price', () => {
    const inv: InvestigationJsonLike = {
      analysis: { productName: 'Sample' },
    };
    const result = applyInvestigatedPriceToInvestigation(inv, {
      data: { price: { amount: 2400, formatted: '￥2,400' } },
    });

    expect(result).toEqual({ updated: true });
    expect(inv.analysis?.investigatedPrice).toBe('￥2,400');
  });

  it('skips when investigatedPrice already exists', () => {
    const inv: InvestigationJsonLike = {
      analysis: { productName: 'Existing', investigatedPrice: '￥2,085' },
    };
    const result = applyInvestigatedPriceToInvestigation(inv, {
      data: { price: { amount: 2400, formatted: '￥2,400' } },
    });

    expect(result).toEqual({ updated: false, reason: 'already_exists' });
    expect(inv.analysis?.investigatedPrice).toBe('￥2,085');
  });

  it('skips when cache is missing or price is invalid', () => {
    const inv1: InvestigationJsonLike = { analysis: { productName: 'NoCache' } };
    expect(applyInvestigatedPriceToInvestigation(inv1, undefined)).toEqual({
      updated: false,
      reason: 'no_cache',
    });

    const inv2: InvestigationJsonLike = { analysis: { productName: 'Invalid' } };
    expect(
      applyInvestigatedPriceToInvestigation(inv2, {
        data: { price: { amount: 0, formatted: '価格情報なし' } },
      }),
    ).toEqual({
      updated: false,
      reason: 'invalid_price',
    });
  });

  it('skips when analysis object is missing', () => {
    const inv: InvestigationJsonLike = {};
    expect(applyInvestigatedPriceToInvestigation(inv, undefined)).toEqual({
      updated: false,
      reason: 'no_analysis',
    });
  });
});
