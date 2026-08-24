/**
 * Search Web Worker for offloading Fuse.js fuzzy search and reranking
 */

let fuse = null;
let searchIndex = null;

const FUSE_OPTIONS = {
    keys: [
        { name: "asin", weight: 1 },
        { name: "title", weight: 0.7 },
        { name: "contents", weight: 0.2 },
        { name: "categories", weight: 1 },
        { name: "specs", weight: 0.3 }
    ],
    threshold: 0.2,
    distance: 100,
    includeScore: true,
    ignoreLocation: true,
    useExtendedSearch: true
};

function toYen(value, unit) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return 0;
    if (unit === '万') return num * 10000;
    if (unit === '千') return num * 1000;
    return num;
}

function parseBudgetFromQuery(query) {
    const normalizedQuery = query.replaceAll(/\s+/g, '');
    const rangeMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)([万千])?円?[~〜-](\d+(?:\.\d+)?)([万千])?円?/);
    if (rangeMatch) {
        const min = toYen(rangeMatch[1], rangeMatch[2]);
        const max = toYen(rangeMatch[3], rangeMatch[4]);
        return { min: Math.min(min, max), max: Math.max(min, max) };
    }

    const upperMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)([万千])?円?(以下|未満|まで)/);
    if (upperMatch) {
        return { max: toYen(upperMatch[1], upperMatch[2]) };
    }

    const lowerMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)([万千])?円?(以上|超)/);
    if (lowerMatch) {
        return { min: toYen(lowerMatch[1], lowerMatch[2]) };
    }

    return null;
}

function rerankResults(results, query, filters = {}) {
    if (!Array.isArray(results) || results.length === 0) return [];

    // Fuse.jsのスコアが0.85より悪い（一致度が極めて低い）ものは除外
    const validResults = results.filter(r => !Number.isFinite(r.score) || r.score <= 0.85);
    if (validResults.length === 0) return [];

    const queryLength = query.trim().length;
    const queryTerms = query.trim().split(/\s+/).filter(Boolean).length;
    const intentStrength = Math.min(1, Math.max(0, ((queryLength - 2) / 10) + ((queryTerms - 1) * 0.08)));

    const fuseScores = validResults.map(result => Number.isFinite(result.score) ? result.score : 1);
    const minFuseScore = Math.min(...fuseScores);
    const maxFuseScore = Math.max(...fuseScores);
    const fuseScoreRange = maxFuseScore - minFuseScore;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const queryBudget = parseBudgetFromQuery(query);

    const getNormalizedFuseScore = (rawFuseScore) => {
        if (!Number.isFinite(rawFuseScore)) return 0;
        if (fuseScoreRange === 0) return 1;
        const normalized = (rawFuseScore - minFuseScore) / fuseScoreRange;
        return 1 - normalized;
    };

    const getQualityScore = (item) => {
        const quality = Number.parseFloat(item.score);
        if (!Number.isFinite(quality)) return 0;
        return Math.min(1, Math.max(0, quality / 100));
    };

    const getPriceScore = (item) => {
        const numericPrice = Number.parseFloat(item.price_value);

        if (queryBudget) {
            if (!Number.isFinite(numericPrice) || numericPrice <= 0) return 0;

            if (queryBudget.min && numericPrice < queryBudget.min) return 0;
            if (queryBudget.max && numericPrice > queryBudget.max) return 0;

            const center = queryBudget.max && queryBudget.min
                ? (queryBudget.min + queryBudget.max) / 2
                : (queryBudget.max || queryBudget.min || numericPrice);
            const distance = Math.abs(numericPrice - center);
            const tolerance = Math.max(center * 0.5, 1000);
            return Math.max(0, 1 - (distance / tolerance));
        }

        if (Number.isFinite(numericPrice) && numericPrice > 0) return 0.7;
        return item.price ? 0.5 : 0;
    };

    const getFreshnessScore = (item) => {
        if (!item.last_investigated) return 0;
        const investigatedAt = Date.parse(item.last_investigated);
        if (!Number.isFinite(investigatedAt)) return 0;
        const ageDays = Math.max(0, (now - investigatedAt) / dayMs);
        return Math.exp(-ageDays / 180);
    };

    const getCategoryScore = (item, q) => {
        const itemCategories = (item.categories || []).map(c => c.toLowerCase());
        if (itemCategories.length === 0) return 0;

        const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return 0;

        const matches = terms.filter(term =>
            itemCategories.some(cat => cat === term || cat.includes(term))
        );
        return matches.length / terms.length;
    };

    const weights = {
        category: 0.2,
        text: 0.55 - (0.2 * intentStrength),
        quality: 0.15 + (0.1 * intentStrength),
        price: 0.05 + (0.05 * intentStrength),
        freshness: 0.05 + (0.05 * intentStrength)
    };

    const scoreMin = Number.parseFloat(filters.scoreMin) || 0;
    const scoreMax = filters.scoreMax !== '' && filters.scoreMax != null ? Number.parseFloat(filters.scoreMax) : Number.MAX_SAFE_INTEGER;
    const priceMin = Number.parseFloat(filters.priceMin) || 0;
    const priceMax = filters.priceMax !== '' && filters.priceMax != null ? Number.parseFloat(filters.priceMax) : Number.MAX_SAFE_INTEGER;

    return validResults
        .map(result => {
            const item = result.item || {};
            const textScore = getNormalizedFuseScore(result.score);
            const qualityScore = getQualityScore(item);
            const priceScore = getPriceScore(item);
            const freshnessScore = getFreshnessScore(item);
            const categoryScore = getCategoryScore(item, query);

            const rerankScore =
                (categoryScore * weights.category) +
                (textScore * weights.text) +
                (qualityScore * weights.quality) +
                (priceScore * weights.price) +
                (freshnessScore * weights.freshness);

            return {
                ...result,
                rerankScore
            };
        })
        .filter(result => {
            const item = result.item || {};
            const score = Number.parseFloat(item.score) || 0;
            const price = Number.parseFloat(item.price_value) || 0;

            if (score < scoreMin) return false;
            if (Number.isFinite(scoreMax) && score > scoreMax) return false;
            if (price < priceMin) return false;
            if (Number.isFinite(priceMax) && price > priceMax) return false;

            return true;
        })
        .sort((a, b) => b.rerankScore - a.rerankScore);
}

self.onmessage = async function (e) {
    const data = e.data || {};
    const type = data.type;

    if (type === 'INIT') {
        try {
            if (typeof Fuse === 'undefined') {
                importScripts('https://cdn.jsdelivr.net/npm/fuse.js@6.6.2');
            }
            const res = await fetch(data.searchIndexUrl || '/index.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            searchIndex = await res.json();

            // Fuse.createIndex による事前インデックス化
            const fuseIndex = Fuse.createIndex(FUSE_OPTIONS.keys, searchIndex);
            fuse = new Fuse(searchIndex, FUSE_OPTIONS, fuseIndex);

            self.postMessage({ type: 'READY' });
        } catch (err) {
            self.postMessage({ type: 'ERROR', error: String(err) });
        }
    } else if (type === 'SEARCH') {
        const { query, filters, searchId } = data;
        if (!fuse) {
            self.postMessage({ type: 'SEARCH_RESULTS', results: [], query, searchId, notReady: true });
            return;
        }

        try {
            const fuseResults = fuse.search(query);
            const results = rerankResults(fuseResults, query, filters);
            self.postMessage({ type: 'SEARCH_RESULTS', results, query, searchId });
        } catch (err) {
            self.postMessage({ type: 'ERROR', error: String(err), searchId });
        }
    }
};
