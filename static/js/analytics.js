/**
 * analytics.js
 * GA4 カスタムイベント — Amazon商品比較サイト用トラッキング
 *
 * 実装イベント:
 *   1. amazon_outbound_click  (最重要キーイベント)
 *   2. product_detail_view
 *   3. category_click
 *   4. ranking_item_click
 *   5. favorite_add
 *   6. site_search
 *   7. compare_filter_use
 *   8. home_entry_click       (home-hero-entry-tracking.js から統合)
 */
(function () {
    'use strict';

    // ---- GA4 イベント送信ユーティリティ ----

    /**
     * GA4 にイベントを送信する。
     * gtag が未ロードの場合は dataLayer.push() にフォールバックする。
     * @param {string} eventName
     * @param {Record<string, unknown>} params
     */
    function sendEvent(eventName, params) {
        if (!eventName) return;
        try {
            if (typeof globalThis.gtag === 'function') {
                globalThis.gtag('event', eventName, params);
            } else {
                globalThis.dataLayer = globalThis.dataLayer || [];
                globalThis.dataLayer.push(Object.assign({ event: eventName }, params));
            }
        } catch (e) {
            // トラッキングエラーはサイト動作に影響させない
        }
    }

    // ---- ページタイプ判定 ----

    /**
     * 現在のページタイプを返す。
     * <meta name="page-type"> の content 属性で判定する。
     * @returns {'product' | 'category' | 'home' | 'other'}
     */
    function getPageType() {
        const meta = document.querySelector('meta[name="page-type"]');
        if (meta) return /** @type {any} */ (meta.getAttribute('content') || 'other');
        if (document.body.classList.contains('page-home')) return 'home';
        const path = globalThis.location.pathname;
        if (path === '/' || path === '') return 'home';
        if (path.startsWith('/categories/') || path.startsWith('/parent-category/')) return 'category';
        if (path.startsWith('/articles/')) return 'product';
        return 'other';
    }

    // ---- 1. amazon_outbound_click / mall_outbound_click ----

    /**
     * URL文字列から10桁のASINを抽出する。
     * @param {string} href
     * @returns {string}
     */
    function extractAsinFromUrl(href) {
        if (!href) return '';
        const match = String(href).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        return match?.[1] ? match[1].toUpperCase() : '';
    }

    /**
     * リンク要素が Amazon外部リンク / 他モール（楽天・Yahoo）外部リンク / サイト内リンク のいずれかを判定する。
     * @param {{ href?: string, dataset?: Record<string, string | undefined> }} link
     * @returns {{ type: 'amazon' | 'mall' | 'internal', mall: string }}
     */
    function classifyOutboundLink(link) {
        const dataset = link?.dataset || {};
        const href = String(link?.href || '');
        const mallAttr = (dataset.mall || '').toLowerCase();

        if (mallAttr === 'amazon' || /https?:\/\/(?:www\.)?(?:amazon\.co\.jp|amazon\.com|amzn\.to)\b/i.test(href)) {
            return { type: 'amazon', mall: 'amazon' };
        }
        if (mallAttr === 'rakuten' || /search\.rakuten\.co\.jp|hb\.afl\.rakuten\.co\.jp/i.test(href)) {
            return { type: 'mall', mall: 'rakuten' };
        }
        if (mallAttr === 'yahoo' || /shopping\.yahoo\.co\.jp/i.test(href)) {
            return { type: 'mall', mall: 'yahoo' };
        }
        if (/af\.moshimo\.com/i.test(href)) {
            return { type: 'mall', mall: mallAttr || 'moshimo' };
        }
        return { type: 'internal', mall: '' };
    }

    /**
     * クリックされたCTAリンクの位置識別子（hero / sticky / competitor / mid_article / final / card 等）を返す。
     * 明示指定も親コンテナもない場合はフォールバックの数値インデックスを返す。
     * @param {{ dataset?: Record<string, string | undefined>, closest?: (selector: string) => unknown }} link
     * @param {number} [fallbackIndex]
     * @returns {string | number | undefined}
     */
    function resolveCtaPosition(link, fallbackIndex) {
        const explicit = link?.dataset?.position;
        if (explicit) return explicit;

        if (typeof link?.closest === 'function') {
            if (link.closest('#sticky-cta-bar, .sticky-cta-bar')) return 'sticky';
            if (link.closest('.product-hero-card')) return 'hero';
            if (link.closest('.final-recommendation-section, .final-recommendation-action, #final-shop-buttons-container')) return 'final';
            if (link.closest('.competitor-card, .competitor-links')) return 'competitor';
            if (link.closest('.compare-modal, #compare-modal')) return 'compare_modal';
            if (link.closest('.article-body, .article-content')) return 'mid_article';
            if (link.closest('.card, .pickup-card, .rec-card, .price-drop-card')) return 'card';
        }

        return typeof fallbackIndex === 'number' && fallbackIndex >= 0 ? fallbackIndex : undefined;
    }

    /**
     * クリックされたリンクとページメタデータから送信用パラメータを構築する。
     * @param {{ href?: string, textContent?: string | null, dataset?: Record<string, string | undefined>, closest?: (selector: string) => unknown }} link
     * @param {Record<string, string | undefined> | null | undefined} pageMetaDataset
     * @param {number} [fallbackIndex]
     */
    function extractOutboundPayload(link, pageMetaDataset, fallbackIndex) {
        const dataset = link?.dataset || {};
        const href = String(link?.href || '');
        const urlAsin = extractAsinFromUrl(href);
        const asin = dataset.asin || urlAsin || pageMetaDataset?.asin || '';
        const isSameProduct = Boolean(
            pageMetaDataset?.asin && asin && asin.toUpperCase() === String(pageMetaDataset.asin).toUpperCase()
        );

        const pageTitle = isSameProduct ? (pageMetaDataset?.productTitle || pageMetaDataset?.productName || '') : '';
        const productName = dataset.productName || dataset.title || pageTitle || link?.textContent?.trim() || '';
        const category = dataset.category || pageMetaDataset?.category || '';
        const price = dataset.price || (isSameProduct ? (pageMetaDataset?.price || '') : '');
        const priceBucket = dataset.priceBucket || (isSameProduct ? (pageMetaDataset?.priceBucket || '') : '');
        const rawScore = dataset.score || (isSameProduct ? pageMetaDataset?.score : undefined);
        const score = rawScore !== undefined && rawScore !== '' ? Number(rawScore) : undefined;
        const position = resolveCtaPosition(link, fallbackIndex);

        return {
            asin: asin,
            product_name: productName,
            category: category,
            price: price,
            price_bucket: priceBucket,
            score: score,
            position: position,
        };
    }

    /**
     * Amazon アフィリエイトリンク（amazon_outbound_click）および
     * 他モールリンク（mall_outbound_click）のクリックをトラッキングする。
     * 内部リンク（.pickup-card や .card-title 等のサイト内遷移）は除外する。
     */
    function initAmazonOutboundClick() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const link = target.closest('a[href]');
            if (!(link instanceof HTMLAnchorElement)) return;

            const classification = classifyOutboundLink(link);
            if (classification.type === 'internal') return;

            const outboundCandidates = Array.from(
                document.querySelectorAll('a[data-track-product], a.btn-shop, a.affiliate-link, a.competitor-preview')
            ).filter(function (el) {
                return classifyOutboundLink(/** @type {HTMLAnchorElement} */ (el)).type !== 'internal';
            });
            const fallbackIndex = outboundCandidates.indexOf(link);
            const pageMeta = /** @type {HTMLElement | null} */ (
                document.querySelector('meta[name="page-type"][content="product"]')
            );
            const payload = extractOutboundPayload(link, pageMeta?.dataset || null, fallbackIndex);
            const eventParams = Object.assign({}, payload, {
                page_type: getPageType(),
                destination_url: link.href || '',
            });

            if (classification.type === 'amazon') {
                sendEvent('amazon_outbound_click', eventParams);
            } else if (classification.type === 'mall') {
                sendEvent(
                    'mall_outbound_click',
                    Object.assign({}, eventParams, { mall: classification.mall })
                );
            }
        });
    }

    // ---- 2. product_detail_view ----

    /**
     * 商品詳細ページ（<meta name="page-type" content="product">）でページロード時に発火。
     */
    function initProductDetailView() {
        const meta = document.querySelector('meta[name="page-type"][content="product"]');
        if (!meta) return;

        sendEvent('product_detail_view', {
            asin: meta.dataset.asin || '',
            product_name: meta.dataset.productTitle || document.title || '',
            category: meta.dataset.category || '',
            price: meta.dataset.price || '',
            price_bucket: meta.dataset.priceBucket || '',
            score: meta.dataset.score ? Number(meta.dataset.score) : undefined,
        });
    }

    // ---- 3. category_click ----

    /**
     * カテゴリタグ（.card-tag a, .card-tag リンク）のクリックをトラッキング。
     */
    function initCategoryClick() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const link = target.closest('.card-tag');
            if (!(link instanceof HTMLAnchorElement)) return;

            sendEvent('category_click', {
                category_name: link.textContent?.trim() || '',
                destination_url: link.href || '',
                source_page_type: getPageType(),
            });
        });
    }

    // ---- 4. ranking_item_click ----

    /**
     * ランキング・ピックアップカード（[data-ranking-item] 属性）のリンクをトラッキング。
     * list.html / index.html のピックアップセクションに data-ranking-item 属性を付与する前提。
     */
    function initRankingItemClick() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const item = target.closest('[data-ranking-item]');
            if (!(item instanceof HTMLElement)) return;
            // クリックされた要素がリンクまたはリンクの子でなければスキップ
            const link = target.closest('a');
            if (!link) return;

            sendEvent('ranking_item_click', {
                rank_position: item.dataset.rankPosition ? Number(item.dataset.rankPosition) : undefined,
                asin: item.dataset.asin || '',
                product_name: item.dataset.productName || '',
                category: item.dataset.category || '',
                score: item.dataset.score ? Number(item.dataset.score) : undefined,
                page_type: getPageType(),
            });
        });
    }

    // ---- 5. favorite_add (外部フック) ----

    /**
     * favorites.js から呼び出される。
     * favorites.js の addFavorite 実行時に window.ApaAnalytics.trackFavoriteAdd(data) を呼ぶ。
     * @param {object} data
     */
    function trackFavoriteAdd(data) {
        if (!data || !data.asin) return;
        sendEvent('favorite_add', {
            asin: data.asin || '',
            product_name: data.title || '',
            category: data.category || '',
            price: data.price || '',
            score: data.score ? Number(data.score) : undefined,
        });
    }

    // ---- 6. site_search ----

    /**
     * ホームページの検索ボックス（#search-input, #main-search 等）の入力をトラッキング。
     * デバウンスは 600ms。
     * category-features.js のキーワード検索（#keyword-search）は trackFilterSearch() で対応。
     */
    function initSiteSearch() {
        // ホームページ検索ボックス: search.js が扱う #search-input
        const searchInput = document.getElementById('search-input') ||
            document.getElementById('main-search') ||
            document.querySelector('input[type="search"][placeholder]');
        if (!searchInput) return;

        let debounceTimer;
        searchInput.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            const term = this.value.trim();
            debounceTimer = setTimeout(function () {
                if (!term) return;
                sendEvent('site_search', {
                    search_term: term,
                    page_type: getPageType(),
                });
            }, 600);
        });
    }

    // ---- 7. compare_filter_use (外部フック) ----

    /**
     * category-features.js から呼び出される。
     * フィルター・ソート変更時に window.ApaAnalytics.trackFilterUse(type, value, resultCount) を呼ぶ。
     * @param {string} filterType  例: 'price', 'score', 'sort', 'keyword', 'category', 'spec', 'preset'
     * @param {string} filterValue
     * @param {number} [resultCount]
     */
    function trackFilterUse(filterType, filterValue, resultCount) {
        sendEvent('compare_filter_use', {
            filter_type: filterType || '',
            filter_value: filterValue !== undefined ? String(filterValue) : '',
            result_count: typeof resultCount === 'number' ? resultCount : undefined,
            page_type: getPageType(),
        });
    }

    /**
     * カテゴリページのキーワード検索ボックス（#keyword-search）のトラッキング。
     * category-features.js の初期化完了後に呼ばれる想定だが、独立して動作する。
     */
    function initCategoryKeywordSearch() {
        const keywordSearch = document.getElementById('keyword-search');
        if (!keywordSearch) return;

        let debounceTimer;
        keywordSearch.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            const term = this.value.trim();
            debounceTimer = setTimeout(function () {
                if (!term) return;
                const visibleCount = document.querySelectorAll('#product-grid .card:not([style*="display: none"]):not([hidden])').length;
                sendEvent('site_search', {
                    search_term: term,
                    result_count: visibleCount,
                    page_type: getPageType(),
                });
            }, 600);
        });
    }

    // ---- 8. home_entry_click (home-hero-entry-tracking.js から統合) ----

    /**
     * ホームのヒーローCTAボタン（[data-hero-entry]）のクリックをトラッキング。
     * home-hero-entry-tracking.js を置き換える。
     */
    function initHomeEntryClick() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const trigger = target.closest('[data-hero-entry]');
            if (!(trigger instanceof HTMLElement)) return;

            sendEvent('home_entry_click', {
                entry_type: trigger.dataset.heroEntry || 'unknown',
                page_type: 'home',
                location: 'hero',
            });
        });
    }

    // ---- グローバル API 公開 ----

    const api = {
        sendEvent: sendEvent,
        trackFavoriteAdd: trackFavoriteAdd,
        trackFilterUse: trackFilterUse,
        extractAsinFromUrl: extractAsinFromUrl,
        classifyOutboundLink: classifyOutboundLink,
        resolveCtaPosition: resolveCtaPosition,
        extractOutboundPayload: extractOutboundPayload,
    };

    globalThis.ApaAnalytics = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    // ---- 初期化 ----

    function init() {
        initAmazonOutboundClick();
        initProductDetailView();
        initCategoryClick();
        initRankingItemClick();
        initSiteSearch();
        initCategoryKeywordSearch();
        initHomeEntryClick();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
