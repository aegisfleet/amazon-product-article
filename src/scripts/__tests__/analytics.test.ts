/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for GA4 outbound click classification, position resolution, and payload extraction
 */

const Analytics = require('../../../static/js/analytics.js');

describe('Analytics outbound click tracking logic', () => {
  describe('classifyOutboundLink', () => {
    it('Amazon直リンク（amazon.co.jp / amzn.to）または data-mall="amazon" を amazon として判定すること', () => {
      expect(
        Analytics.classifyOutboundLink({
          href: 'https://www.amazon.co.jp/dp/B08N5WRWNW?tag=aegis-22',
          dataset: { mall: 'amazon', trackProduct: '1' },
        }),
      ).toEqual({ type: 'amazon', mall: 'amazon' });

      expect(
        Analytics.classifyOutboundLink({
          href: 'https://www.amazon.co.jp/dp/B08N5WRWNW?tag=aegis-22',
          dataset: {},
        }),
      ).toEqual({ type: 'amazon', mall: 'amazon' });

      expect(
        Analytics.classifyOutboundLink({
          href: 'https://amzn.to/3xyzABC',
          dataset: {},
        }),
      ).toEqual({ type: 'amazon', mall: 'amazon' });
    });

    it('楽天市場・Yahoo!ショッピング（もしも経由含む）を mall として分離判定すること', () => {
      expect(
        Analytics.classifyOutboundLink({
          href: 'https://af.moshimo.com/af/c/click?a_id=123&p_id=54&url=https%3A%2F%2Fsearch.rakuten.co.jp%2F',
          dataset: { mall: 'rakuten', trackProduct: '1' },
        }),
      ).toEqual({ type: 'mall', mall: 'rakuten' });

      expect(
        Analytics.classifyOutboundLink({
          href: 'https://af.moshimo.com/af/c/click?a_id=456&p_id=1225&url=https%3A%2F%2Fshopping.yahoo.co.jp%2F',
          dataset: { mall: 'yahoo', trackProduct: '1' },
        }),
      ).toEqual({ type: 'mall', mall: 'yahoo' });
    });

    it('サイト内の商品詳細ページへの内部リンク（data-track-product="1" 付き）を internal として除外すること', () => {
      expect(
        Analytics.classifyOutboundLink({
          href: 'https://www.amazon-hikaku.com/b08n5wrwnw/',
          dataset: { trackProduct: '1', asin: 'B08N5WRWNW' },
        }),
      ).toEqual({ type: 'internal', mall: '' });

      expect(
        Analytics.classifyOutboundLink({
          href: '/b08n5wrwnw/',
          dataset: { trackProduct: '1', asin: 'B08N5WRWNW' },
        }),
      ).toEqual({ type: 'internal', mall: '' });
    });
  });

  describe('resolveCtaPosition', () => {
    it('data-position 属性が明示されている場合はその文字列を最優先で返すこと', () => {
      const link = {
        dataset: { position: 'sticky' },
        closest: () => null,
      };
      expect(Analytics.resolveCtaPosition(link, 40)).toBe('sticky');
    });

    it('data-position が未指定でも親コンテナから意味のある位置名（hero / final / competitor / mid_article / card）を推定すること', () => {
      const makeLinkWithContainer = (matchedSelector: string) => ({
        dataset: {},
        closest: (selector: string) => (selector.includes(matchedSelector) ? {} : null),
      });

      expect(Analytics.resolveCtaPosition(makeLinkWithContainer('.product-hero-card'), 0)).toBe('hero');
      expect(Analytics.resolveCtaPosition(makeLinkWithContainer('#sticky-cta-bar'), 10)).toBe('sticky');
      expect(Analytics.resolveCtaPosition(makeLinkWithContainer('.final-recommendation-section'), 5)).toBe('final');
      expect(Analytics.resolveCtaPosition(makeLinkWithContainer('.competitor-card'), 3)).toBe('competitor');
      expect(Analytics.resolveCtaPosition(makeLinkWithContainer('.compare-modal'), 7)).toBe('compare_modal');
      expect(Analytics.resolveCtaPosition(makeLinkWithContainer('.article-body'), 4)).toBe('mid_article');
      expect(Analytics.resolveCtaPosition(makeLinkWithContainer('.card'), 8)).toBe('card');
    });

    it('data-position も該当親コンテナもない場合はフォールバックの数値インデックスを返すこと', () => {
      const link = {
        dataset: {},
        closest: () => null,
      };
      expect(Analytics.resolveCtaPosition(link, 2)).toBe(2);
    });
  });

  describe('extractOutboundPayload', () => {
    it('リンク自身の data-* 属性（data-title 含む）から正しくペイロードを構築すること', () => {
      const link = {
        href: 'https://www.amazon.co.jp/dp/B08N5WRWNW?tag=aegis-22',
        dataset: {
          asin: 'B08N5WRWNW',
          title: 'テストイヤホン',
          category: 'イヤホン',
          price: '¥12,800',
          priceBucket: '7000-14999',
          score: '88',
          position: 'hero',
        },
        closest: () => null,
      };

      const payload = Analytics.extractOutboundPayload(link, null, 0);
      expect(payload).toEqual({
        asin: 'B08N5WRWNW',
        product_name: 'テストイヤホン',
        category: 'イヤホン',
        price: '¥12,800',
        price_bucket: '7000-14999',
        score: 88,
        position: 'hero',
      });
    });

    it('本文中の Amazon リンク等で data-* 属性が不足している場合、URL の ASIN およびページのメタデータで補完すること', () => {
      const link = {
        href: 'https://www.amazon.co.jp/dp/B08N5WRWNW?tag=aegis-22',
        dataset: {},
        closest: (selector: string) => (selector.includes('.article-body') ? {} : null),
      };
      const pageMeta = {
        asin: 'B08N5WRWNW',
        productTitle: 'テストイヤホン',
        category: 'イヤホン',
        price: '¥12,800',
        priceBucket: '7000-14999',
        score: '88',
      };

      const payload = Analytics.extractOutboundPayload(link, pageMeta, 3);
      expect(payload).toEqual({
        asin: 'B08N5WRWNW',
        product_name: 'テストイヤホン',
        category: 'イヤホン',
        price: '¥12,800',
        price_bucket: '7000-14999',
        score: 88,
        position: 'mid_article',
      });
    });

    it('競合比較カードのように別 ASIN のリンクで data-* がない場合は、ページの価格・商品名を混同せず URL から ASIN を抽出すること', () => {
      const link = {
        href: 'https://www.amazon.co.jp/dp/B09COMPET1?tag=aegis-22',
        dataset: {},
        closest: (selector: string) => (selector.includes('.competitor-card') ? {} : null),
      };
      const pageMeta = {
        asin: 'B08N5WRWNW',
        productTitle: 'メイン商品',
        category: 'イヤホン',
        price: '¥12,800',
        priceBucket: '7000-14999',
        score: '88',
      };

      const payload = Analytics.extractOutboundPayload(link, pageMeta, 4);
      expect(payload.asin).toBe('B09COMPET1');
      expect(payload.category).toBe('イヤホン');
      expect(payload.position).toBe('competitor');
      expect(payload.price).toBe('');
    });
  });
});
