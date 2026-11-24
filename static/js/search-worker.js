/**
 * Search Web Worker for offloading Fuse.js fuzzy search and reranking
 */

importScripts('search-core.js');

let fuse = null;
let searchIndex = null;

let asinVariations = {};
let asinMap = new Map();
let parentAsinMap = new Map();

const FUSE_OPTIONS = {
    keys: [
        { name: "asin", weight: 1 },
        { name: "parent_asin", weight: 1 },
        { name: "_norm_title", weight: 0.8 },
        { name: "_norm_summary", weight: 0.5 },
        { name: "_norm_categories", weight: 0.8 },
        { name: "_norm_amazon_category", weight: 0.6 },
        { name: "_norm_specs", weight: 0.3 }
    ],
    threshold: 0.2,
    distance: 100,
    includeScore: true,
    ignoreLocation: true,
    useExtendedSearch: true
};

async function handleInit(searchIndexUrl) {
    try {
        if (typeof Fuse === 'undefined') {
            importScripts('https://cdn.jsdelivr.net/npm/fuse.js@6.6.2');
        }
        const res = await fetch(searchIndexUrl || '/index.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        searchIndex = await res.json();

        SearchCore.prepareSearchIndex(searchIndex);

        // 形態素データ（ビルド時に Sudachi で生成）。取得できなくても
        // 部分一致検索は従来どおり動くため、失敗は無視する。
        try {
            const [morphRes, vocabRes] = await Promise.all([
                fetch('/search-morphs.json'),
                fetch('/search-vocab.json')
            ]);
            if (morphRes.ok && vocabRes.ok) {
                SearchCore.prepareMorphIndex(
                    searchIndex,
                    await morphRes.json(),
                    await vocabRes.json()
                );
            }
        } catch {
            // 形態素照合なしで継続
        }

        asinMap.clear();
        parentAsinMap.clear();
        for (const item of searchIndex) {
            if (item.asin) {
                asinMap.set(item.asin.toUpperCase(), item);
            }
            if (item.parent_asin) {
                const parentKey = item.parent_asin.toUpperCase();
                if (!parentAsinMap.has(parentKey)) {
                    parentAsinMap.set(parentKey, []);
                }
                parentAsinMap.get(parentKey).push(item);
            }
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
    if (!fuse || !searchIndex) {
        self.postMessage({
            type: 'SEARCH_RESULTS',
            results: [],
            unfilteredScoreCount: 0,
            unfilteredPriceCount: 0,
            query,
            searchId,
            notReady: true
        });
        return;
    }

    try {
        const trimmed = String(query || '').trim().toUpperCase();

        // クエリがASIN形式の場合、O(1) ハッシュマップ直接ルックアップで即時返却（Fuse.js全文走査をバイパス）
        if (SearchCore.isAsin(trimmed)) {
            const targetAsin = asinVariations[trimmed] || trimmed;
            const directItem = asinMap.get(targetAsin) || asinMap.get(trimmed);

            if (directItem) {
                self.postMessage({
                    type: 'SEARCH_RESULTS',
                    results: [{ item: directItem, score: 0, rerankScore: 1 }],
                    unfilteredScoreCount: 1,
                    unfilteredPriceCount: 1,
                    query,
                    searchId
                });
                return;
            }

            // 親ASINマップでの照合
            const parentItems = parentAsinMap.get(targetAsin) || parentAsinMap.get(trimmed);
            if (parentItems && parentItems.length > 0) {
                const results = parentItems.map(item => ({ item, score: 0, rerankScore: 1 }));
                self.postMessage({
                    type: 'SEARCH_RESULTS',
                    results,
                    unfilteredScoreCount: results.length,
                    unfilteredPriceCount: results.length,
                    query,
                    searchId
                });
                return;
            }

            // インデックスに存在しないASINの場合、Fuse全文検索をスキップして即時0件返却
            self.postMessage({
                type: 'SEARCH_RESULTS',
                results: [],
                unfilteredScoreCount: 0,
                unfilteredPriceCount: 0,
                query,
                searchId
            });
            return;
        }

        const { results, unfilteredScoreCount, unfilteredPriceCount } = SearchCore.searchWithCore(
            searchIndex,
            fuse,
            query,
            filters
        );
        self.postMessage({
            type: 'SEARCH_RESULTS',
            results,
            unfilteredScoreCount,
            unfilteredPriceCount,
            query,
            searchId
        });
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
