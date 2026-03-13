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
        const categoryCounts = {};
        const priceBucketCounts = {};
        const seenAsins = new Set();
        const recentAsins = new Set();

        // Calculate counts while deduplicating recent ASINs to avoid over-weighting a single product
        // Also keep track of ALL asins in this window to penalize them
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const asin = toText(event.asin);
            const category = toText(event.category) || 'unknown';
            const priceBucket = toText(event.priceBucket) || 'unknown';

            if (asin) recentAsins.add(asin);

            // Weight: more recent events get slightly more weight
            // Index 0 (oldest) gets weight 1, last index gets (1 + 0.5)
            const recencyWeight = 1 + (i / events.length) * 0.5;

            if (seenAsins.has(asin)) {
                // If seen before, add much less weight
                categoryCounts[category] = (categoryCounts[category] || 0) + 0.2 * recencyWeight;
            } else {
                categoryCounts[category] = (categoryCounts[category] || 0) + recencyWeight;
                priceBucketCounts[priceBucket] = (priceBucketCounts[priceBucket] || 0) + recencyWeight;
                seenAsins.add(asin);
            }
        }

        return {
            events,
            categoryCounts,
            priceBucketCounts,
            recentAsins,
            recentCategory: events.length ? toText(events.at(-1).category) : ''
        };
    }

    function rankItems(items) {
        if (!Array.isArray(items)) return [];
        const preferences = getPreferences();
        if (!preferences.events.length) {
            // Apply a small stable jitter even if no preferences to rotate high-score items
            return [...items].sort(function (a, b) {
                const scoreA = Number(a.score || 0) + (hashCode(a.asin) % 100) / 1000;
                const scoreB = Number(b.score || 0) + (hashCode(b.asin) % 100) / 1000;
                return scoreB - scoreA;
            });
        }

        return [...items].sort(function (a, b) {
            const scoreA = scoreItem(a, preferences);
            const scoreB = scoreItem(b, preferences);
            if (Math.abs(scoreA - scoreB) < 0.1) {
                // Use a mix of Hugo score and a small random jitter based on ASIN
                // to prevent the same 100-score items from always winning ties
                const jitterA = (Number(a.score || 0) * 0.1) + (hashCode(a.asin) % 100) / 200;
                const jitterB = (Number(b.score || 0) * 0.1) + (hashCode(b.asin) % 100) / 200;
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
        const category = toText(item.category) || 'unknown';
        const priceBucket = toText(item.priceBucket) || derivePriceBucket(item.price);
        let score = 0;

        // Base frequency scores
        score += (preferences.categoryCounts[category] || 0) * 5;
        score += (preferences.priceBucketCounts[priceBucket] || 0) * 2;

        // Direct match with the very last viewed category gives a significant boost
        if (preferences.recentCategory && category === preferences.recentCategory) {
            score += 10;
        }

        // HEAVY penalty for items already in the recent history
        // This promotes "discovery" and prevents the same items from sticking
        if (asin && preferences.recentAsins.has(asin)) {
            score -= 50;
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

    bindTracking();
    bindReset();

    globalThis.ProductPersonalization = {
        derivePriceBucket,
        getPreferences,
        rankItems,
        saveEvent,
        clearHistory,
        storageKey: STORAGE_KEY
    };
})();
