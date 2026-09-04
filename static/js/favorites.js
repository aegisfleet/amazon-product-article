/**
 * favorites.js
 * お気に入り機能 — ブラウザ localStorage で永続化する
 * キー: "apa-favorites-v1"
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'apa-favorites-v1';
    const MAX_FAVORITES = 200;

    let toastTimer = null;

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

    function dispatchFavoritesUpdatedEvent(action, asin, item) {
        const count = loadFavorites().length;
        try {
            const event = new CustomEvent('favoritesUpdated', {
                detail: {
                    action: action, // 'add' | 'remove' | 'clear'
                    asin: asin || null,
                    item: item || null,
                    count: count
                }
            });
            document.dispatchEvent(event);
        } catch {
            // イベント作成失敗時は無視
        }
    }

    function parsePriceRaw(str) {
        if (!str) return 0;
        const m = String(str).replace(/,/g, '').match(/\d+/);
        return m ? Number(m[0]) : 0;
    }

    function addFavorite(data) {
        const asin = (data.asin || '').trim();
        if (!asin) return false;
        const list = loadFavorites();
        if (list.some(function (item) { return item.asin === asin; })) return false; // 重複防止
        const priceStr = (data.price || '').trim();
        const newItem = {
            asin: asin,
            title: (data.title || '').trim(),
            url: (data.url || '').trim(),
            affiliateUrl: (data.affiliateUrl || '').trim(),
            image: (data.image || '').trim(),
            price: priceStr,
            savedPrice: priceStr,
            savedPriceRaw: parsePriceRaw(priceStr),
            score: Number(data.score) || 0,
            category: (data.category || '').trim(),
            savedAt: Date.now()
        };
        list.push(newItem);
        saveFavorites(list);
        // GA4 トラッキング (analytics.js が提供するフック)
        if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFavoriteAdd === 'function') {
            globalThis.ApaAnalytics.trackFavoriteAdd(data);
        }
        dispatchFavoritesUpdatedEvent('add', asin, newItem);
        return true;
    }

    function removeFavorite(asin) {
        if (!asin) return false;
        const list = loadFavorites();
        const next = list.filter(function (item) { return item.asin !== asin; });
        if (next.length === list.length) return false; // 変化なし
        saveFavorites(next);
        dispatchFavoritesUpdatedEvent('remove', asin, null);
        return true;
    }

    function clearFavorites() {
        try {
            globalThis.localStorage.removeItem(STORAGE_KEY);
            dispatchFavoritesUpdatedEvent('clear', null, null);
            return true;
        } catch {
            return false;
        }
    }

    // ---- UI 更新 & トースト表示 ----

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /** トースト通知を表示する */
    function showToast(message, actionType) {
        let toast = document.getElementById('favorite-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'favorite-toast';
            toast.className = 'favorite-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }

        // 既存の中身をクリア
        toast.textContent = '';

        // アイコン
        const iconSpan = document.createElement('span');
        iconSpan.className = 'favorite-toast-icon';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.textContent = actionType === 'add' ? '❤️' : '🤍';
        toast.appendChild(iconSpan);

        // メッセージ
        const msgSpan = document.createElement('span');
        msgSpan.className = 'favorite-toast-msg';
        msgSpan.textContent = message;
        toast.appendChild(msgSpan);

        // 「お気に入りを見る」リンク（追加時）
        if (actionType === 'add') {
            const favNavBtn = document.getElementById('favorites-nav-btn');
            const favUrl = favNavBtn ? favNavBtn.getAttribute('href') : '/favorites/';
            const link = document.createElement('a');
            link.href = favUrl;
            link.className = 'favorite-toast-link';
            link.textContent = 'リストを見る →';
            toast.appendChild(link);
        }

        // 閉じるボタン
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'favorite-toast-close';
        closeBtn.setAttribute('aria-label', '通知を閉じる');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function () {
            toast.classList.remove('is-visible');
            if (toastTimer) {
                clearTimeout(toastTimer);
                toastTimer = null;
            }
        });
        toast.appendChild(closeBtn);

        toast.classList.add('is-visible');

        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        toastTimer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 3500);
    }

    /** ヘッダーおよびドロワーのバッジ件数を更新する */
    function updateBadge(animate) {
        const badges = document.querySelectorAll('.favorites-badge');
        if (!badges.length) return;
        const count = loadFavorites().length;
        const text = count > 0 ? String(count > 99 ? '99+' : count) : '';

        badges.forEach(function (badge) {
            badge.textContent = text;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
            if (animate) {
                badge.classList.remove('fav-badge-pop');
                void badge.offsetWidth; // リフローを発生させてアニメーションを再起動
                badge.classList.add('fav-badge-pop');
                setTimeout(function () {
                    badge.classList.remove('fav-badge-pop');
                }, 400);
            }
        });
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
            const label = btn.querySelector('.fav-label');
            if (label) {
                const defaultText = '保存';
                const activeText = '保存済み';
                label.textContent = active ? activeText : defaultText;
            }
        });
        updateBadge(false);
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
                if (removeFavorite(asin)) {
                    showToast('お気に入りから削除しました', 'remove');
                }
            } else {
                const itemData = extractDataFromButton(btn);
                if (addFavorite(itemData)) {
                    // 追加時のマイクロアニメーション
                    btn.classList.add('fav-bounce');
                    setTimeout(function () { btn.classList.remove('fav-bounce'); }, 600);
                    showToast('お気に入りに追加しました', 'add');
                }
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
            if (clearFavorites()) {
                showToast('お気に入りをすべて削除しました', 'clear');
            }
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

        // 外部からの更新イベントの購読
        document.addEventListener('favoritesUpdated', function () {
            updateBadge(true);
            syncAllButtons();
        });
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
        sync: syncAllButtons,
        showToast: showToast
    };
})();
