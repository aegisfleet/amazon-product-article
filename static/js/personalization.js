(function () {
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

        const event = {
            asin,
            category: normalizeText(payload.category) || 'unknown',
            priceBucket: normalizeText(payload.priceBucket) || 'unknown',
            ts: toPositiveNumber(payload.ts) || Date.now()
        };

        const events = loadEvents();
        events.push(event);
        saveEvents(events);
    }

    function getPreferences(limit, categoryToGroup) {
        const allEvents = loadEvents();
        const max = toPositiveNumber(limit) || 30;
        const events = allEvents.slice(-max);
        const categoryHistory = new Set();
        const groupHistory = new Set();
        const priceBucketHistory = new Set();
        const recentAsins = new Set();

        // Keep track of any category or price bucket seen in the recent history
        for (const event of events) {
            const asin = normalizeText(event.asin);
            const category = normalizeText(event.category);
            const priceBucket = normalizeText(event.priceBucket);
            if (asin) recentAsins.add(asin);
            if (category) {
                categoryHistory.add(category);
                if (categoryToGroup?.[category]) {
                    groupHistory.add(categoryToGroup[category]);
                }
            }
            if (priceBucket) priceBucketHistory.add(priceBucket);
        }

        const lastEvent = events.at(-1) ?? null;
        const recentCategory = lastEvent ? normalizeText(lastEvent.category) : '';
        const recentGroup = (recentCategory && categoryToGroup) ? (categoryToGroup[recentCategory] || '') : '';

        return {
            events,
            categoryHistory,
            groupHistory,
            priceBucketHistory,
            recentAsins,
            recentCategory,
            recentGroup
        };
    }

    function rankItems(items, categoryToGroup) {
        if (!Array.isArray(items)) return [];
        const preferences = getPreferences(30, categoryToGroup);

        // STAGE 1: Add initial randomized order to each item to facilitate stable but random tie-breaking
        const itemsWithOrder = items.map((item, index) => ({
            item,
            originalIndex: index,
            randomOrder: Math.random()
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

// hashCode function removed as it is no longer used for jitter

    function scoreItem(item, preferences, categoryToGroup) {
        if (!item || typeof item !== 'object') return 0;

        const asin = normalizeText(item.asin);
        const category = normalizeText(item.category) || 'unknown';
        const priceBucket = normalizeText(item.priceBucket) || derivePriceBucket(item.price);
        const group = categoryToGroup?.[category] ?? '';
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
        else if (preferences.categoryHistory.has(category)) {
            score += 1000;
        }
        // TIER 2.5: Match with ANY GROUP in recent history
        else if (group && preferences.groupHistory.has(group)) {
            score += 800;
        }

        // TIER 3: Match with any price bucket in history
        if (preferences.priceBucketHistory.has(priceBucket)) {
            score += 100;
        }

        // HEAVY PENALTY: Item already viewed recently
        if (asin && preferences.recentAsins?.has(asin)) {
            score -= 5000;
        }

        return score;
    }

    function clearHistory() {
        try {
            globalThis.localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }

    function getLinkMeta(link) {
        const asin = normalizeText(link.dataset.asin);
        if (!asin) return null;
        const category = normalizeText(link.dataset.category) || 'unknown';
        const priceBucket = normalizeText(link.dataset.priceBucket) || derivePriceBucket(link.dataset.price || '');
        return { asin, category, priceBucket, ts: Date.now() };
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
                resetBtn.textContent = '履歴をリセットしました';
                globalThis.setTimeout(function () {
                    resetBtn.textContent = '閲覧履歴をリセット';
                }, 1800);
            }
        });
    }

    // NEW: Auto-track product if on a single product page via a hidden element
    function autoTrack() {
        const trackingInfo = document.getElementById('product-tracking-info');
        if (trackingInfo?.dataset.asin) {
            const asin = normalizeText(trackingInfo.dataset.asin);
            const category = normalizeText(trackingInfo.dataset.category) || 'unknown';
            const priceBucket = normalizeText(trackingInfo.dataset.priceBucket) || derivePriceBucket(trackingInfo.dataset.price || '');
            
            saveEvent({ asin, category, priceBucket, ts: Date.now() });
        }
    }

    bindTracking();
    bindReset();
    autoTrack();

    globalThis.ProductPersonalization = {
        derivePriceBucket,
        getPreferences,
        rankItems,
        saveEvent,
        clearHistory,
        storageKey: STORAGE_KEY
    };
})();
