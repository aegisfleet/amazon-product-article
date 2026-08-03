/**
 * favorites.js
 * お気に入り機能 — ブラウザ localStorage で永続化する
 * キー: "apa-favorites-v1"
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'apa-favorites-v1';
    const MAX_FAVORITES = 200;

    // ---- データ操作 ----

    function loadFavorites() {
        try {
            const raw = globalThis.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(function (item) {
                return item && typeof item === 'object' && typeof item.asin === 'string';
            });
        } catch {
            return [];
        }
    }

    function saveFavorites(list) {
        try {
            globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_FAVORITES)));
        } catch {
            // quota / security エラーは無視
        }
    }

    function isFavorite(asin) {
        if (!asin) return false;
        return loadFavorites().some(function (item) { return item.asin === asin; });
    }

    function addFavorite(data) {
        const asin = (data.asin || '').trim();
        if (!asin) return false;
        const list = loadFavorites();
        if (list.some(function (item) { return item.asin === asin; })) return false; // 重複防止
        list.push({
            asin: asin,
            title: (data.title || '').trim(),
            url: (data.url || '').trim(),
            affiliateUrl: (data.affiliateUrl || '').trim(),
            image: (data.image || '').trim(),
            price: (data.price || '').trim(),
            score: Number(data.score) || 0,
            category: (data.category || '').trim(),
            savedAt: Date.now()
        });
        saveFavorites(list);
        // GA4 トラッキング (analytics.js が提供するフック)
        if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFavoriteAdd === 'function') {
            globalThis.ApaAnalytics.trackFavoriteAdd(data);
        }
        return true;
    }

    function removeFavorite(asin) {
        if (!asin) return false;
        const list = loadFavorites();
        const next = list.filter(function (item) { return item.asin !== asin; });
        if (next.length === list.length) return false; // 変化なし
        saveFavorites(next);
        return true;
    }

    function clearFavorites() {
        try {
            globalThis.localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }

    // ---- UI 更新 ----

    /** ヘッダーのバッジ件数を更新する */
    function updateBadge() {
        const badge = document.getElementById('favorites-badge');
        if (!badge) return;
        const count = loadFavorites().length;
        badge.textContent = count > 0 ? String(count > 99 ? '99+' : count) : '';
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    /** ページ上のすべてのお気に入りボタンの表示を同期する */
    function syncAllButtons() {
        const buttons = document.querySelectorAll('[data-favorite-btn]');
        buttons.forEach(function (btn) {
            const asin = btn.dataset.asin;
            if (!asin) return;
            const active = isFavorite(asin);
            btn.classList.toggle('is-favorited', active);
            btn.setAttribute('aria-pressed', String(active));
            const titlePrefix = btn.dataset.title ? `${btn.dataset.title}を` : '';
            btn.setAttribute('aria-label', active ? `${titlePrefix}お気に入りから削除` : `${titlePrefix}お気に入りに追加`);
            const icon = btn.querySelector('.fav-icon');
            if (icon) icon.textContent = active ? '❤️' : '🤍';
        });
        updateBadge();
    }

    /** ボタンのデータ属性から商品情報を収集する */
    function extractDataFromButton(btn) {
        return {
            asin: btn.dataset.asin || '',
            title: btn.dataset.title || '',
            url: btn.dataset.url || '',
            affiliateUrl: btn.dataset.affiliateUrl || '',
            image: btn.dataset.image || '',
            price: btn.dataset.price || '',
            score: btn.dataset.score || 0,
            category: btn.dataset.category || ''
        };
    }

    // ---- イベントバインド ----

    function bindFavoriteButtons() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const btn = target.closest('[data-favorite-btn]');
            if (!btn) return;

            event.preventDefault();
            event.stopPropagation();

            const asin = btn.dataset.asin;
            if (!asin) return;

            if (isFavorite(asin)) {
                removeFavorite(asin);
            } else {
                addFavorite(extractDataFromButton(btn));
                // 追加時のマイクロアニメーション
                btn.classList.add('fav-bounce');
                setTimeout(function () { btn.classList.remove('fav-bounce'); }, 600);
            }
            syncAllButtons();
        });
    }

    function bindClearButton() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const clearBtn = target.closest('[data-favorites-clear]');
            if (!clearBtn) return;

            event.preventDefault();
            if (!confirm('お気に入りをすべて削除しますか？')) return;
            clearFavorites();
            syncAllButtons();
            // お気に入り一覧ページならリロードして空状態を表示
            if (globalThis.FavoritesPage) {
                globalThis.FavoritesPage.render();
            }
        });
    }

    // ---- 初期化 ----

    function init() {
        syncAllButtons();
        bindFavoriteButtons();
        bindClearButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // グローバル API 公開
    globalThis.Favorites = {
        load: loadFavorites,
        add: addFavorite,
        remove: removeFavorite,
        clear: clearFavorites,
        isFavorite: isFavorite,
        sync: syncAllButtons
    };
})();
