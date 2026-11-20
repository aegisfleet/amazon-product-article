(function () {
    'use strict';

    function normalizeForCompare(value) {
        if (typeof value !== 'string') return '';
        return value.normalize('NFKC').replaceAll(/\s+/g, '').trim();
    }

    function sanitizeUrl(url) {
        if (url == null) return null;
        const str = String(url).trim();
        if (!str) return null;
        try {
            const baseOrigin = typeof globalThis.location === 'object' && globalThis.location.origin
                ? globalThis.location.origin
                : 'https://www.amazon-hikaku.com';
            const parsed = new URL(str, baseOrigin);
            const protocol = parsed.protocol.toLowerCase();
            if (protocol === 'http:' || protocol === 'https:') {
                return parsed.toString();
            }
        } catch {
            return null;
        }
        return null;
    }

    function normalizeProductUrl(url, asin) {
        if (!url && asin) {
            return '/' + String(asin).toLowerCase() + '/';
        }
        if (typeof url !== 'string') return null;
        let normalized = url.trim();
        if (normalized.startsWith('/articles/')) {
            normalized = normalized.replace(/^\/articles\//, '/');
        }
        const match = /^\/([A-Za-z0-9]{10})\/?$/.exec(normalized);
        if (match) {
            return '/' + match[1].toLowerCase() + '/';
        }
        return normalized;
    }

    function getScoreClass(score) {
        if (score >= 80) return 'score-excellent';
        if (score >= 70) return 'score-good';
        if (score >= 50) return 'score-fair';
        return 'score-caution';
    }

    function isZeroOrUnknown(val) {
        if (val == null) return true;
        if (typeof val !== 'string' && typeof val !== 'number') return true;
        const s = String(val).trim();
        if (!s || s === '不明' || s === '未記載' || s === '-') return true;
        return /^0+(\.0+)?\s*[a-zA-Z]*$/i.test(s);
    }

    const SPEC_MAP = [
        { key: 'os', label: 'OS', skipZero: true },
        { key: 'cpu', label: 'CPU', skipZero: true },
        { key: 'processor', label: 'CPU', skipZero: true },
        { key: 'ram', label: 'RAM', skipZero: true },
        { key: 'memory', label: 'メモリ', skipZero: true },
        { key: 'storage', label: 'ストレージ', skipZero: true },
        { key: 'display_size', label: '画面', skipZero: true },
        { key: 'battery_capacity', label: 'バッテリー', skipZero: true },
        { key: 'weight', label: '重量', skipZero: false },
        { key: 'quantity', label: '内容量', skipZero: false },
        { key: 'content', label: '内容量', skipZero: false },
        { key: 'count', label: '個数', skipZero: false },
        { key: 'capacity', label: '容量', skipZero: false }
    ];

    function getValidSpecValue(rawVal, skipZero) {
        if (typeof rawVal !== 'string' && typeof rawVal !== 'number') return '';
        const valStr = String(rawVal).trim();
        if (!valStr || valStr === '不明' || valStr === '未記載') return '';
        if (!skipZero && isZeroOrUnknown(valStr)) return '';
        return valStr;
    }

    function extractSizeSpec(specs) {
        const parts = [specs.height, specs.width, specs.depth]
            .filter(function (v) { return typeof v === 'string' || typeof v === 'number'; })
            .map(function (v) { return String(v).trim(); })
            .filter(function (v) { return !isZeroOrUnknown(v); });
        return parts.length > 0 ? { label: 'サイズ', value: parts.join(' × ') } : null;
    }

    function collectMappedSpecs(specs, limit) {
        const rows = [];
        const usedLabels = new Set();

        for (const spec of SPEC_MAP) {
            if (rows.length >= limit) break;
            if (usedLabels.has(spec.label)) continue;
            const valStr = getValidSpecValue(specs[spec.key], spec.skipZero);
            if (!valStr) continue;

            usedLabels.add(spec.label);
            rows.push({ label: spec.label, value: valStr });
        }
        return rows;
    }

    function extractStructuredSpecs(item, maxRows) {
        const limit = typeof maxRows === 'number' && maxRows > 0 ? maxRows : 3;
        if (!item?.specs || typeof item.specs !== 'object') return [];

        const rows = collectMappedSpecs(item.specs, limit);

        if (rows.length < limit && typeof item.specs.material === 'string') {
            const mat = getValidSpecValue(item.specs.material, true);
            if (mat) rows.push({ label: '素材', value: mat });
        }

        if (rows.length < limit) {
            const sizeRow = extractSizeSpec(item.specs);
            if (sizeRow) rows.push(sizeRow);
        }

        return rows.slice(0, limit);
    }

    function buildCategoryTabs(items, preferences, maxTabs) {
        const limit = typeof maxTabs === 'number' && maxTabs > 0 ? maxTabs : 6;
        const counts = new Map();
        if (!Array.isArray(items)) return [{ id: 'all', label: 'すべて', count: 0 }];

        for (const item of items) {
            const grp = typeof item.group === 'string' ? item.group.trim() : '';
            if (!grp || grp === 'unknown') continue;
            counts.set(grp, (counts.get(grp) || 0) + 1);
        }

        const recentGrpNorm = preferences?.recentGroup ? normalizeForCompare(preferences.recentGroup) : '';
        const historyGroups = preferences?.groupHistory instanceof Set ? preferences.groupHistory : new Set();

        const entries = Array.from(counts.entries()).map(function ([groupName, count]) {
            const norm = normalizeForCompare(groupName);
            let priority = 0;
            if (recentGrpNorm && norm === recentGrpNorm) {
                priority = 3;
            } else if (historyGroups.has(norm)) {
                priority = 2;
            } else if (!groupName.startsWith('その他')) {
                priority = 1;
            }
            return { id: groupName, label: groupName, count, priority };
        });

        entries.sort(function (a, b) {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.count - a.count;
        });

        const selected = entries.slice(0, limit).map(function (e) {
            return { id: e.id, label: e.label, count: e.count };
        });

        return [{ id: 'all', label: 'すべて', count: items.length }, ...selected];
    }

    function findTopScoreAsin(items) {
        if (!Array.isArray(items) || items.length === 0) return '';
        let topAsin = '';
        let maxScore = -1;
        for (const item of items) {
            const s = Number(item?.score || 0);
            if (s > maxScore && item?.asin) {
                maxScore = s;
                topAsin = String(item.asin);
            }
        }
        return topAsin;
    }

    function createReasonBadgeElement(item, preferences) {
        const hasPersonalization =
            typeof globalThis.ProductPersonalization === 'object' &&
            typeof globalThis.ProductPersonalization.getRecommendationReason === 'function';

        const reason = hasPersonalization
            ? globalThis.ProductPersonalization.getRecommendationReason(item, preferences)
            : { type: Number(item?.score || 0) >= 90 ? 'hall-of-fame' : 'selected', icon: '👑', label: '高評価厳選アイテム' };

        const wrapper = document.createElement('div');
        wrapper.className = 'pickup-card-reason-row';

        const badge = document.createElement('span');
        badge.className = 'pickup-reason-badge pickup-reason-' + (reason.type || 'selected');
        badge.textContent = (reason.icon ? reason.icon + ' ' : '') + reason.label;

        wrapper.appendChild(badge);
        return wrapper;
    }

    function createStructuredSpecsElement(item) {
        const container = document.createElement('div');
        container.className = 'pickup-card-kv-specs';

        const rows = extractStructuredSpecs(item, 3);
        rows.forEach(function (row) {
            const rowEl = document.createElement('div');
            rowEl.className = 'pickup-spec-row';

            const keyEl = document.createElement('span');
            keyEl.className = 'pickup-spec-key';
            keyEl.textContent = row.label;

            const valEl = document.createElement('span');
            valEl.className = 'pickup-spec-val';
            valEl.textContent = row.value;

            rowEl.appendChild(keyEl);
            rowEl.appendChild(valEl);
            container.appendChild(rowEl);
        });

        return container;
    }

    function createFavoriteOverlayButton(item, safeHref, safeImageSrc) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pickup-fav-btn';
        btn.dataset.favoriteBtn = '1';
        btn.dataset.asin = typeof item.asin === 'string' ? item.asin : '';
        btn.dataset.title = typeof item.title === 'string' ? item.title : '';
        btn.dataset.url = safeHref || '';
        btn.dataset.image = safeImageSrc || '';
        btn.dataset.price = typeof item.price === 'string' ? item.price : '';
        btn.dataset.score = String(Number(item.score || 0));
        btn.dataset.category = typeof item.category === 'string' ? item.category : '';
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', (item.title ? item.title + 'を' : '') + 'お気に入りに追加');

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined fav-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'favorite_border';

        btn.appendChild(icon);
        return btn;
    }

    function applyTrackingDataset(el, meta) {
        el.dataset.trackProduct = '1';
        el.dataset.asin = meta.asin;
        el.dataset.title = meta.title;
        el.dataset.image = meta.safeImageSrc;
        el.dataset.category = meta.category || 'unknown';
        el.dataset.group = meta.group;
        el.dataset.priceBucket = meta.priceBucket;
        el.dataset.price = meta.price;
    }

    function createCardImageWrap(item, index, meta) {
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'pickup-card-image-wrap';

        const rankBadge = document.createElement('span');
        rankBadge.className = 'pickup-rank-badge' + (index === 0 ? ' is-rank-1' : '');
        rankBadge.textContent = '#' + (index + 1);
        imageWrapper.appendChild(rankBadge);

        if (meta.category) {
            const catBadge = document.createElement('span');
            catBadge.className = 'pickup-category-chip';
            catBadge.textContent = meta.category;
            imageWrapper.appendChild(catBadge);
        }

        imageWrapper.appendChild(createFavoriteOverlayButton(item, meta.normalizedUrl, meta.safeImageSrc));

        const imageLink = document.createElement('a');
        imageLink.href = meta.safeHref;
        imageLink.className = 'pickup-card-image';
        applyTrackingDataset(imageLink, meta);

        if (meta.safeImageSrc) {
            const img = document.createElement('img');
            img.src = meta.safeImageSrc;
            img.alt = meta.title;
            img.loading = 'lazy';
            img.decoding = 'async';
            imageLink.appendChild(img);
        } else {
            const noImage = document.createElement('div');
            noImage.className = 'pickup-card-noimage';
            noImage.textContent = '画像なし';
            imageLink.appendChild(noImage);
        }
        imageWrapper.appendChild(imageLink);
        return imageWrapper;
    }

    function createCardFooter(meta, score) {
        const footerContainer = document.createElement('div');
        footerContainer.className = 'pickup-card-footer';

        const metaContainer = document.createElement('div');
        metaContainer.className = 'pickup-card-meta';

        const priceBlock = document.createElement('div');
        priceBlock.className = 'pickup-price-block';
        const priceLabel = document.createElement('span');
        priceLabel.className = 'pickup-price-label';
        priceLabel.textContent = 'Amazon価格(税込)';
        const priceValue = document.createElement('span');
        priceValue.className = 'pickup-card-price';
        priceValue.textContent = meta.price || '価格を確認';
        priceBlock.appendChild(priceLabel);
        priceBlock.appendChild(priceValue);
        metaContainer.appendChild(priceBlock);

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'pickup-card-score m3-badge m3-badge-score ' + getScoreClass(score);
        scoreSpan.innerHTML = '<span class="material-symbols-outlined icon-score" aria-hidden="true">trophy</span> ' + score + '<span class="pickup-score-unit">点</span>';
        metaContainer.appendChild(scoreSpan);

        footerContainer.appendChild(metaContainer);

        const ctaLink = document.createElement('a');
        ctaLink.href = meta.safeHref;
        ctaLink.className = 'pickup-card-cta';
        applyTrackingDataset(ctaLink, meta);
        ctaLink.textContent = '詳細スペック比較 →';
        footerContainer.appendChild(ctaLink);

        return footerContainer;
    }

    function buildPickupCardElement(item, index, topAsin, preferences) {
        const normalizedUrl = normalizeProductUrl(item.url, item.asin);
        const safeHref = sanitizeUrl(normalizedUrl);
        if (!safeHref) return null;

        const score = Number(item.score || 0);
        const image = typeof item.image === 'string' ? item.image.trim() : '';
        const meta = {
            normalizedUrl,
            safeHref,
            title: typeof item.title === 'string' ? item.title : '',
            price: typeof item.price === 'string' ? item.price : '',
            safeImageSrc: (image ? sanitizeUrl(image) : '') || '',
            asin: typeof item.asin === 'string' ? item.asin : '',
            category: typeof item.category === 'string' && item.category !== 'unknown' ? item.category : '',
            group: typeof item.group === 'string' ? item.group : '',
            priceBucket: typeof item.priceBucket === 'string' ? item.priceBucket : 'unknown'
        };
        const isTopPick = Boolean(topAsin && meta.asin === topAsin);

        const article = document.createElement('article');
        article.className = 'pickup-card' + (isTopPick ? ' is-top-pick' : '');
        article.dataset.score = String(score);
        article.dataset.price = meta.price;
        article.dataset.asin = meta.asin;
        article.dataset.category = meta.category || 'unknown';
        article.dataset.group = meta.group;
        article.dataset.priceBucket = meta.priceBucket;

        if (isTopPick) {
            const ribbon = document.createElement('div');
            ribbon.className = 'pickup-top-ribbon';
            ribbon.innerHTML = '<span aria-hidden="true">👑</span> スコア第1位';
            article.appendChild(ribbon);
        }

        article.appendChild(createCardImageWrap(item, index, meta));

        const contentContainer = document.createElement('div');
        contentContainer.className = 'pickup-card-content';

        const upperBody = document.createElement('div');
        upperBody.className = 'pickup-card-body-upper';
        upperBody.appendChild(createReasonBadgeElement(item, preferences));

        const titleHeading = document.createElement('h4');
        titleHeading.className = 'pickup-card-title';
        const titleLink = document.createElement('a');
        titleLink.href = meta.safeHref;
        titleLink.className = 'pickup-card-title-link';
        applyTrackingDataset(titleLink, meta);
        titleLink.textContent = meta.title;
        titleHeading.appendChild(titleLink);
        upperBody.appendChild(titleHeading);
        upperBody.appendChild(createStructuredSpecsElement(item));

        contentContainer.appendChild(upperBody);
        contentContainer.appendChild(createCardFooter(meta, score));
        article.appendChild(contentContainer);

        return article;
    }

    function createSeededRandom(seed) {
        let state = seed >>> 0;
        return function () {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    function shuffleWithSeed(items, seed) {
        const random = createSeededRandom(seed);
        const shuffled = [...items];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    function initHomePickup() {
        const pickupGrid = document.getElementById('pickup-grid');
        const pickupDataElement = document.getElementById('pickup-data');
        if (!pickupGrid || !pickupDataElement) return;

        let pickupItems = [];
        try {
            const parsed = JSON.parse(pickupDataElement.textContent || '[]');
            if (Array.isArray(parsed)) {
                pickupItems = parsed;
            }
        } catch {
            pickupItems = [];
        }
        if (!pickupItems.length) return;

        const contextBar = document.getElementById('pickup-history-context');
        const categoryTabsContainer = document.getElementById('pickup-category-tabs');
        const loadMoreBtn = document.getElementById('pickup-more-btn');

        const INITIAL_COUNT = 10;
        const BATCH_STEP = 10;
        const MAX_DISPLAY = 30;

        let activeGroup = 'all';
        let visibleCount = INITIAL_COUNT;
        let historyFocusIndex = 0;
        let currentRankedPool = [];

        const poolMapByAsin = new Map();
        pickupItems.forEach(function (item) {
            if (item?.asin) {
                poolMapByAsin.set(normalizeForCompare(item.asin), item);
            }
        });

        function getCurrentPreferences() {
            const hasPersonalization =
                typeof globalThis.ProductPersonalization === 'object' &&
                typeof globalThis.ProductPersonalization.getPreferences === 'function';
            if (!hasPersonalization) return { events: [], recentDistinctEvents: [] };

            const basePrefs = globalThis.ProductPersonalization.getPreferences(30);
            const distinctList = basePrefs.recentDistinctEvents || [];
            if (distinctList.length > 0) {
                const targetEvent = distinctList[historyFocusIndex % distinctList.length];
                return globalThis.ProductPersonalization.getPreferences(30, undefined, targetEvent.asin);
            }
            return basePrefs;
        }

        function computeRankedPool(seedOverride) {
            const prefs = getCurrentPreferences();
            const hasHistory = Boolean(prefs?.events?.length);
            const hasPersonalization =
                typeof globalThis.ProductPersonalization === 'object' &&
                typeof globalThis.ProductPersonalization.rankItems === 'function';

            if (hasHistory && hasPersonalization && !seedOverride) {
                const focusAsin = prefs.recentEvent?.asin;
                currentRankedPool = globalThis.ProductPersonalization.rankItems(pickupItems, undefined, focusAsin);
            } else {
                currentRankedPool = shuffleWithSeed(pickupItems, seedOverride || Date.now());
            }
            return prefs;
        }

        function getFilteredItems() {
            if (activeGroup === 'all') return currentRankedPool;
            return currentRankedPool.filter(function (item) {
                return item.group === activeGroup;
            });
        }

        function renderContextBar(prefs) {
            if (!contextBar) return;
            const recentEvent = prefs?.recentEvent;
            if (!recentEvent) {
                contextBar.hidden = true;
                contextBar.textContent = '';
                return;
            }

            const poolMatch = poolMapByAsin.get(normalizeForCompare(recentEvent.asin));
            const displayTitle = recentEvent.title || poolMatch?.title || recentEvent.rawCategory || recentEvent.category || 'チェックした商品';
            const displayImage = sanitizeUrl(recentEvent.image || poolMatch?.image || '');
            const displayCategory = recentEvent.rawCategory && recentEvent.rawCategory !== 'unknown'
                ? recentEvent.rawCategory
                : (poolMatch?.category || recentEvent.rawGroup || '');

            contextBar.hidden = false;
            contextBar.textContent = '';

            const leftGroup = document.createElement('div');
            leftGroup.className = 'pickup-context-left';

            if (displayImage) {
                const thumbWrap = document.createElement('div');
                thumbWrap.className = 'pickup-context-thumb';
                const img = document.createElement('img');
                img.src = displayImage;
                img.alt = displayTitle;
                img.loading = 'lazy';
                thumbWrap.appendChild(img);
                leftGroup.appendChild(thumbWrap);
            }

            const infoCol = document.createElement('div');
            infoCol.className = 'pickup-context-info';

            const labelRow = document.createElement('div');
            labelRow.className = 'pickup-context-kicker';
            labelRow.innerHTML = '<span class="pickup-context-dot" aria-hidden="true"></span><span>直前にチェックした商品に基づくおすすめ</span>';

            const titleRow = document.createElement('div');
            titleRow.className = 'pickup-context-title-row';
            const titleSpan = document.createElement('span');
            titleSpan.className = 'pickup-context-title';
            titleSpan.textContent = displayTitle;
            titleRow.appendChild(titleSpan);

            if (displayCategory) {
                const catPill = document.createElement('span');
                catPill.className = 'pickup-context-cat-pill';
                catPill.textContent = displayCategory;
                titleRow.appendChild(catPill);
            }

            infoCol.appendChild(labelRow);
            infoCol.appendChild(titleRow);
            leftGroup.appendChild(infoCol);
            contextBar.appendChild(leftGroup);

            const rightGroup = document.createElement('div');
            rightGroup.className = 'pickup-context-actions';

            const distinctCount = prefs.recentDistinctEvents?.length || 0;
            const switchBtn = document.createElement('button');
            switchBtn.type = 'button';
            switchBtn.className = 'pickup-context-switch-btn';
            switchBtn.textContent = distinctCount > 1 ? '別の履歴で再計算' : '組み合わせを変更';
            switchBtn.addEventListener('click', function () {
                if (distinctCount > 1) {
                    historyFocusIndex = (historyFocusIndex + 1) % distinctCount;
                    refreshView(false);
                } else {
                    refreshView(true);
                }
            });

            rightGroup.appendChild(switchBtn);
            contextBar.appendChild(rightGroup);
        }

        function renderCategoryTabs(prefs) {
            if (!categoryTabsContainer) return;
            const tabs = buildCategoryTabs(pickupItems, prefs, 12);
            categoryTabsContainer.textContent = '';

            tabs.forEach(function (tab) {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isActive = tab.id === activeGroup;
                btn.className = 'pickup-cat-tab' + (isActive ? ' is-active' : '');
                btn.setAttribute('aria-pressed', String(isActive));
                btn.textContent = tab.label + ' (' + tab.count + ')';
                btn.addEventListener('click', function () {
                    if (activeGroup === tab.id) return;
                    activeGroup = tab.id;
                    visibleCount = INITIAL_COUNT;
                    renderCategoryTabs(prefs);
                    renderGridAndFooter(prefs);
                });
                categoryTabsContainer.appendChild(btn);
            });
        }

        function renderGridAndFooter(prefs) {
            const filtered = getFilteredItems();
            const slice = filtered.slice(0, visibleCount);
            const topAsin = findTopScoreAsin(slice);

            pickupGrid.textContent = '';
            slice.forEach(function (item, idx) {
                const cardEl = buildPickupCardElement(item, idx, topAsin, prefs);
                if (cardEl) {
                    pickupGrid.appendChild(cardEl);
                }
            });

            if (typeof globalThis.Favorites === 'object' && typeof globalThis.Favorites.sync === 'function') {
                globalThis.Favorites.sync();
            }

            if (loadMoreBtn) {
                const totalAvailable = Math.min(filtered.length, MAX_DISPLAY);
                if (filtered.length <= INITIAL_COUNT) {
                    loadMoreBtn.hidden = true;
                } else {
                    loadMoreBtn.hidden = false;
                    const remaining = totalAvailable - slice.length;
                    if (remaining > 0) {
                        loadMoreBtn.innerHTML = '<span>高評価アイテムをもっと見る（残り' + remaining + '件 / 全' + filtered.length + '件）</span><span class="material-symbols-outlined" aria-hidden="true" style="font-size: 1rem;">expand_more</span>';
                        loadMoreBtn.dataset.mode = 'expand';
                    } else {
                        loadMoreBtn.innerHTML = '<span>10件表示に戻す</span><span class="material-symbols-outlined" aria-hidden="true" style="font-size: 1rem;">expand_less</span>';
                        loadMoreBtn.dataset.mode = 'collapse';
                    }
                }
            }
        }

        function refreshView(forceRandomSeed) {
            const prefs = computeRankedPool(forceRandomSeed ? Date.now() : undefined);
            renderContextBar(prefs);
            renderCategoryTabs(prefs);
            renderGridAndFooter(prefs);
        }

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', function () {
                const prefs = getCurrentPreferences();
                if (loadMoreBtn.dataset.mode === 'collapse') {
                    visibleCount = INITIAL_COUNT;
                } else {
                    visibleCount = Math.min(visibleCount + BATCH_STEP, MAX_DISPLAY);
                }
                renderGridAndFooter(prefs);
            });
        }

        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const resetBtn = target.closest('[data-reset-history="1"]');
            if (!resetBtn) return;

            historyFocusIndex = 0;
            activeGroup = 'all';
            visibleCount = INITIAL_COUNT;
            globalThis.setTimeout(function () {
                refreshView(true);
            }, 20);
        });

        refreshView(false);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initHomePickup);
        } else {
            initHomePickup();
        }
    }

    const exported = {
        extractStructuredSpecs,
        buildCategoryTabs,
        findTopScoreAsin,
        normalizeProductUrl
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exported;
    }
})();
