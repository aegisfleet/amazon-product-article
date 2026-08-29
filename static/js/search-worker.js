/**
 * Search Web Worker for offloading Fuse.js fuzzy search and reranking
 */

let fuse = null;
let searchIndex = null;

function normalizeSearchText(text) {
    if (typeof text !== 'string') {
        if (text == null) return '';
        text = String(text);
    }
    return text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\u30a1-\u30f6]/g, (s) => String.fromCodePoint(s.codePointAt(0) - 0x60))
        .replaceAll('　', ' ')
        .trim();
}

let asinVariations = {};

const FUSE_OPTIONS = {
    keys: [
        { name: "asin", weight: 1 },
        { name: "parent_asin", weight: 1 },
        { name: "_norm_title", weight: 0.7 },
        { name: "_norm_contents", weight: 0.2 },
        { name: "_norm_categories", weight: 1 },
        { name: "_norm_specs", weight: 0.3 }
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

function isAsin(str) {
    if (!str) return false;
    return /^[A-Z0-9]{10}$/i.test(str.trim());
}

function rerankResults(results, query, filters = {}) {
    if (!Array.isArray(results) || results.length === 0) return { results: [], unfilteredScoreCount: 0 };

    // Fuse.jsのスコアが0.85より悪い（一致度が極めて低い）ものは除外
    const validResults = results.filter(r => !Number.isFinite(r.score) || r.score <= 0.85);
    if (validResults.length === 0) return { results: [], unfilteredScoreCount: 0 };

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
        const itemCategories = item._norm_categories || (item.categories || []).map(c => normalizeSearchText(c));
        if (itemCategories.length === 0) return 0;

        const terms = normalizeSearchText(q).split(/\s+/).filter(Boolean);
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

    const isAsinQuery = isAsin(query);
    const scoreMin = isAsinQuery ? 0 : (Number.parseFloat(filters.scoreMin) || 0);
    const scoreMax = !isAsinQuery && filters.scoreMax !== '' && filters.scoreMax != null ? Number.parseFloat(filters.scoreMax) : Number.MAX_SAFE_INTEGER;
    const priceMin = Number.parseFloat(filters.priceMin) || 0;
    const priceMax = filters.priceMax !== '' && filters.priceMax != null ? Number.parseFloat(filters.priceMax) : Number.MAX_SAFE_INTEGER;

    let unfilteredScoreCount = 0;

    const rerankedList = validResults
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

            // 価格フィルター判定
            if (price < priceMin) return false;
            if (Number.isFinite(priceMax) && price > priceMax) return false;

            // 価格条件を満たす全スコア候補数をカウント
            unfilteredScoreCount++;

            // スコアフィルター判定（ASIN検索時はバイパス）
            if (score < scoreMin) return false;
            if (Number.isFinite(scoreMax) && score > scoreMax) return false;

            return true;
        })
        .sort((a, b) => b.rerankScore - a.rerankScore);

    return {
        results: rerankedList,
        unfilteredScoreCount
    };
}

async function handleInit(searchIndexUrl) {
    try {
        if (typeof Fuse === 'undefined') {
            importScripts('https://cdn.jsdelivr.net/npm/fuse.js@6.6.2');
        }
        const res = await fetch(searchIndexUrl || '/index.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        searchIndex = await res.json();

        for (const item of searchIndex) {
            item._norm_title = normalizeSearchText(item.title);
            item._norm_contents = normalizeSearchText(item.contents);
            item._norm_categories = Array.isArray(item.categories)
                ? item.categories.map(c => normalizeSearchText(c))
                : [];
            item._norm_specs = normalizeSearchText(item.specs);
        }

        try {
            const varRes = await fetch('/data/asin-variations.json');
            if (varRes.ok) {
                asinVariations = await varRes.json();
            }
        } catch {
            // バリエーションデータが存在しない場合は無視
        }

        // Fuse.createIndex による事前インデックス化
        const fuseIndex = Fuse.createIndex(FUSE_OPTIONS.keys, searchIndex);
        fuse = new Fuse(searchIndex, FUSE_OPTIONS, fuseIndex);

        self.postMessage({ type: 'READY' });
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: String(err) });
    }
}

function handleSearch(query, filters, searchId) {
    if (!fuse) {
        self.postMessage({ type: 'SEARCH_RESULTS', results: [], unfilteredScoreCount: 0, query, searchId, notReady: true });
        return;
    }

    try {
        const trimmed = query.trim().toUpperCase();
        let targetQuery = query;

        // クエリがASIN形式で、子ASINのバリエーションマップに存在する場合、親ASINで検索
        if (isAsin(trimmed) && asinVariations[trimmed]) {
            targetQuery = asinVariations[trimmed];
        }

        const normalizedQuery = normalizeSearchText(targetQuery);
        let fuseResults = fuse.search(normalizedQuery);

        // 親ASINでヒットしなかった場合、元のクエリでも試行
        if (fuseResults.length === 0 && targetQuery !== query) {
            fuseResults = fuse.search(normalizeSearchText(query));
        }

        const { results, unfilteredScoreCount } = rerankResults(fuseResults, query, filters);
        self.postMessage({ type: 'SEARCH_RESULTS', results, unfilteredScoreCount, query, searchId });
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: String(err), searchId });
    }
}

self.onmessage = async function (e) {
    const data = e.data || {};
    if (data.type === 'INIT') {
        await handleInit(data.searchIndexUrl);
    } else if (data.type === 'SEARCH') {
        handleSearch(data.query, data.filters, data.searchId);
    }
};
