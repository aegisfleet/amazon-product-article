(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SearchCore = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : self, function () {
    'use strict';

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

    function isAsin(str) {
        if (typeof str !== 'string') return false;
        return /^[A-Z0-9]{10}$/i.test(str.trim());
    }

    function toYen(value, unit) {
        const num = Number.parseFloat(value);
        if (!Number.isFinite(num)) return 0;
        if (unit === '万') return num * 10000;
        if (unit === '千') return num * 1000;
        return num;
    }

    function parseBudgetFromQuery(query) {
        const normalizedQuery = String(query || '').replaceAll(/\s+/g, '');
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

    // --- 日英ブランドエイリアス辞書（MCP data.py と同期） ---
    const BRAND_ALIAS_PAIRS = [
        ['Sony', 'ソニー'], ['Apple', 'アップル'], ['Panasonic', 'パナソニック'],
        ['Logicool', 'ロジクール'], ['Logitech', 'ロジクール'], ['Xiaomi', 'シャオミ'],
        ['Samsung', 'サムスン'], ['LG', 'エルジー'], ['ASUS', 'エイスース'],
        ['Acer', 'エイサー'], ['Dell', 'デル'], ['Lenovo', 'レノボ'],
        ['Microsoft', 'マイクロソフト'], ['Google', 'グーグル'], ['Amazon', 'アマゾン'],
        ['Anker', 'アンカー'], ['Elecom', 'エレコム'], ['Buffalo', 'バッファロー'],
        ['Dyson', 'ダイソン'], ['Shark', 'シャーク'], ['Philips', 'フィリップス'],
        ['Hitachi', '日立'], ['Toshiba', '東芝'], ['Sharp', 'シャープ'],
        ['Fujifilm', '富士フイルム'], ['Canon', 'キヤノン'], ['Nikon', 'ニコン'],
        ['Casio', 'カシオ'], ['Seiko', 'セイコー'], ['Citizen', 'シチズン'],
        ['Nike', 'ナイキ'], ['Adidas', 'アディダス'], ['New Balance', 'ニューバランス'],
        ['The North Face', 'ノースフェイス'], ['Coleman', 'コールマン'],
        ['Snow Peak', 'スノーピーク'], ['mont-bell', 'モンベル'], ['Bosch', 'ボッシュ'],
        ['Makita', 'マキタ'], ['Lego', 'レゴ'], ['Bandai', 'バンダイ'],
        ['Nintendo', '任天堂'], ['Nintendo', 'ニンテンドー'], ['Sanrio', 'サンリオ'],
        ['MUJI', '無印良品'], ['Iris Ohyama', 'アイリスオーヤマ'], ['Yamazen', '山善'],
        ['Nitori', 'ニトリ']
    ];

    // 推移閉包で双方向エイリアスセットを構築（例: Logicool <-> ロジクール <-> Logitech）
    const BRAND_ALIAS_MAP = new Map();
    for (const [rawA, rawB] of BRAND_ALIAS_PAIRS) {
        const a = normalizeSearchText(rawA);
        const b = normalizeSearchText(rawB);
        const merged = new Set([a, b]);
        if (BRAND_ALIAS_MAP.has(a)) {
            for (const v of BRAND_ALIAS_MAP.get(a)) merged.add(v);
        }
        if (BRAND_ALIAS_MAP.has(b)) {
            for (const v of BRAND_ALIAS_MAP.get(b)) merged.add(v);
        }
        for (const v of merged) {
            BRAND_ALIAS_MAP.set(v, merged);
        }
    }

    // --- 略語・規格の同義語グループ（MCP data.py と同期） ---
    const SYNONYM_GROUPS_RAW = [
        ['ノイキャン', 'ノイズキャンセリング', 'ANC', 'アクティブノイズキャンセリング'],
        ['USB-C', 'Type-C', 'USB Type-C', 'USBタイプC', 'タイプC'],
        ['モババ', 'モバイルバッテリー', 'モバイルバッテリ'],
        ['ドラレコ', 'ドライブレコーダー'],
        ['イヤホン', 'イヤフォン'],
        ['ヘッドホン', 'ヘッドフォン']
    ];

    const SYNONYM_GROUPS = SYNONYM_GROUPS_RAW.map(group =>
        Array.from(new Set(group.map(v => normalizeSearchText(v))))
    );

    const SYNONYM_INDEX = new Map();
    for (const group of SYNONYM_GROUPS) {
        for (const variant of group) {
            const existing = SYNONYM_INDEX.get(variant);
            if (existing) {
                const merged = Array.from(new Set([...existing, ...group]));
                for (const v of merged) SYNONYM_INDEX.set(v, merged);
            } else {
                SYNONYM_INDEX.set(variant, group);
            }
        }
    }

    // 複数語フレーズ（空白を含むエイリアス・同義語）を長さ降順で抽出
    const MULTI_WORD_TERMS = Array.from(
        new Set([
            ...Array.from(BRAND_ALIAS_MAP.keys()).filter(k => k.includes(' ')),
            ...Array.from(SYNONYM_INDEX.keys()).filter(k => k.includes(' '))
        ])
    ).sort((a, b) => b.length - a.length);

    // 複合語内の日本語同義語展開用（例: ワイヤレスイヤホン <-> ワイヤレスイヤフォン）
    const SUBSTRING_SYNONYM_ENTRIES = Array.from(SYNONYM_INDEX.entries())
        .filter(([k]) => !/^[\x20-\x7e]+$/.test(k) && k.length >= 3)
        .sort((a, b) => b[0].length - a[0].length);

    function getTermVariants(normTerm) {
        if (!normTerm) return [];
        const variants = new Set([normTerm]);

        if (BRAND_ALIAS_MAP.has(normTerm)) {
            for (const v of BRAND_ALIAS_MAP.get(normTerm)) variants.add(v);
        }
        if (SYNONYM_INDEX.has(normTerm)) {
            for (const v of SYNONYM_INDEX.get(normTerm)) variants.add(v);
        }

        // トークンが直接辞書にない場合でも、複合語中の日本語同義語を展開（例: ワイヤレスイヤホン -> ワイヤレスイヤフォン）
        if (variants.size === 1) {
            for (const [key, group] of SUBSTRING_SYNONYM_ENTRIES) {
                if (normTerm.includes(key)) {
                    for (const alt of group) {
                        variants.add(normTerm.replace(key, alt));
                    }
                    break;
                }
            }
        }

        return Array.from(variants);
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const asciiRegexCache = new Map();
    function getAsciiBoundaryRegex(variant) {
        let re = asciiRegexCache.get(variant);
        if (!re) {
            re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(variant)}(?=$|[^a-z0-9])`);
            asciiRegexCache.set(variant, re);
        }
        return re;
    }

    function variantMatches(variant, haystack) {
        if (!variant || !haystack) return false;
        if (/^[\x20-\x7e]+$/.test(variant)) {
            return getAsciiBoundaryRegex(variant).test(haystack);
        }
        return haystack.includes(variant);
    }

    function tokenizeQuery(query) {
        const norm = normalizeSearchText(query);
        if (!norm) return [];

        const tokenGroups = [];
        let remaining = ` ${norm} `;

        for (const phrase of MULTI_WORD_TERMS) {
            const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}($|[^a-z0-9])`, 'g');
            if (re.test(remaining)) {
                tokenGroups.push(getTermVariants(phrase));
                remaining = remaining.replace(re, '$1 $2');
            }
        }

        const words = remaining.trim().split(/\s+/).filter(Boolean);
        for (const word of words) {
            tokenGroups.push(getTermVariants(word));
        }

        return tokenGroups;
    }

    function prepareSearchIndex(items) {
        if (!Array.isArray(items)) return [];
        for (const item of items) {
            item._norm_title = normalizeSearchText(item.title);
            item._norm_summary = normalizeSearchText(item.summary);
            item._norm_categories = Array.isArray(item.categories)
                ? item.categories.map(c => normalizeSearchText(c))
                : [];
            item._norm_amazon_category = normalizeSearchText(item.amazon_category || '');
            item._norm_specs = normalizeSearchText(item.specs);
            item._norm_brand = normalizeSearchText(item.brand || '');
            item._norm_haystack = [
                item._norm_title,
                item._norm_brand,
                item._norm_categories.join(' '),
                item._norm_amazon_category,
                item._norm_summary,
                item._norm_specs
            ].filter(Boolean).join(' ');
        }
        return items;
    }

    function itemMatchesTokenGroup(variants, haystack) {
        for (const v of variants) {
            if (variantMatches(v, haystack)) return true;
        }
        return false;
    }

    // --- 形態素照合（Sudachi SplitMode B、ビルド時に事前計算） ---
    // 部分一致だけでは「衣類乾燥機」で「衣類ケア乾燥機」が拾えず、
    // 「布団乾燥機」で「ふとん乾燥機」表記も拾えない。scripts/
    // generate_search_morphs.py が public/search-morphs.json（商品ごと
    // の形態素集合）と public/search-vocab.json（表層形→形態素の語彙）を
    // 生成し、クエリはその語彙で最長一致分割して形態素の部分集合で照合
    // する（MCPサーバーと同じ方式）。形態素は一致を広げるだけで、
    // 部分一致で拾えていたものを落とすことはない。データ未読込時は
    // 従来の部分一致のみで動作する。
    let segmentVocab = new Map();
    let segmentBuckets = new Map();
    const segmentCache = new Map();

    function prepareMorphIndex(items, morphData, vocabData) {
        segmentVocab = new Map();
        if (vocabData && typeof vocabData === 'object') {
            for (const [k, v] of Object.entries(vocabData)) {
                if (k && v) segmentVocab.set(k, v);
            }
        }
        segmentBuckets = new Map();
        for (const key of segmentVocab.keys()) {
            const head = key.charAt(0);
            if (!segmentBuckets.has(head)) segmentBuckets.set(head, []);
            segmentBuckets.get(head).push(key);
        }
        for (const bucket of segmentBuckets.values()) {
            bucket.sort((a, b) => b.length - a.length);
        }
        segmentCache.clear();

        const morphMap = (morphData && typeof morphData === 'object') ? morphData : {};
        if (!Array.isArray(items)) return items;
        for (const item of items) {
            const entry = item.asin ? morphMap[item.asin] : null;
            item._morphs = new Set(entry && entry.m ? String(entry.m).split(' ').filter(Boolean) : []);
            item._title_morphs = new Set(entry && entry.t ? String(entry.t).split(' ').filter(Boolean) : []);
        }
        return items;
    }

    function segmentToMorphs(text) {
        if (!text || segmentVocab.size === 0) return new Set();
        const cached = segmentCache.get(text);
        if (cached) return cached;
        const morphs = new Set();
        for (const word of String(text).split(/\s+/).filter(Boolean)) {
            let rest = word;
            while (rest.length > 0) {
                const bucket = segmentBuckets.get(rest.charAt(0)) || [];
                let hit = null;
                for (const key of bucket) {
                    if (key.length <= rest.length && rest.startsWith(key)) {
                        hit = key;
                        break;
                    }
                }
                if (!hit) break;
                morphs.add(segmentVocab.get(hit));
                rest = rest.slice(hit.length);
            }
        }
        segmentCache.set(text, morphs);
        return morphs;
    }

    function variantMorphSubset(variant, morphSet) {
        if (!morphSet || morphSet.size === 0) return false;
        const morphs = segmentToMorphs(variant);
        if (morphs.size === 0) return false;
        for (const m of morphs) {
            if (!morphSet.has(m)) return false;
        }
        return true;
    }

    function itemMatchesTokenGroupMorph(variants, morphSet) {
        if (!morphSet || morphSet.size === 0) return false;
        for (const v of variants) {
            if (variantMorphSubset(v, morphSet)) return true;
        }
        return false;
    }

    function computeExpandedScoreAndPrimaryMatch(item, tokenGroups) {
        if (tokenGroups.length === 0) return { score: 1, isPrimaryMatch: false };

        let titleMatches = 0;
        let categoryMatches = 0;
        const catText = (item._norm_categories || []).join(' ');

        for (const variants of tokenGroups) {
            const inTitle = itemMatchesTokenGroup(variants, item._norm_title)
                || itemMatchesTokenGroupMorph(variants, item._title_morphs);
            const inCat = itemMatchesTokenGroup(variants, catText) || itemMatchesTokenGroup(variants, item._norm_amazon_category);
            if (inTitle) titleMatches++;
            if (inCat) categoryMatches++;
        }

        const total = tokenGroups.length;
        const titleRatio = titleMatches / total;
        const catRatio = categoryMatches / total;
        const isPrimaryMatch = titleMatches > 0 || categoryMatches > 0;

        // Fuse.js のスコア体系（0に近いほど一致度が高い）に合わせた擬似スコア
        let score = 0.25;
        if (titleRatio === 1) {
            score = 0.01;
        } else if (titleMatches > 0 && (titleMatches + categoryMatches) >= total) {
            score = 0.04;
        } else if (titleMatches > 0) {
            score = 0.08 - (titleRatio * 0.04);
        } else if (catRatio > 0) {
            score = 0.12 - (catRatio * 0.04);
        }

        return { score, isPrimaryMatch };
    }

    function searchExpanded(items, query) {
        if (!Array.isArray(items) || items.length === 0) {
            return { results: [], tokenGroups: [], hasExpandedTerm: false };
        }
        const tokenGroups = tokenizeQuery(query);
        if (tokenGroups.length === 0) {
            return { results: [], tokenGroups: [], hasExpandedTerm: false };
        }

        const hasExpandedTerm = tokenGroups.some(variants => variants.length > 1);
        const results = [];

        for (const item of items) {
            const haystack = item._norm_haystack || '';
            let allMatch = true;
            for (const variants of tokenGroups) {
                if (!itemMatchesTokenGroup(variants, haystack)
                    && !itemMatchesTokenGroupMorph(variants, item._morphs)) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) {
                const { score, isPrimaryMatch } = computeExpandedScoreAndPrimaryMatch(item, tokenGroups);
                results.push({ item, score, isPrimaryMatch });
            }
        }

        return { results, tokenGroups, hasExpandedTerm };
    }

    function mergeSearchResults(expandedResults, fuseResults, hasExpandedTerm, tokenGroups) {
        // エイリアス・同義語が展開されたクエリで一致がある場合は、表記ゆれ間で完全同一集合を保証するため expandedResults を正とする
        if (hasExpandedTerm && expandedResults.length > 0) {
            return expandedResults;
        }

        const byKey = new Map();
        const getKey = (item) => item.asin || item.permalink || item.title;

        for (const r of expandedResults) {
            byKey.set(getKey(r.item), r);
        }

        for (const r of fuseResults || []) {
            if (!r || !r.item) continue;
            const key = getKey(r.item);
            const existing = byKey.get(key);
            if (!existing) {
                const { isPrimaryMatch } = computeExpandedScoreAndPrimaryMatch(r.item, tokenGroups);
                byKey.set(key, { ...r, isPrimaryMatch });
            } else if (Number.isFinite(r.score) && r.score < existing.score) {
                // Fuse側の方がより低い（良い）スコアの場合は、良い方を採用しつつ primaryMatch は維持
                existing.score = Math.min(existing.score, r.score);
            }
        }

        return Array.from(byKey.values());
    }

    function parseOptionalNumber(val) {
        if (val === '' || val === null || val === undefined) return null;
        const num = Number.parseFloat(val);
        return Number.isFinite(num) ? num : null;
    }

    function getValidPrice(item) {
        const raw = item?.price_value;
        if (raw === '' || raw === null || raw === undefined) return null;
        const num = typeof raw === 'number' ? raw : Number.parseFloat(raw);
        return Number.isFinite(num) && num > 0 ? num : null;
    }

    function getInvestigatedTs(item) {
        if (!item?.last_investigated) return 0;
        const ts = Date.parse(item.last_investigated);
        return Number.isFinite(ts) ? ts : 0;
    }

    function rerankResults(results, query, filters = {}) {
        if (!Array.isArray(results) || results.length === 0) {
            return { results: [], unfilteredScoreCount: 0, unfilteredPriceCount: 0 };
        }

        // Fuse.jsのスコアが0.85より悪い（一致度が極めて低い）ものは除外
        const validResults = results.filter(r => !Number.isFinite(r.score) || r.score <= 0.85);
        if (validResults.length === 0) {
            return { results: [], unfilteredScoreCount: 0, unfilteredPriceCount: 0 };
        }

        const trimmedQuery = String(query || '').trim();
        const queryLength = trimmedQuery.length;
        const tokenGroups = tokenizeQuery(trimmedQuery);
        const queryTerms = tokenGroups.length || trimmedQuery.split(/\s+/).filter(Boolean).length;
        const intentStrength = Math.min(1, Math.max(0, ((queryLength - 2) / 10) + ((queryTerms - 1) * 0.08)));

        const fuseScores = validResults.map(result => Number.isFinite(result.score) ? result.score : 1);
        const minFuseScore = Math.min(...fuseScores);
        const maxFuseScore = Math.max(...fuseScores);
        const fuseScoreRange = maxFuseScore - minFuseScore;

        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const queryBudget = parseBudgetFromQuery(trimmedQuery);

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
            const numericPrice = getValidPrice(item);

            if (queryBudget) {
                if (numericPrice === null) return 0;

                if (queryBudget.min && numericPrice < queryBudget.min) return 0;
                if (queryBudget.max && numericPrice > queryBudget.max) return 0;

                const center = queryBudget.max && queryBudget.min
                    ? (queryBudget.min + queryBudget.max) / 2
                    : (queryBudget.max || queryBudget.min || numericPrice);
                const distance = Math.abs(numericPrice - center);
                const tolerance = Math.max(center * 0.5, 1000);
                return Math.max(0, 1 - (distance / tolerance));
            }

            if (numericPrice !== null) return 0.7;
            return item.price ? 0.5 : 0;
        };

        const getFreshnessScore = (item) => {
            const investigatedAt = getInvestigatedTs(item);
            if (!investigatedAt) return 0;
            const ageDays = Math.max(0, (now - investigatedAt) / dayMs);
            return Math.exp(-ageDays / 180);
        };

        const getCategoryScore = (item) => {
            const itemCategories = item._norm_categories || (item.categories || []).map(c => normalizeSearchText(c));
            if (itemCategories.length === 0 || tokenGroups.length === 0) return 0;

            const matches = tokenGroups.filter(variants =>
                itemCategories.some(cat => variants.some(v => cat === v || variantMatches(v, cat)))
            );
            return matches.length / tokenGroups.length;
        };

        const weights = {
            category: 0.2,
            text: 0.55 - (0.2 * intentStrength),
            quality: 0.15 + (0.1 * intentStrength),
            price: 0.05 + (0.05 * intentStrength),
            freshness: 0.05 + (0.05 * intentStrength)
        };

        const isAsinQuery = isAsin(trimmedQuery);
        const parsedScoreMin = isAsinQuery ? null : parseOptionalNumber(filters.scoreMin);
        const parsedScoreMax = isAsinQuery ? null : parseOptionalNumber(filters.scoreMax);
        const scoreMin = parsedScoreMin !== null ? parsedScoreMin : 0;
        const scoreMax = parsedScoreMax !== null ? parsedScoreMax : Number.MAX_SAFE_INTEGER;

        const priceMin = parseOptionalNumber(filters.priceMin);
        const priceMax = parseOptionalNumber(filters.priceMax);
        const hasPriceFilter = priceMin !== null || priceMax !== null;

        let unfilteredScoreCount = 0;
        let unfilteredPriceCount = 0;

        const scored = validResults.map(result => {
            const item = result.item || {};
            const textScore = getNormalizedFuseScore(result.score);
            const qualityScore = getQualityScore(item);
            const priceScore = getPriceScore(item);
            const freshnessScore = getFreshnessScore(item);
            const categoryScore = getCategoryScore(item);

            const rerankScore =
                (categoryScore * weights.category) +
                (textScore * weights.text) +
                (qualityScore * weights.quality) +
                (priceScore * weights.price) +
                (freshnessScore * weights.freshness);

            let isPrimaryMatch = result.isPrimaryMatch;
            if (typeof isPrimaryMatch !== 'boolean') {
                isPrimaryMatch = computeExpandedScoreAndPrimaryMatch(item, tokenGroups).isPrimaryMatch;
            }

            return {
                ...result,
                rerankScore,
                isPrimaryMatch
            };
        });

        const dealBadgeFilter = typeof filters.dealBadge === 'string' ? filters.dealBadge.trim() : '';

        const filtered = scored.filter(result => {
            const item = result.item || {};
            const score = Number.parseFloat(item.score) || 0;
            const validPrice = getValidPrice(item);

            if (!matchesDealBadge(item, dealBadgeFilter)) {
                return false;
            }

            // スコア条件判定（ASIN検索時はバイパス）
            const passesScore = score >= scoreMin && score <= scoreMax;

            // 価格条件判定（S-3: minPrice または maxPrice 指定時は価格情報なしを除外）
            let passesPrice = true;
            if (hasPriceFilter) {
                if (validPrice === null) {
                    passesPrice = false;
                } else {
                    if (priceMin !== null && validPrice < priceMin) passesPrice = false;
                    if (priceMax !== null && validPrice > priceMax) passesPrice = false;
                }
            }

            if (passesPrice) {
                unfilteredScoreCount++;
            }
            if (passesScore) {
                unfilteredPriceCount++;
            }

            return passesPrice && passesScore;
        });

        const sortMode = filters.sort || 'relevance';
        filtered.sort((a, b) => {
            const itemA = a.item || {};
            const itemB = b.item || {};
            const scoreA = Number.parseFloat(itemA.score) || 0;
            const scoreB = Number.parseFloat(itemB.score) || 0;
            const priceA = getValidPrice(itemA);
            const priceB = getValidPrice(itemB);

            if (sortMode === 'score') {
                if (tokenGroups.length > 0 && a.isPrimaryMatch !== b.isPrimaryMatch) {
                    return a.isPrimaryMatch ? -1 : 1;
                }
                if (scoreB !== scoreA) return scoreB - scoreA;
                return b.rerankScore - a.rerankScore;
            }

            if (sortMode === 'price-asc') {
                const hasPriceA = priceA !== null;
                const hasPriceB = priceB !== null;
                if (hasPriceA !== hasPriceB) {
                    return hasPriceA ? -1 : 1;
                }
                if (hasPriceA && hasPriceB) {
                    if (tokenGroups.length > 0 && a.isPrimaryMatch !== b.isPrimaryMatch) {
                        return a.isPrimaryMatch ? -1 : 1;
                    }
                    if (priceA !== priceB) return priceA - priceB;
                }
                if (scoreB !== scoreA) return scoreB - scoreA;
                return b.rerankScore - a.rerankScore;
            }

            if (sortMode === 'newest') {
                const tsA = getInvestigatedTs(itemA);
                const tsB = getInvestigatedTs(itemB);
                if (tsB !== tsA) return tsB - tsA;
                if (scoreB !== scoreA) return scoreB - scoreA;
                return b.rerankScore - a.rerankScore;
            }

            // 既定: relevance
            return b.rerankScore - a.rerankScore;
        });

        return {
            results: filtered,
            unfilteredScoreCount,
            unfilteredPriceCount
        };
    }

    function matchesDealBadge(item, dealBadgeFilter) {
        if (!dealBadgeFilter) return true;
        const badge = String(item?.deal_badge || '').trim();
        if (!badge) return false;
        if (dealBadgeFilter === '__ANY_DEAL__') return true;
        if (dealBadgeFilter.startsWith('event:')) {
            return badge.includes(dealBadgeFilter.slice('event:'.length));
        }
        return badge === dealBadgeFilter;
    }

    function searchWithCore(items, fuseInstance, query, filters = {}) {
        const normalizedQuery = normalizeSearchText(query);
        const dealBadgeFilter = typeof filters.dealBadge === 'string' ? filters.dealBadge.trim() : '';
        if (!normalizedQuery) {
            if (!dealBadgeFilter) {
                return { results: [], unfilteredScoreCount: 0, unfilteredPriceCount: 0 };
            }
            const badgeMatched = (items || [])
                .filter(item => matchesDealBadge(item, dealBadgeFilter))
                .map(item => ({ item, score: 0, isPrimaryMatch: true }));
            return rerankResults(badgeMatched, '', filters);
        }

        const { results: expandedResults, tokenGroups, hasExpandedTerm } = searchExpanded(items, query);
        const fuseResults = fuseInstance ? fuseInstance.search(normalizedQuery) : [];
        const merged = mergeSearchResults(expandedResults, fuseResults, hasExpandedTerm, tokenGroups);

        return rerankResults(merged, query, filters);
    }

    return {
        normalizeSearchText,
        isAsin,
        toYen,
        parseBudgetFromQuery,
        tokenizeQuery,
        variantMatches,
        prepareSearchIndex,
        prepareMorphIndex,
        segmentToMorphs,
        searchExpanded,
        mergeSearchResults,
        rerankResults,
        matchesDealBadge,
        searchWithCore,
        getTermVariants,
        getValidPrice
    };
}));
