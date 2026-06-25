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

    // ---- 1. amazon_outbound_click ----

    /**
     * [data-track-product] 属性を持つ Amazon アフィリエイトリンクのクリックをトラッキング。
     * product-hero.html / product-card.html / list.html の各テンプレートに付与済みの属性を利用する。
     */
    function initAmazonOutboundClick() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const link = target.closest('[data-track-product]');
            if (!(link instanceof HTMLAnchorElement)) return;

            // DOM内の位置（何番目の amazon リンクか）を算出
            const allTrackLinks = Array.from(document.querySelectorAll('[data-track-product]'));
            const position = allTrackLinks.indexOf(link);

            sendEvent('amazon_outbound_click', {
                asin: link.dataset.asin || '',
                product_name: link.dataset.productName || link.textContent?.trim() || '',
                category: link.dataset.category || '',
                price: link.dataset.price || '',
                price_bucket: link.dataset.priceBucket || '',
                score: link.dataset.score ? Number(link.dataset.score) : undefined,
                position: position >= 0 ? position : undefined,
                page_type: getPageType(),
                destination_url: link.href || '',
            });
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

    globalThis.ApaAnalytics = {
        sendEvent: sendEvent,
        trackFavoriteAdd: trackFavoriteAdd,
        trackFilterUse: trackFilterUse,
    };

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
