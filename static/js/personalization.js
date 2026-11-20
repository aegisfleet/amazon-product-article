(function () {
    if (globalThis.__apaPersonalizationLoaded) return;
    globalThis.__apaPersonalizationLoaded = true;

    const STORAGE_KEY = 'apa-user-actions-v1';
    const MAX_EVENTS = 120;

    function normalizeText(value) {
        if (typeof value !== 'string') return '';
        // NFKC normalization handles full-width/half-width and other Japanese character inconsistencies
        // Also remove all internal whitespace for robust matching
        return value.normalize('NFKC').replaceAll(/\s+/g, '').trim();
    }

    function toPositiveNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : 0;
    }

    function parsePrice(rawPrice) {
        if (rawPrice == null) return 0;
        const normalized = String(rawPrice).replaceAll(',', '');
        const matched = /\d+/.exec(normalized);
        return matched ? toPositiveNumber(matched[0]) : 0;
    }

    function derivePriceBucket(rawPrice) {
        const price = parsePrice(rawPrice);
        if (!price) return 'unknown';
        if (price < 3000) return 'under-3000';
        if (price < 7000) return '3000-6999';
        if (price < 15000) return '7000-14999';
        if (price < 30000) return '15000-29999';
        return '30000-plus';
    }

    function loadEvents() {
        try {
            const raw = globalThis.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(function (item) {
                return item && typeof item === 'object';
            });
        } catch {
            return [];
        }
    }

    function saveEvents(events) {
        try {
            globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
        } catch {
            // ignore quota/security errors
        }
    }

    function saveEvent(payload) {
        const asin = normalizeText(payload.asin);
        if (!asin) return;

        const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 120) : '';
        const image = typeof payload.image === 'string' ? payload.image.trim().slice(0, 500) : '';
        const rawCategory = typeof payload.category === 'string' ? payload.category.trim() : '';
        const rawGroup = typeof payload.group === 'string' ? payload.group.trim() : '';

        const event = {
            asin,
            title,
            image,
            rawCategory: rawCategory || 'unknown',
            rawGroup,
            category: normalizeText(payload.category) || 'unknown',
            group: normalizeText(payload.group) || '',
            priceBucket: normalizeText(payload.priceBucket) || 'unknown',
            ts: toPositiveNumber(payload.ts) || Date.now()
        };

        const events = loadEvents();
        events.push(event);
        saveEvents(events);
    }

    function resolveGroup(group, category, categoryToGroup) {
        if (group) return group;
        if (category && categoryToGroup?.[category]) {
            return categoryToGroup[category];
        }
        return '';
    }

    function getPreferences(limit, categoryToGroup, focusAsin) {
        const allEvents = loadEvents();
        const max = toPositiveNumber(limit) || 30;
        const events = allEvents.slice(-max);
        const categoryHistory = new Set();
        const groupHistory = new Set();
        const priceBucketHistory = new Set();
        const recentAsins = new Set();
        const distinctMap = new Map();

        for (const event of events) {
            const asin = normalizeText(event.asin);
            const category = normalizeText(event.category);
            const group = resolveGroup(normalizeText(event.group), category, categoryToGroup);
            const priceBucket = normalizeText(event.priceBucket);

            if (asin) {
                recentAsins.add(asin);
                distinctMap.set(asin, event);
            }
            if (category) categoryHistory.add(category);
            if (group) groupHistory.add(group);
            if (priceBucket) priceBucketHistory.add(priceBucket);
        }

        const recentDistinctEvents = Array.from(distinctMap.values()).reverse();
        const normalizedFocus = focusAsin ? normalizeText(focusAsin) : '';
        const focusedEvent = normalizedFocus
            ? recentDistinctEvents.find(function (e) { return normalizeText(e.asin) === normalizedFocus; })
            : null;
        const lastEvent = focusedEvent || events.at(-1) || null;
        const recentCategory = lastEvent ? normalizeText(lastEvent.category) : '';
        const recentGroup = lastEvent ? resolveGroup(normalizeText(lastEvent.group), recentCategory, categoryToGroup) : '';
        const recentPriceBucket = lastEvent ? normalizeText(lastEvent.priceBucket) : '';

        return {
            events,
            recentEvent: lastEvent,
            recentDistinctEvents,
            categoryHistory,
            groupHistory,
            priceBucketHistory,
            recentAsins,
            recentCategory,
            recentGroup,
            recentPriceBucket
        };
    }

    function getRandomFloat() {
        let cryptoObj = null;
        if (typeof globalThis !== 'undefined' && globalThis.crypto) {
            cryptoObj = globalThis.crypto;
        } else if (typeof window !== 'undefined' && window.crypto) {
            cryptoObj = window.crypto;
        }

        if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
            const array = new Uint32Array(1);
            cryptoObj.getRandomValues(array);
            return array[0] / 4294967296;
        }
        return (Date.now() % 1000000) / 1000000;
    }

    function rankItems(items, categoryToGroup, focusAsin) {
        if (!Array.isArray(items)) return [];
        const preferences = getPreferences(30, categoryToGroup, focusAsin);

        // STAGE 1: Add initial randomized order to each item to facilitate stable but random tie-breaking
        const itemsWithOrder = items.map((item, index) => ({
            item,
            originalIndex: index,
            randomOrder: getRandomFloat()
        }));

        // STAGE 2: Perform the sort
        itemsWithOrder.sort(function (a, b) {
            const scoreA = scoreItem(a.item, preferences, categoryToGroup);
            const scoreB = scoreItem(b.item, preferences, categoryToGroup);

            // If tiered scores are effectively the same, use Hugo score and randomOrder jitter
            if (Math.abs(scoreA - scoreB) < 1) {
                const baseA = Number(a.item.score || 0);
                const baseB = Number(b.item.score || 0);
                
                if (Math.abs(baseA - baseB) < 1) {
                    // Hugo score is also the same, use the stability-safe random order
                    return b.randomOrder - a.randomOrder;
                }
                return baseB - baseA;
            }
            return scoreB - scoreA;
        });

        // STAGE 3: Return original item objects
        return itemsWithOrder.map(wrapper => wrapper.item);
    }

    function scoreItem(item, preferences, categoryToGroup) {
        if (!item || typeof item !== 'object') return 0;

        const asin = normalizeText(item.asin);
        const category = normalizeText(item.category) || 'unknown';
        const priceBucket = normalizeText(item.priceBucket) || derivePriceBucket(item.price);
        const group = normalizeText(item.group) || (categoryToGroup?.[category] ?? '');
        let score = 0;

        // TIER 1: Match with the VERY LAST viewed category
        if (category && category === preferences.recentCategory) {
            score += 2000;
        }
        // TIER 1.5: Match with the VERY LAST viewed GROUP (Parent Category)
        else if (group && group === preferences.recentGroup) {
            score += 1500;
        }
        // TIER 2: Match with ANY category in recent history
        else if (preferences.categoryHistory?.has(category)) {
            score += 1000;
        }
        // TIER 2.5: Match with ANY GROUP in recent history
        else if (group && preferences.groupHistory?.has(group)) {
            score += 800;
        }

        // TIER 3: Match with price bucket ONLY IF the item is relevant (score > 0)
        // カテゴリや親グループが一致している場合にのみ、価格帯ボーナスを適用する。
        // （全く無関係なジャンルの商品が「価格が近いだけ」で上位推薦されるのを防ぐ）
        if (score > 0) {
            if (preferences.recentPriceBucket && priceBucket === preferences.recentPriceBucket) {
                score += 150;
            } else if (preferences.priceBucketHistory?.has(priceBucket)) {
                score += 80;
            }
        }

        // HEAVY PENALTY: Item already viewed recently
        if (asin && preferences.recentAsins?.has(asin)) {
            score -= 5000;
        }

        return score;
    }

    function getRecommendationReason(item, preferences, categoryToGroup) {
        if (!item || typeof item !== 'object') {
            return { type: 'selected', icon: '⭐', label: '高評価厳選アイテム' };
        }
        const category = normalizeText(item.category) || 'unknown';
        const group = normalizeText(item.group) || (categoryToGroup?.[category] ?? '');
        const price = parsePrice(item.price);
        const itemScore = Number(item.score || 0);

        if (preferences && preferences.recentCategory && category === preferences.recentCategory) {
            return { type: 'recent-category', icon: '🎯', label: '閲覧中カテゴリで高評価' };
        }
        if (preferences && preferences.recentGroup && group && group === preferences.recentGroup) {
            return { type: 'recent-group', icon: '💡', label: '関連ジャンルの人気品' };
        }
        if (preferences && preferences.categoryHistory?.has(category)) {
            return { type: 'history-category', icon: '🕒', label: 'チェックしたカテゴリ' };
        }
        if (preferences && group && preferences.groupHistory?.has(group)) {
            return { type: 'history-group', icon: '🔍', label: '興味ジャンルで高評価' };
        }
        if (itemScore >= 90) {
            return { type: 'hall-of-fame', icon: '👑', label: '90点超えの殿堂入り' };
        }
        if (price > 0 && price <= 1500) {
            return { type: 'bargain', icon: '📦', label: 'まとめ買い候補' };
        }
        return { type: 'selected', icon: '⭐', label: '定番ベストセラー候補' };
    }

    function clearHistory() {
        try {
            globalThis.localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }

    function extractTitleFromLink(link) {
        if (link.dataset.title) return link.dataset.title;
        const card = link.closest('.card, .pickup-card, article');
        const titleEl = card?.querySelector('.card-title, .pickup-card-title, h2, h3');
        return titleEl?.textContent?.trim() || link.textContent?.trim() || '';
    }

    function extractImageFromLink(link) {
        if (link.dataset.image) return link.dataset.image;
        const card = link.closest('.card, .pickup-card, article');
        const imgEl = card?.querySelector('img');
        return imgEl?.getAttribute('src') || '';
    }

    function getLinkMeta(link) {
        const asin = normalizeText(link.dataset.asin);
        if (!asin) return null;
        const category = link.dataset.category || 'unknown';
        const group = link.dataset.group || '';
        const priceBucket = normalizeText(link.dataset.priceBucket) || derivePriceBucket(link.dataset.price || '');
        const title = extractTitleFromLink(link);
        const image = extractImageFromLink(link);
        return { asin, title, image, category, group, priceBucket, ts: Date.now() };
    }

    function bindTracking() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const link = target.closest('a[data-track-product="1"]');
            if (!link) return;

            const eventData = getLinkMeta(link);
            if (eventData) {
                saveEvent(eventData);
            }
        });
    }

    function bindReset() {
        document.addEventListener('click', function (event) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const resetBtn = target.closest('[data-reset-history="1"]');
            if (!resetBtn) return;

            event.preventDefault();
            if (clearHistory()) {
                const labelEl = resetBtn.querySelector('.reset-btn-label') || resetBtn;
                const originalText = labelEl.dataset.originalText || labelEl.textContent;
                labelEl.dataset.originalText = originalText;
                labelEl.textContent = 'リセット完了';
                globalThis.setTimeout(function () {
                    labelEl.textContent = originalText;
                }, 1800);
            }
        });
    }

    // NEW: Auto-track product if on a single product page via a hidden element
    function autoTrack() {
        const trackingInfo = document.getElementById('product-tracking-info');
        if (trackingInfo?.dataset.asin) {
            const asin = normalizeText(trackingInfo.dataset.asin);
            const category = trackingInfo.dataset.category || 'unknown';
            const group = trackingInfo.dataset.group || '';
            const priceBucket = normalizeText(trackingInfo.dataset.priceBucket) || derivePriceBucket(trackingInfo.dataset.price || '');
            const title = trackingInfo.dataset.title || document.querySelector('.hero-title, h1')?.textContent?.trim() || '';
            const image = trackingInfo.dataset.image || document.querySelector('.product-hero-image img')?.getAttribute('src') || '';
            
            saveEvent({ asin, title, image, category, group, priceBucket, ts: Date.now() });
        }
    }

    if (typeof document !== 'undefined') {
        bindTracking();
        bindReset();
        autoTrack();
    }

    const api = {
        derivePriceBucket,
        getPreferences,
        rankItems,
        scoreItem,
        getRecommendationReason,
        saveEvent,
        clearHistory,
        storageKey: STORAGE_KEY
    };

    globalThis.ProductPersonalization = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
