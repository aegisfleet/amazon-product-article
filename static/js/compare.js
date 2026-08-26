/**
 * compare.js
 * 複数商品のスペック・価格横並び比較機能 (Compare Feature)
 * キー: "apa-compare-v1"
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'apa-compare-v1';
    const MAX_COMPARE = 3;

    // ---- 価格・スペック解析ユーティリティ ----

    function parsePrice(priceStr) {
        if (typeof priceStr === 'number') return Number.isNaN(priceStr) ? 0 : priceStr;
        if (!priceStr || typeof priceStr !== 'string') return 0;
        const matches = priceStr.replace(/,/g, '').match(/\d+/);
        if (!matches) return 0;
        return parseInt(matches[0], 10) || 0;
    }

    function parseSpecs(specsAttr) {
        if (!specsAttr) return {};
        if (typeof specsAttr === 'object') return specsAttr;
        try {
            return JSON.parse(specsAttr);
        } catch {
            return {};
        }
    }

    // ---- データ操作 ----

    function loadCompare() {
        try {
            const raw = globalThis.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(function (item) {
                return item && typeof item === 'object' && typeof item.asin === 'string' && item.asin.length > 0;
            });
        } catch {
            return [];
        }
    }

    function saveCompare(list) {
        try {
            globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_COMPARE)));
        } catch {
            // quota / security error ignore
        }
    }

    function isCompared(asin) {
        if (!asin) return false;
        return loadCompare().some(function (item) { return item.asin === asin; });
    }

    function addCompare(data) {
        const asin = (data.asin || '').trim();
        if (!asin) return false;
        const list = loadCompare();
        if (list.some(function (item) { return item.asin === asin; })) return false; // 重複防止

        if (list.length >= MAX_COMPARE) {
            showToast(`比較できる商品は最大${MAX_COMPARE}件までです`);
            return false;
        }

        const priceStr = (data.price || '').trim();
        const priceNum = parsePrice(priceStr);
        const specsObj = parseSpecs(data.specs);

        list.push({
            asin: asin,
            title: (data.title || '').trim(),
            url: (data.url || '').trim(),
            affiliateUrl: (data.affiliateUrl || '').trim(),
            image: (data.image || '').trim(),
            price: priceStr,
            priceNum: priceNum,
            score: Number(data.score) || 0,
            savingsPercentage: Number(data.savings) || 0,
            category: (data.category || '').trim(),
            specs: specsObj,
            addedAt: Date.now()
        });

        saveCompare(list);
        return true;
    }

    function removeCompare(asin) {
        if (!asin) return false;
        const list = loadCompare();
        const next = list.filter(function (item) { return item.asin !== asin; });
        if (next.length === list.length) return false;
        saveCompare(next);
        return true;
    }

    function clearCompare() {
        try {
            globalThis.localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }

    function toggleCompare(data) {
        const asin = (data.asin || '').trim();
        if (!asin) return false;
        if (isCompared(asin)) {
            removeCompare(asin);
            return false;
        }
        return addCompare(data);
    }

    // ---- トースト表示 ----

    function showToast(message) {
        let toast = document.getElementById('compare-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'compare-toast';
            toast.className = 'compare-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('is-visible');
        setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 3000);
    }

    // ---- DOM & UI 構築 ----

    function getOrCreateTray() {
        let tray = document.getElementById('compare-tray');
        if (!tray) {
            tray = document.createElement('div');
            tray.id = 'compare-tray';
            tray.className = 'compare-tray';
            tray.innerHTML = `
                <div class="compare-tray-content">
                    <div class="compare-tray-header">
                        <span class="compare-tray-title">
                            <span class="compare-tray-icon">⚖️</span>
                            <span class="compare-tray-label">商品比較</span>
                            <span id="compare-tray-count" class="compare-tray-count">0/3</span>
                        </span>
                        <button type="button" id="compare-tray-clear" class="compare-tray-clear-btn" title="比較をすべてクリア" aria-label="比較をすべてクリア">クリア</button>
                    </div>
                    <div id="compare-tray-items" class="compare-tray-items"></div>
                    <div class="compare-tray-actions">
                        <button type="button" id="compare-tray-open" class="compare-tray-open-btn" aria-label="選択した商品を比較する">
                            <span>比較する</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(tray);

            document.getElementById('compare-tray-clear').addEventListener('click', function () {
                clearCompare();
                updateUI();
                closeModal();
            });

            document.getElementById('compare-tray-open').addEventListener('click', function () {
                openModal();
            });
        }
        return tray;
    }

    function updateTray() {
        const list = loadCompare();
        const tray = getOrCreateTray();
        const countSpan = document.getElementById('compare-tray-count');
        const itemsContainer = document.getElementById('compare-tray-items');
        const openBtn = document.getElementById('compare-tray-open');

        if (countSpan) {
            countSpan.textContent = `${list.length}/${MAX_COMPARE}`;
        }

        if (itemsContainer) {
            itemsContainer.innerHTML = '';
            list.forEach(function (item) {
                const thumb = document.createElement('div');
                thumb.className = 'compare-tray-item';
                const imgSrc = item.image || '';
                const itemUrl = item.url ? escapeHtml(item.url) : '';
                thumb.innerHTML = `
                    <a ${itemUrl ? `href="${itemUrl}"` : ''} class="compare-tray-item-link" title="${escapeHtml(item.title)}">
                        <div class="compare-tray-thumb">
                            ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.title)}">` : '<div class="compare-noimg">画像なし</div>'}
                        </div>
                        <span class="compare-tray-item-title">${escapeHtml(item.title)}</span>
                    </a>
                    <button type="button" class="compare-tray-item-remove" data-asin="${escapeHtml(item.asin)}" aria-label="${escapeHtml(item.title)}を比較から削除" title="削除">✕</button>
                `;
                itemsContainer.appendChild(thumb);
            });

            // 個別削除ボタンへのバインド
            const removeBtns = itemsContainer.querySelectorAll('.compare-tray-item-remove');
            removeBtns.forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const asin = btn.dataset.asin;
                    if (asin) {
                        removeCompare(asin);
                        updateUI();
                    }
                });
            });
        }

        if (openBtn) {
            openBtn.disabled = list.length < 1;
        }

        if (list.length > 0) {
            tray.classList.add('is-active');
        } else {
            tray.classList.remove('is-active');
        }

        syncFloatingButtons();

        try {
            globalThis.dispatchEvent(new CustomEvent('apa-compare-tray-change', { detail: { count: list.length } }));
        } catch {
            // ignore
        }
    }

    function syncFloatingButtons() {
        const scrollToTopBtn = document.getElementById('scroll-to-top');
        const tocFab = document.getElementById('toc-fab');
        const floatingSearchFab = document.getElementById('floating-search-fab');
        const stickyBar = document.getElementById('sticky-cta-bar');
        const compareTray = document.getElementById('compare-tray');
        const GAP = 12;

        let maxBarHeight = 0;
        if (stickyBar && stickyBar.classList.contains('is-active')) {
            maxBarHeight = Math.max(maxBarHeight, stickyBar.offsetHeight);
        }
        if (compareTray && compareTray.classList.contains('is-active')) {
            maxBarHeight = Math.max(maxBarHeight, compareTray.offsetHeight);
        }

        const floatingButtons = [scrollToTopBtn, tocFab, floatingSearchFab].filter(Boolean);

        if (maxBarHeight > 0) {
            const bottomOffset = `${maxBarHeight + GAP}px`;
            floatingButtons.forEach(function (btn) {
                btn.style.setProperty('bottom', bottomOffset);
            });
        } else {
            floatingButtons.forEach(function (btn) {
                btn.style.removeProperty('bottom');
            });
        }
    }

    function syncAllButtons() {
        const buttons = document.querySelectorAll('[data-compare-btn]');
        buttons.forEach(function (btn) {
            const asin = btn.dataset.asin;
            if (!asin) return;
            const active = isCompared(asin);
            btn.classList.toggle('is-compared', active);
            btn.setAttribute('aria-pressed', String(active));
            const title = btn.dataset.title || '';
            const titlePrefix = title ? `${title}を` : '';
            btn.setAttribute('aria-label', active ? `${titlePrefix}比較から削除` : `${titlePrefix}比較に追加`);
            const labelEl = btn.querySelector('.compare-label');
            const iconEl = btn.querySelector('.compare-icon');
            if (iconEl) {
                if (iconEl.classList.contains('material-symbols-outlined')) {
                    iconEl.textContent = active ? 'check_circle' : 'balance';
                } else {
                    iconEl.textContent = active ? '✅' : '⚖️';
                }
            }
            if (labelEl) {
                labelEl.textContent = active ? '比較中' : '比較';
            }
        });
    }

    function updateUI() {
        syncAllButtons();
        updateTray();
        const modal = document.getElementById('compare-modal-backdrop');
        if (modal && modal.classList.contains('is-visible')) {
            renderModalContent();
        }
    }

    // ---- モーダル構築 ----

    function getOrCreateModal() {
        let backdrop = document.getElementById('compare-modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'compare-modal-backdrop';
            backdrop.className = 'compare-modal-backdrop';
            backdrop.setAttribute('role', 'dialog');
            backdrop.setAttribute('aria-modal', 'true');
            backdrop.setAttribute('aria-label', '商品比較表');
            backdrop.innerHTML = `
                <div class="compare-modal-container">
                    <div class="compare-modal-header">
                        <h2 class="compare-modal-title">
                            <span aria-hidden="true">⚖️</span> 商品スペック・価格横並び比較表
                        </h2>
                        <button type="button" id="compare-modal-close" class="compare-modal-close-btn" aria-label="比較モーダルを閉じる">✕</button>
                    </div>
                    <div id="compare-modal-body" class="compare-modal-body"></div>
                </div>
            `;
            document.body.appendChild(backdrop);

            document.getElementById('compare-modal-close').addEventListener('click', closeModal);
            backdrop.addEventListener('click', function (e) {
                if (e.target === backdrop) {
                    closeModal();
                }
            });

            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && backdrop.classList.contains('is-visible')) {
                    closeModal();
                }
            });
        }
        return backdrop;
    }

    function openModal() {
        const list = loadCompare();
        if (list.length === 0) {
            showToast('比較する商品が選択されていません');
            return;
        }
        const modal = getOrCreateModal();
        renderModalContent();
        modal.classList.add('is-visible');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        const modal = document.getElementById('compare-modal-backdrop');
        if (modal) {
            modal.classList.remove('is-visible');
            document.body.style.overflow = '';
        }
    }

    function getAllSpecKeys(items) {
        const keySet = new Set();
        items.forEach(function (item) {
            if (item.specs && typeof item.specs === 'object') {
                Object.keys(item.specs).forEach(function (key) {
                    if (key) keySet.add(key);
                });
            }
        });
        return Array.from(keySet);
    }

    function renderModalContent() {
        const body = document.getElementById('compare-modal-body');
        if (!body) return;
        const items = loadCompare();

        if (items.length === 0) {
            body.innerHTML = '<div class="compare-empty-msg">比較する商品がありません。</div>';
            closeModal();
            return;
        }

        // 最高スコア・最安値の計算
        let maxScore = 0;
        items.forEach(function (item) {
            if (item.score > maxScore) maxScore = item.score;
        });

        const validPrices = items.filter(function (item) { return item.priceNum > 0; });
        let minPrice = Infinity;
        validPrices.forEach(function (item) {
            if (item.priceNum < minPrice) minPrice = item.priceNum;
        });

        const specKeys = getAllSpecKeys(items);

        let html = '<div class="compare-table-wrapper"><table class="compare-table"><thead><tr><th class="compare-col-header">比較項目</th>';

        // ヘッダー (各商品)
        items.forEach(function (item) {
            html += `
                <th class="compare-col-product">
                    <div class="compare-product-card-top">
                        <div class="compare-col-remove-wrapper">
                            <button type="button" class="compare-col-remove" data-asin="${escapeHtml(item.asin)}" title="この商品を比較から外す" aria-label="${escapeHtml(item.title)}を比較から外す">
                                <span class="compare-col-remove-icon" aria-hidden="true">✕</span>
                                <span class="compare-col-remove-text">削除</span>
                            </button>
                        </div>
                        <div class="compare-product-img">
                            ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">` : '<div class="compare-noimg">画像なし</div>'}
                        </div>
                        <h3 class="compare-product-title">
                            ${item.url ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}
                        </h3>
                    </div>
                </th>
            `;
        });
        html += '</tr></thead><tbody>';

        // 総合スコア
        html += '<tr><td class="compare-row-label">総合スコア</td>';
        items.forEach(function (item) {
            const isBest = maxScore > 0 && item.score === maxScore;
            const scoreVal = parseInt(item.score, 10) || 0;
            let scoreClass = 'score-caution';
            if (scoreVal >= 80) {
                scoreClass = 'score-excellent';
            } else if (scoreVal >= 70) {
                scoreClass = 'score-good';
            } else if (scoreVal >= 50) {
                scoreClass = 'score-fair';
            }
            const scoreHtml = item.score > 0
                ? `<span class="card-score m3-badge m3-badge-score ${scoreClass}"><span class="material-symbols-outlined icon-score" aria-hidden="true">trophy</span> ${item.score}点</span>`
                : '未評価';
            html += `
                <td class="compare-cell ${isBest ? 'is-winner' : ''}">
                    <div class="compare-score-wrapper">
                        <span class="compare-score-value">${scoreHtml}</span>
                        ${isBest ? '<span class="compare-badge-winner"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:0.85rem; vertical-align:middle;">trophy</span> 最高スコア</span>' : ''}
                    </div>
                </td>
            `;
        });
        html += '</tr>';

        // 現在価格
        html += '<tr><td class="compare-row-label">現在価格</td>';
        items.forEach(function (item) {
            const isLowest = minPrice !== Infinity && item.priceNum > 0 && item.priceNum === minPrice;
            html += `
                <td class="compare-cell ${isLowest ? 'is-winner' : ''}">
                    <div class="compare-price-wrapper">
                        <span class="compare-price-value">${item.price ? escapeHtml(item.price) : '価格情報なし'}</span>
                        ${item.savingsPercentage > 0 ? `<span class="badge-savings">${item.savingsPercentage}% OFF</span>` : ''}
                        ${isLowest ? '<span class="compare-badge-winner"><span class="material-symbols-outlined" aria-hidden="true" style="font-size:0.85rem; vertical-align:middle;">payments</span> 最安値</span>' : ''}
                    </div>
                </td>
            `;
        });
        html += '</tr>';

        // 主要スペック行 (動的)
        if (specKeys.length > 0) {
            specKeys.forEach(function (key) {
                html += `<tr><td class="compare-row-label">${escapeHtml(key)}</td>`;
                items.forEach(function (item) {
                    const val = item.specs ? item.specs[key] : null;
                    html += `
                        <td class="compare-cell">
                            ${val ? escapeHtml(val) : '<span class="compare-text-muted">-</span>'}
                        </td>
                    `;
                });
                html += '</tr>';
            });
        } else {
            html += '<tr><td class="compare-row-label">スペック詳細</td>';
            items.forEach(function () {
                html += '<td class="compare-cell"><span class="compare-text-muted">詳細なし</span></td>';
            });
            html += '</tr>';
        }

        // アクションボタン
        html += '<tr><td class="compare-row-label">リンク・購入</td>';
        items.forEach(function (item) {
            html += `
                <td class="compare-cell">
                    <div class="compare-actions-wrapper">
                        ${item.url ? `<a href="${escapeHtml(item.url)}" class="compare-btn-review">詳細レビューを読む →</a>` : ''}
                        ${item.affiliateUrl ? `<a href="${escapeHtml(item.affiliateUrl)}" class="compare-btn-amazon" target="_blank" rel="noopener noreferrer">🛒 Amazonで見る</a>` : ''}
                    </div>
                </td>
            `;
        });
        html += '</tr>';


        html += '</tbody></table></div>';
        body.innerHTML = html;

        // モーダル内削除ボタンイベントバインド
        const colRemoveBtns = body.querySelectorAll('.compare-col-remove');
        colRemoveBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const asin = btn.dataset.asin;
                if (asin) {
                    removeCompare(asin);
                    updateUI();
                }
            });
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ---- イベントバインド ----

    function extractDataFromButton(btn) {
        return {
            asin: btn.dataset.asin || '',
            title: btn.dataset.title || '',
            url: btn.dataset.url || '',
            affiliateUrl: btn.dataset.affiliateUrl || '',
            image: btn.dataset.image || '',
            price: btn.dataset.price || '',
            score: btn.dataset.score || 0,
            savings: btn.dataset.savings || 0,
            category: btn.dataset.category || '',
            specs: btn.dataset.specs || ''
        };
    }

    function bindCompareButtons() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const btn = target.closest('[data-compare-btn]');
            if (!btn) return;

            event.preventDefault();
            event.stopPropagation();

            const data = extractDataFromButton(btn);
            if (!data.asin) return;

            const added = toggleCompare(data);
            if (added) {
                btn.classList.add('compare-bounce');
                setTimeout(function () { btn.classList.remove('compare-bounce'); }, 600);
            }
            updateUI();
        });
    }

    // ---- 初期化 ----

    function init() {
        bindCompareButtons();
        updateUI();
        window.addEventListener('resize', syncFloatingButtons, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // グローバル API 公開
    globalThis.Compare = {
        load: loadCompare,
        add: addCompare,
        remove: removeCompare,
        clear: clearCompare,
        toggle: toggleCompare,
        isCompared: isCompared,
        sync: updateUI,
        openModal: openModal,
        closeModal: closeModal
    };
})();
