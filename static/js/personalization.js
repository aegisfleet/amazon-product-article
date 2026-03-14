(function () {
    const STORAGE_KEY = 'apa-user-actions-v1';
    const MAX_EVENTS = 120;

    function toText(value) {
        return typeof value === 'string' ? value.trim() : '';
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
        const asin = toText(payload.asin);
        if (!asin) return;

        const event = {
            asin,
            category: toText(payload.category) || 'unknown',
            priceBucket: toText(payload.priceBucket) || 'unknown',
            ts: toPositiveNumber(payload.ts) || Date.now()
        };

        const events = loadEvents();
        events.push(event);
        saveEvents(events);
    }

    function getPreferences(limit) {
        const allEvents = loadEvents();
        const max = toPositiveNumber(limit) || 30;
        const events = allEvents.slice(-max);
        const categoryHistory = new Set();
        const priceBucketHistory = new Set();
        const recentAsins = new Set();

        // Keep track of any category or price bucket seen in the recent history
        for (const event of events) {
            const asin = toText(event.asin);
            const category = toText(event.category);
            const priceBucket = toText(event.priceBucket);
            if (asin) recentAsins.add(asin);
            if (category) categoryHistory.add(category);
            if (priceBucket) priceBucketHistory.add(priceBucket);
        }

        return {
            events,
            categoryHistory,
            priceBucketHistory,
            recentAsins,
            recentCategory: events.length ? toText(events.at(-1).category) : ''
        };
    }

    function rankItems(items) {
        if (!Array.isArray(items)) return [];
        const preferences = getPreferences();

        return [...items].sort(function (a, b) {
            const scoreA = scoreItem(a, preferences);
            const scoreB = scoreItem(b, preferences);

            // If tiered scores are effectively the same, use Hugo score and stable jitter
            if (Math.abs(scoreA - scoreB) < 1) {
                const jitterA = (Number(a.score || 0)) + (hashCode(a.asin) % 100) / 1000;
                const jitterB = (Number(b.score || 0)) + (hashCode(b.asin) % 100) / 1000;
                return jitterB - jitterA;
            }
            return scoreB - scoreA;
        });
    }

    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const charCode = str.codePointAt(i);
            hash = (hash << 5) - hash + charCode;
            hash = Math.trunc(hash);
            if (charCode > 0xffff) i++; // Skip surrogate pair
        }
        return Math.abs(hash);
    }

    function scoreItem(item, preferences) {
        if (!item || typeof item !== 'object') return 0;

        const asin = toText(item.asin);
        const category = (toText(item.category) || 'unknown').trim();
        const priceBucket = toText(item.priceBucket) || derivePriceBucket(item.price);
        let score = 0;

        // TIER 1: Match with the VERY LAST viewed category
        if (category === preferences.recentCategory?.trim()) {
            score += 2000;
        }
        // TIER 2: Match with ANY category in recent history
        else if (preferences.categoryHistory.has(category)) {
            score += 1000;
        }

        // TIER 3: Match with any price bucket in history
        if (preferences.priceBucketHistory.has(priceBucket)) {
            score += 100;
        }

        // HEAVY PENALTY: Item already viewed recently
        if (asin && preferences.recentAsins.has(asin)) {
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
        const asin = toText(link.dataset.asin);
        if (!asin) return null;
        const category = toText(link.dataset.category) || 'unknown';
        const priceBucket = toText(link.dataset.priceBucket) || derivePriceBucket(link.dataset.price || '');
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
            const asin = toText(trackingInfo.dataset.asin);
            const category = toText(trackingInfo.dataset.category) || 'unknown';
            const priceBucket = toText(trackingInfo.dataset.priceBucket) || derivePriceBucket(trackingInfo.dataset.price || '');
            
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
