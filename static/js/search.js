const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const AMAZON_URL_PATH_REGEX =
    /(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|o\/ASIN|product-reviews|d)\/([A-Z0-9]{10})(?:[/?#&]|$)/i;
const AMAZON_QUERY_REGEX = /[?&](?:asin|pd_rd_i)=([A-Z0-9]{10})(?:[&#]|$)/i;
const SHORT_AMAZON_URL_REGEX =
    /^https?:\/\/(?:amzn\.(?:to|asia|eu|in|com)|a\.co|link\.amazon)\/[^\s]+/i;

function isAsin(val) {
    if (typeof val !== 'string') return false;
    return ASIN_REGEX.test(val.trim());
}

function extractAsinFromUrl(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    const pathMatch = AMAZON_URL_PATH_REGEX.exec(trimmed);
    if (pathMatch?.[1]) {
        return pathMatch[1].toUpperCase();
    }
    const queryMatch = AMAZON_QUERY_REGEX.exec(trimmed);
    if (queryMatch?.[1]) {
        return queryMatch[1].toUpperCase();
    }
    return null;
}

function isShortAmazonUrl(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (SHORT_AMAZON_URL_REGEX.test(trimmed)) return true;

    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();
        if (
            host.includes('amazon') ||
            host.includes('amzn') ||
            host === 'a.co' ||
            host.endsWith('.amazon')
        ) {
            return true;
        }
    } catch {
        // Not a valid URL
    }
    return false;
}

async function resolveShortUrl(shortUrl) {
    const trimmed = shortUrl.trim();
    const resolvers = [
        async (u) => {
            const res = await fetch(`https://unshorten.me/json/${encodeURIComponent(u)}`, {
                signal: AbortSignal.timeout(4000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data?.success && data?.resolved_url) {
                return data.resolved_url;
            }
            throw new Error('Unshorten.me resolution failed');
        },
        async (u) => {
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, {
                signal: AbortSignal.timeout(4000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data?.status?.url) {
                return data.status.url;
            }
            throw new Error('AllOrigins resolution failed');
        }
    ];

    for (const resolver of resolvers) {
        try {
            const resolved = await resolver(trimmed);
            if (resolved) return resolved;
        } catch (e) {
            console.warn('Short URL resolver attempt failed:', e);
        }
    }
    return null;
}

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

function isValidQuery(query) {
    if (typeof query !== 'string') return false;
    const trimmed = query.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length >= 2) return true;
    // 1文字の場合、ひらがな・カタカナ以外の文字種であれば有効とする
    const normalized = normalizeSearchText(trimmed);
    const isKanaSingle = /^[ぁ-ん]$/.test(normalized);
    return !isKanaSingle;
}

function toYen(value, unit) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return 0;
    if (unit === '万') return num * 10000;
    if (unit === '千') return num * 1000;
    return num;
}

function sanitizeCategoryUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return null;
    try {
        const parsed = new URL(rawUrl, globalThis.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.href;
    } catch (e) {
        console.warn('Failed to sanitize category URL:', e);
        return null;
    }
}

function getScoreBadgeClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-caution';
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

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function rerankResults(results, query) {
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

    const getCategoryScore = (item, query) => {
        const itemCategories = item._norm_categories || (item.categories || []).map(c => normalizeSearchText(c));
        if (itemCategories.length === 0) return 0;

        const queryTerms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
        if (queryTerms.length === 0) return 0;

        // クエリ単語がカテゴリー名のいずれかと一致する度合いを算出
        const matches = queryTerms.filter(term =>
            itemCategories.some(cat => cat === term || cat.includes(term))
        );
        return matches.length / queryTerms.length;
    };

    const weights = {
        category: 0.2,             // カテゴリー一致の優先度
        text: 0.55 - (0.2 * intentStrength), // 純粋なテキスト一致
        quality: 0.15 + (0.1 * intentStrength),
        price: 0.05 + (0.05 * intentStrength),
        freshness: 0.05 + (0.05 * intentStrength)
    };

    const isAsinQuery = isAsin(query);
    const scoreMin = isAsinQuery ? 0 : (Number.parseFloat(document.getElementById('filter-score-min')?.value) || 0);
    const scoreMax = !isAsinQuery && document.getElementById('filter-score-max')?.value !== '' ? (Number.parseFloat(document.getElementById('filter-score-max')?.value) || 100) : Number.MAX_SAFE_INTEGER;
    const priceMin = Number.parseFloat(document.getElementById('filter-price-min')?.value) || 0;
    const priceMax = document.getElementById('filter-price-max')?.value !== '' ? (Number.parseFloat(document.getElementById('filter-price-max')?.value) || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;

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
            // Apply UI filters during reranking
            const item = result.item || {};
            const score = Number.parseFloat(item.score) || 0;
            const price = Number.parseFloat(item.price_value) || 0;

            if (price < priceMin) return false;
            if (Number.isFinite(priceMax) && price > priceMax) return false;

            // 価格条件を満たす全スコア候補数をカウント
            unfilteredScoreCount++;

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

function searchWithRerank(fuseInstance, query) {
    if (!fuseInstance) return { results: [], unfilteredScoreCount: 0 };
    const normalizedQuery = normalizeSearchText(query);
    return rerankResults(fuseInstance.search(normalizedQuery), query);
}

function isStateEqual(state1, state2) {
    if (!state1 || !state2) return false;
    return state1.query === state2.query &&
           state1.scoreMin === state2.scoreMin &&
           state1.scoreMax === state2.scoreMax &&
           state1.priceMin === state2.priceMin &&
           state1.priceMax === state2.priceMax;
}

document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    let fuse = null;
    let searchWorker = null;
    let isWorkerFailed = false;
    let searchIdSequence = 0;
    let latestSearchId = 0;
    let lastSearchState = null;
    let handleSearch;

    function getSearchState() {
        return {
            query: searchInput.value.replaceAll('　', ' '),
            scoreMin: document.getElementById('filter-score-min')?.value || '',
            scoreMax: document.getElementById('filter-score-max')?.value || '',
            priceMin: document.getElementById('filter-price-min')?.value || '',
            priceMax: document.getElementById('filter-price-max')?.value || ''
        };
    }

    if (!searchInput || !searchResults) return;

    // Prevent multiple initializations
    if (searchInput.dataset.searchInitialized) {
        return;
    }
    searchInput.dataset.searchInitialized = 'true';

    // ヒーローカードの「検索から探す」ボタンが押された際に検索ボックスにフォーカス
    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const trigger = target.closest('[data-hero-entry="search"], a[href="#search-section"]');
        if (trigger) {
            event.preventDefault();
            const wasFocused = document.activeElement === searchInput;
            searchInput.focus();
            if (wasFocused) {
                searchInput.dispatchEvent(new Event('focus'));
            }
        }
    });

    // 画面左下のフローティング検索ボタン（FAB）の制御
    const floatingSearchFab = document.getElementById('floating-search-fab');
    if (floatingSearchFab) {
        const searchSection = document.getElementById('search-section') || searchInput;

        if (typeof IntersectionObserver !== 'undefined' && searchSection) {
            const fabObserver = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        // 検索セクションが画面上部にスクロールアウトした際にFABを表示
                        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
                            floatingSearchFab.classList.add('is-visible');
                        } else {
                            floatingSearchFab.classList.remove('is-visible');
                        }
                    }
                },
                { threshold: 0 }
            );
            fabObserver.observe(searchSection);
        } else {
            // IntersectionObserver非対応時は常時表示
            floatingSearchFab.classList.add('is-visible');
        }

        floatingSearchFab.addEventListener('click', function (event) {
            event.preventDefault();
            const searchTarget = document.getElementById('search-section') || searchInput;
            searchTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // スムーズスクロールに追従してフォーカス
            setTimeout(() => {
                const wasFocused = document.activeElement === searchInput;
                searchInput.focus();
                if (wasFocused) {
                    searchInput.dispatchEvent(new Event('focus'));
                }
            }, 300);
        });
    }

    // 絞り込みフィルターの条件数バッジ更新と折りたたみUIの制御
    function getActiveFilterCount() {
        let count = 0;
        const scoreMinEl = document.getElementById('filter-score-min');
        const scoreMaxEl = document.getElementById('filter-score-max');
        const priceMinEl = document.getElementById('filter-price-min');
        const priceMaxEl = document.getElementById('filter-price-max');

        if (scoreMinEl && scoreMinEl.value !== '' && scoreMinEl.value !== '70') {
            count++;
        }
        if (scoreMaxEl && scoreMaxEl.value?.trim?.() !== '') {
            count++;
        }
        if (priceMinEl && priceMinEl.value?.trim?.() !== '') {
            count++;
        }
        if (priceMaxEl && priceMaxEl.value?.trim?.() !== '') {
            count++;
        }
        return count;
    }

    function updateSearchActiveChips() {
        const activeChipsContainer = document.getElementById('search-active-chips');
        if (!activeChipsContainer || typeof renderActiveFilterChips !== 'function') return;

        const scoreMinEl = document.getElementById('filter-score-min');
        const scoreMaxEl = document.getElementById('filter-score-max');
        const priceMinEl = document.getElementById('filter-price-min');
        const priceMaxEl = document.getElementById('filter-price-max');

        const scoreMin = scoreMinEl ? scoreMinEl.value.trim() : '';
        const scoreMax = scoreMaxEl ? scoreMaxEl.value.trim() : '';
        const priceMin = priceMinEl ? priceMinEl.value.trim() : '';
        const priceMax = priceMaxEl ? priceMaxEl.value.trim() : '';

        const triggerSearch = () => {
            updateFilterBadge();
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                const event = new Event('input', { bubbles: true });
                searchInput.dispatchEvent(event);
            }
        };

        const chips = [];

        if (scoreMin && scoreMin !== '70') {
            chips.push({
                id: 'scoreMin',
                icon: 'trophy',
                label: `スコア ${scoreMin}点以上`,
                onRemove: () => {
                    if (scoreMinEl) scoreMinEl.value = '70';
                    triggerSearch();
                }
            });
        }

        if (scoreMax) {
            chips.push({
                id: 'scoreMax',
                icon: 'trophy',
                label: `スコア ${scoreMax}点以下`,
                onRemove: () => {
                    if (scoreMaxEl) scoreMaxEl.value = '';
                    triggerSearch();
                }
            });
        }

        if (priceMin) {
            chips.push({
                id: 'priceMin',
                icon: '💰',
                label: `¥${Number(priceMin).toLocaleString()}〜`,
                onRemove: () => {
                    if (priceMinEl) priceMinEl.value = '';
                    triggerSearch();
                }
            });
        }

        if (priceMax) {
            chips.push({
                id: 'priceMax',
                icon: '💰',
                label: `〜¥${Number(priceMax).toLocaleString()}`,
                onRemove: () => {
                    if (priceMaxEl) priceMaxEl.value = '';
                    triggerSearch();
                }
            });
        }

        const resetAll = () => {
            const filterResetBtn = document.getElementById('filter-reset-btn');
            if (filterResetBtn) filterResetBtn.click();
        };

        renderActiveFilterChips(activeChipsContainer, chips, resetAll);
    }

    function updateFilterBadge() {
        const badge = document.getElementById('filter-count-badge');
        if (badge) {
            const count = getActiveFilterCount();
            badge.textContent = String(count);
            if (count > 0) {
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
        updateSearchActiveChips();
    }

    const filterToggleBtn = document.getElementById('search-filter-toggle-btn');
    const filtersWrapper = document.getElementById('search-filters-wrapper');
    if (filterToggleBtn && filtersWrapper) {
        filterToggleBtn.addEventListener('click', () => {
            const isOpen = filtersWrapper.classList.toggle('is-open');
            filterToggleBtn.classList.toggle('is-open', isOpen);
            filterToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            setTimeout(updateSearchResultsHeight, 50);
            setTimeout(updateSearchResultsHeight, 310);
        });
    }

    const filterResetBtn = document.getElementById('filter-reset-btn');
    if (filterResetBtn) {
        filterResetBtn.addEventListener('click', () => {
            const scoreMinEl = document.getElementById('filter-score-min');
            const scoreMaxEl = document.getElementById('filter-score-max');
            const priceMinEl = document.getElementById('filter-price-min');
            const priceMaxEl = document.getElementById('filter-price-max');

            if (scoreMinEl) scoreMinEl.value = '70';
            if (scoreMaxEl) scoreMaxEl.value = '';
            if (priceMinEl) priceMinEl.value = '';
            if (priceMaxEl) priceMaxEl.value = '';

            updateFilterBadge();

            const searchInputWrapper = document.querySelector('.search-input-wrapper');
            if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');

            const query = searchInput.value.replaceAll('　', ' ');
            if (typeof handleSearch === 'function') {
                if (isValidQuery(query) && searchInputWrapper) {
                    searchInputWrapper.classList.add('is-loading');
                }
                handleSearch(query);
            }
        });
    }

    updateFilterBadge();

    // 画面サイズ・デバイス問わず、検索結果の高さを動的に調整（画面下部へのはみ出し・見切れを防止）
    function updateSearchResultsHeight() {
        const searchContainer = document.querySelector('.search-container');
        if (!searchContainer || !searchResults) return;

        // Visual Viewport または window.innerHeight から現在のビューポート高さを取得
        const viewportHeight = globalThis.visualViewport
            ? globalThis.visualViewport.height
            : globalThis.innerHeight;

        // 検索コンテナの下端位置を取得（フィルター開閉状態・画面スクロール位置に追従）
        const containerRect = searchContainer.getBoundingClientRect();
        const containerBottom = containerRect.bottom;

        // 比較トレイが表示されている場合はトレイの高さ分マージンを加算
        let bottomMargin = 20;
        const compareTray = document.getElementById('compare-tray');
        if (compareTray?.classList.contains('is-active')) {
            bottomMargin += (compareTray.offsetHeight || 60);
        }

        // 検索コンテナの底から Viewport の底までの空き高さを算出
        const availableHeight = viewportHeight - containerBottom - bottomMargin;

        // 最小200pxを確保
        const maxHeight = Math.max(200, availableHeight);
        searchResults.style.maxHeight = `${maxHeight}px`;
    }

    // Visual Viewport resize/scroll イベントで高さを動的に更新
    if (globalThis.visualViewport) {
        globalThis.visualViewport.addEventListener('resize', updateSearchResultsHeight);
        globalThis.visualViewport.addEventListener('scroll', updateSearchResultsHeight);
    }

    // ウィンドウリサイズ・スクロール時も更新
    globalThis.addEventListener('resize', updateSearchResultsHeight);
    globalThis.addEventListener('scroll', updateSearchResultsHeight, { passive: true });
    globalThis.addEventListener('apa-compare-tray-change', updateSearchResultsHeight);

    initializeSearch();

    function initializeSearch() {
        const searchInputWrapper = document.querySelector('.search-input-wrapper');
        const searchClearBtn = document.getElementById('search-clear-btn');

        function updateClearButtonState() {
            if (!searchInputWrapper) return;
            if (searchInput.value.length > 0) {
                searchInputWrapper.classList.add('has-value');
            } else {
                searchInputWrapper.classList.remove('has-value');
            }
        }

        // 初期表示時のボタン状態更新
        updateClearButtonState();

        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                searchInput.value = '';
                updateClearButtonState();
                if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
                if (searchResults) searchResults.classList.remove('is-searching');
                handleSearch('');
                searchInput.focus();
            });
        }

        function getFilterParams() {
            return {
                scoreMin: document.getElementById('filter-score-min')?.value || '',
                scoreMax: document.getElementById('filter-score-max')?.value || '',
                priceMin: document.getElementById('filter-price-min')?.value || '',
                priceMax: document.getElementById('filter-price-max')?.value || ''
            };
        }

        // Fetch index.json / worker dynamically from data attribute
        const searchIndexUrl = searchInput.dataset.searchIndexUrl || '/index.json';
        const searchWorkerUrl = searchInput.dataset.searchWorkerUrl || '/js/search-worker.js';

        function fallbackToMainThreadFuse() {
            if (isWorkerFailed) return;
            isWorkerFailed = true;
            searchWorker = null;

            const initFuse = () => {
                fetch(searchIndexUrl)
                    .then(response => response.json())
                    .then(data => {
                        const searchIndex = data;
                        for (const item of searchIndex) {
                            item._norm_title = normalizeSearchText(item.title);
                            item._norm_contents = normalizeSearchText(item.contents);
                            item._norm_categories = Array.isArray(item.categories)
                                ? item.categories.map(c => normalizeSearchText(c))
                                : [];
                            item._norm_specs = normalizeSearchText(item.specs);
                        }
                        fuse = new Fuse(searchIndex, {
                            keys: [
                                { name: "asin", weight: 1 },
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
                        });
                    })
                    .catch(err => console.error('Error loading search index fallback:', err));
            };

            if (globalThis.Fuse) {
                initFuse();
            } else {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2';
                script.integrity = 'sha256-xXM5w/oWsdadmmtGdJqBOe+NT8m7/kgUT/iXqn1CIuw=';
                script.crossOrigin = 'anonymous';
                script.onload = initFuse;
                document.head.appendChild(script);
            }
        }

        // Web Worker の初期化
        if (typeof Worker !== 'undefined') {
            try {
                searchWorker = new Worker(searchWorkerUrl);
                searchWorker.onmessage = (e) => {
                    const data = e.data || {};
                    if (data.type === 'SEARCH_RESULTS') {
                        if (data.searchId === latestSearchId) {
                            displayResults(data.results, data.unfilteredScoreCount || 0);
                            if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
                            if (searchResults) searchResults.classList.remove('is-searching');
                        }
                    } else if (data.type === 'ERROR') {
                        console.warn('Search worker error, falling back to main thread:', data.error);
                        fallbackToMainThreadFuse();
                    }
                };
                searchWorker.onerror = (err) => {
                    console.warn('Search worker error event, falling back to main thread:', err);
                    fallbackToMainThreadFuse();
                };
                searchWorker.postMessage({ type: 'INIT', searchIndexUrl });
            } catch (e) {
                console.warn('Could not initialize Search Worker:', e);
                fallbackToMainThreadFuse();
            }
        } else {
            fallbackToMainThreadFuse();
        }

        function showSkeletonLoading() {
            if (!searchResults) return;
            if (searchResults.querySelector('.search-skeleton-container')) return;

            searchResults.textContent = '';
            const skeletonContainer = document.createElement('div');
            skeletonContainer.className = 'search-skeleton-container card-grid';
            if (typeof renderSkeletonGrid === 'function') {
                skeletonContainer.appendChild(renderSkeletonGrid(6));
            } else {
                for (let i = 0; i < 6; i++) {
                    const card = document.createElement('article');
                    card.className = 'card skeleton-card';
                    const img = document.createElement('div');
                    img.className = 'skeleton-element skeleton-image';
                    card.appendChild(img);
                    const body = document.createElement('div');
                    body.className = 'skeleton-content';
                    const h = document.createElement('div');
                    h.className = 'skeleton-header';
                    const b = document.createElement('div');
                    b.className = 'skeleton-element skeleton-badge';
                    h.appendChild(b);
                    body.appendChild(h);
                    const t1 = document.createElement('div');
                    t1.className = 'skeleton-element skeleton-title';
                    body.appendChild(t1);
                    const t2 = document.createElement('div');
                    t2.className = 'skeleton-element skeleton-title-short';
                    body.appendChild(t2);
                    card.appendChild(body);
                    skeletonContainer.appendChild(card);
                }
            }
            searchResults.appendChild(skeletonContainer);
            searchResults.classList.add('active');
            updateSearchResultsHeight();
        }

        function stopSearchLoading() {
            if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
            if (searchResults) searchResults.classList.remove('is-searching');
        }

        function prepareSearchLoadingUI() {
            const hasItems = Boolean(
                searchResults?.querySelector('.search-result-item') ||
                searchResults?.querySelector('.search-empty-state')
            );
            if (!hasItems) {
                showSkeletonLoading();
            } else if (searchResults) {
                searchResults.classList.add('is-searching', 'active');
            }
        }

        function executeFallbackSearch(query) {
            if (!fuse) return;
            const { results, unfilteredScoreCount } = searchWithRerank(fuse, query);
            displayResults(results, unfilteredScoreCount);
            stopSearchLoading();
        }

        handleSearch = debounce((query) => {
            const trimmedQuery = query.trim();
            if (trimmedQuery.length === 0) {
                displaySearchTips();
                stopSearchLoading();
                return;
            }

            if (!isValidQuery(query)) {
                stopSearchLoading();
                return;
            }

            const searchId = ++searchIdSequence;
            latestSearchId = searchId;

            prepareSearchLoadingUI();

            if (searchWorker && !isWorkerFailed) {
                searchWorker.postMessage({
                    type: 'SEARCH',
                    query,
                    filters: getFilterParams(),
                    searchId
                });
            } else {
                executeFallbackSearch(query);
            }
        }, 150);

        let currentResolvingUrl = null;

        // URLが入力・ペーストされた場合にASINを抽出して検索を実行する
        function processPossibleUrlInput(rawText) {
            const trimmed = (rawText || '').trim();
            if (!trimmed) return false;

            // 1. 通常のAmazon URLまたはURL形式から直接ASIN抽出
            const directAsin = extractAsinFromUrl(trimmed);
            if (directAsin) {
                currentResolvingUrl = null;
                searchInput.value = directAsin;
                updateClearButtonState();
                if (searchInputWrapper) searchInputWrapper.classList.add('is-loading');
                handleSearch(directAsin);
                return true;
            }

            // 2. 短縮URL（amzn.to, amzn.asia, a.co 等）の場合
            if (isShortAmazonUrl(trimmed)) {
                currentResolvingUrl = trimmed;
                if (searchInputWrapper) searchInputWrapper.classList.add('is-loading');

                resolveShortUrl(trimmed).then(resolvedUrl => {
                    // 解決中に別の入力が行われた場合は破棄
                    if (currentResolvingUrl !== trimmed) return;
                    currentResolvingUrl = null;

                    if (resolvedUrl) {
                        const asin = extractAsinFromUrl(resolvedUrl);
                        if (asin) {
                            searchInput.value = asin;
                            updateClearButtonState();
                            handleSearch(asin);
                            return;
                        }
                    }

                    // ASINが見つからなかった場合
                    if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
                    handleSearch(trimmed);
                }).catch(() => {
                    if (currentResolvingUrl !== trimmed) return;
                    currentResolvingUrl = null;
                    if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
                    handleSearch(trimmed);
                });

                return true;
            }

            return false;
        }

        // Event Listeners
        searchInput.addEventListener('input', (e) => {
            updateClearButtonState();
            if (!searchWorker && !fuse) return;
            const isPaste = e.inputType === 'insertFromPaste' || e.inputType === 'insertFromYank';
            if (e.isComposing && !isPaste) return;

            const rawVal = e.target.value;
            if (processPossibleUrlInput(rawVal)) {
                return;
            }

            const query = rawVal.replaceAll('　', ' ');
            if (isValidQuery(query)) {
                if (searchInputWrapper) searchInputWrapper.classList.add('is-loading');
            } else {
                if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
            }
            handleSearch(query);
        });

        // コピペ（ペースト）時にも即時にURL判定・検索を実行
        searchInput.addEventListener('paste', (e) => {
            updateClearButtonState();
            if (!searchWorker && !fuse) return;

            // クリップボードデータから即時判定
            const pastedText = e.clipboardData?.getData('text') || '';
            if (pastedText && processPossibleUrlInput(pastedText)) {
                e.preventDefault();
                return;
            }

            setTimeout(() => {
                updateClearButtonState();
                const rawVal = searchInput.value;
                if (processPossibleUrlInput(rawVal)) {
                    return;
                }

                const query = rawVal.replaceAll('　', ' ');
                if (isValidQuery(query)) {
                    if (searchInputWrapper) searchInputWrapper.classList.add('is-loading');
                } else {
                    if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
                }
                handleSearch(query);
            }, 0);
        });

        // IME入力確定時にも検索を実行
        searchInput.addEventListener('compositionend', (e) => {
            updateClearButtonState();
            if (!searchWorker && !fuse) return;
            const rawVal = e.target.value;
            if (processPossibleUrlInput(rawVal)) {
                return;
            }

            const query = rawVal.replaceAll('　', ' ');
            if (isValidQuery(query)) {
                if (searchInputWrapper) searchInputWrapper.classList.add('is-loading');
                handleSearch(query);
            } else {
                if (searchInputWrapper) searchInputWrapper.classList.remove('is-loading');
            }
        });

        // Filter event listeners to trigger re-search
        ['filter-score-min', 'filter-score-max', 'filter-price-min', 'filter-price-max'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    updateFilterBadge();
                    const query = searchInput.value.replaceAll('　', ' ');
                    if (isValidQuery(query)) {
                        if (searchInputWrapper) searchInputWrapper.classList.add('is-loading');
                        handleSearch(query);
                    }
                });
            }
        });

        // === スクロール関連の状態管理 ===
        let isSearchInputMouseDown = false;
        let lastScrollY = globalThis.scrollY;
        let fadeOutTimeout; // 検索結果フェードアウト用
        let focusScrollTimeout; // フォーカス時のスクロール遅延用
        let isProgramScrolling = false;
        let calibrationInterval = null;

        // 現在のスクロール位置を記録
        function updateScrollPosition() {
            lastScrollY = globalThis.scrollY;
        }

        // 検索窓を見える位置にスクロールする共通関数
        function scrollSearchIntoView(callback) {
            const container = document.querySelector('.search-input-wrapper');
            const header = document.querySelector('.site-header');
            if (!container) {
                isProgramScrolling = false;
                if (callback) callback();
                return;
            }

            // 既存の校正処理があれば停止
            if (calibrationInterval) {
                clearInterval(calibrationInterval);
                calibrationInterval = null;
            }

            // ネイティブスクロールとの競合を防ぐため、現在のスクロールを一度即時停止させる
            globalThis.scrollTo({
                top: globalThis.pageYOffset,
                behavior: 'instant'
            });

            // 位置をチェックして必要ならスクロール実行
            function checkAndScroll(isCalibration = false) {
                // ヘッダーの高さを取得（4rem=64pxをベースに、取得できればその値を使用）
                const headerHeight = (header && header.offsetHeight > 0) ? header.offsetHeight : 64;

                // ターゲットとなるコンテナの上端位置（ヘッダー下 10px）
                const targetTop = headerHeight + 10;

                // 現在のコンテナの絶対位置（Body最上部からの距離）を算出
                // これにより、移動中であっても常に正しい目的地を固定できる
                const currentScrollY = globalThis.pageYOffset;
                const containerRect = container.getBoundingClientRect();
                const containerAbsoluteTop = containerRect.top + currentScrollY;

                const targetScrollY = Math.max(0, containerAbsoluteTop - targetTop);

                // 許容範囲内なら何もしない
                // 初回から厳密（5px）に判定することで、中途半端な位置での停止を防ぐ
                const tolerance = 5;
                if (Math.abs(currentScrollY - targetScrollY) <= tolerance) {
                    return false;
                }

                // 目標位置へスクロール
                // behavior: 'smooth' はキャリブレーションと干渉して「戻り」現象を作るため、
                // 全て instant に統一して正確な貼り付きを優先する
                globalThis.scrollTo({
                    top: targetScrollY,
                    behavior: 'instant'
                });
                return true;
            }

            // 初回スクロール実行
            isProgramScrolling = true;
            checkAndScroll(false);

            // 100ms周期で最大20回（合計2秒間）キャリブレーションを行う
            let count = 0;
            calibrationInterval = setInterval(() => {
                if (++count >= 20) {
                    stopAndFinish();
                    return;
                }
                checkAndScroll(true);
            }, 100);

            function stopAndFinish() {
                if (calibrationInterval) {
                    clearInterval(calibrationInterval);
                    calibrationInterval = null;
                }
                isProgramScrolling = false;
                updateScrollPosition();
                if (callback) callback();
            }

            // ユーザーの手動操作（タッチ/スクロール）を検知して停止する
            const stopOnInteraction = () => {
                if (calibrationInterval) {
                    stopAndFinish();
                }
                globalThis.removeEventListener('touchstart', stopOnInteraction);
                globalThis.removeEventListener('wheel', stopOnInteraction);
            };
            globalThis.addEventListener('touchstart', stopOnInteraction, { passive: true });
            globalThis.addEventListener('wheel', stopOnInteraction, { passive: true });
        }

        // スクロール処理をトリガーする共通関数
        function triggerScroll() {
            if (calibrationInterval) return; // すでに実行中なら重複させない

            scrollSearchIntoView(() => {
                updateSearchResultsHeight();
            });
        }

        // === イベントリスナー ===

        searchInput.addEventListener('mousedown', () => {
            isSearchInputMouseDown = true;
        });

        // 検索窓クリック時: 検索結果が非表示なら再表示
        searchInput.addEventListener('click', (e) => {
            // フォーカス時の遅延実行をキャンセル
            if (focusScrollTimeout) {
                clearTimeout(focusScrollTimeout);
                focusScrollTimeout = null;
            }

            if (searchResults.classList.contains('active')) {
                // すでにアクティブでも位置がずれていれば補正
                triggerScroll();
                return;
            }

            const currentState = getSearchState();
            if (isStateEqual(currentState, lastSearchState)) {
                searchResults.classList.add('active');
                updateSearchResultsHeight();
            } else {
                const query = currentState.query;
                if (!isValidQuery(query)) {
                    displaySearchTips();
                } else if (typeof handleSearch === 'function') {
                    handleSearch(query);
                }
            }

            triggerScroll();
        });

        // 検索窓フォーカス時: スクロール＋検索結果表示
        searchInput.addEventListener('focus', (e) => {
            isProgramScrolling = true;

            // IME（仮想キーボード）の起動を待ってからスクロール
            // clickイベントが後に続く場合はそちらでキャンセルされる
            focusScrollTimeout = setTimeout(() => {
                triggerScroll();
                focusScrollTimeout = null;
            }, 100);

            // 検索結果を表示
            const currentState = getSearchState();
            if (isStateEqual(currentState, lastSearchState)) {
                searchResults.classList.add('active');
                updateSearchResultsHeight();
            } else {
                const query = currentState.query;
                if (!isValidQuery(query)) {
                    displaySearchTips();
                } else if (typeof handleSearch === 'function') {
                    handleSearch(query);
                }
            }
        });

        // 外側クリック時: 検索結果を閉じる（.search-container 内のフィルターやボタン操作、ヒーロー検索導線では閉じない）
        document.addEventListener('click', (e) => {
            if (isSearchInputMouseDown) {
                isSearchInputMouseDown = false;
                return;
            }
            const target = e.target instanceof Element ? e.target : null;
            if (target?.closest('[data-hero-entry="search"], a[href="#search-section"]')) {
                return;
            }
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer?.contains(target)) {
                return;
            }
            if (!searchInput.contains(target) && !searchResults.contains(target)) {
                searchResults.classList.remove('active');
            }
        });

        // 手動スクロール時: 500px以上または検索ボックスが画面外（上部）に完全に消えたら検索結果をフェードアウト
        globalThis.addEventListener('scroll', () => {
            if (isProgramScrolling) return;

            if (!searchResults.classList.contains('active')) {
                updateScrollPosition();
                return;
            }

            const scrollDistance = Math.abs(globalThis.scrollY - lastScrollY);

            // しきい値を500pxに緩和。検索ボックスが画面上部に隠れても、500pxまでは維持する。
            if (scrollDistance > 500) {
                searchResults.classList.add('fade-out');
                clearTimeout(fadeOutTimeout);
                fadeOutTimeout = setTimeout(() => {
                    searchResults.classList.remove('active', 'fade-out');
                    updateScrollPosition();
                }, 200);
            }
        }, { passive: true });
    }

    // アクティブフィルタ情報を収集する
    function getActiveFilters() {
        const filters = [];
        const query = searchInput.value.replaceAll('　', ' ');
        if (isValidQuery(query)) {
            filters.push({ label: `キーワード: ${query.trim()}`, type: 'keyword' });
        }
        const scoreMinEl = document.getElementById('filter-score-min');
        const scoreMaxEl = document.getElementById('filter-score-max');
        const priceMinEl = document.getElementById('filter-price-min');
        const priceMaxEl = document.getElementById('filter-price-max');
        const scoreMin = scoreMinEl ? Number.parseFloat(scoreMinEl.value) : 0;
        const scoreMax = scoreMaxEl && scoreMaxEl.value !== '' ? Number.parseFloat(scoreMaxEl.value) : null;
        const priceMin = priceMinEl && priceMinEl.value !== '' ? Number.parseFloat(priceMinEl.value) : null;
        const priceMax = priceMaxEl && priceMaxEl.value !== '' ? Number.parseFloat(priceMaxEl.value) : null;

        // スコア下限（デフォルト70から変更されているか、または70以外が設定されている場合）
        if (Number.isFinite(scoreMin) && scoreMin > 0) {
            filters.push({ label: `スコア: ${scoreMin}点以上`, type: 'score-min' });
        }
        if (Number.isFinite(scoreMax)) {
            filters.push({ label: `スコア: ${scoreMax}点以下`, type: 'score-max' });
        }
        if (Number.isFinite(priceMin)) {
            filters.push({ label: `価格: ${priceMin.toLocaleString()}円〜`, type: 'price-min' });
        }
        if (Number.isFinite(priceMax)) {
            filters.push({ label: `価格: 〜${priceMax.toLocaleString()}円`, type: 'price-max' });
        }
        return filters;
    }

    // フィルタを種別ごとにリセットして再検索する
    function clearFilter(type) {
        const scoreMinEl = document.getElementById('filter-score-min');
        const scoreMaxEl = document.getElementById('filter-score-max');
        const priceMinEl = document.getElementById('filter-price-min');
        const priceMaxEl = document.getElementById('filter-price-max');
        if (type === 'keyword') {
            searchInput.value = '';
        } else if (type === 'score-min' && scoreMinEl) {
            scoreMinEl.value = '0';
        } else if (type === 'score-max' && scoreMaxEl) {
            scoreMaxEl.value = '';
        } else if (type === 'price-min' && priceMinEl) {
            priceMinEl.value = '';
        } else if (type === 'price-max' && priceMaxEl) {
            priceMaxEl.value = '';
        }
        const query = searchInput.value.replaceAll('　', ' ');
        if (isValidQuery(query)) {
            handleSearch(query);
        } else {
            displaySearchTips();
        }
    }

    // すべてのフィルタをリセットして再検索する
    function clearAllFilters() {
        searchInput.value = '';
        const scoreMinEl = document.getElementById('filter-score-min');
        const scoreMaxEl = document.getElementById('filter-score-max');
        const priceMinEl = document.getElementById('filter-price-min');
        const priceMaxEl = document.getElementById('filter-price-max');
        if (scoreMinEl) scoreMinEl.value = '0';
        if (scoreMaxEl) scoreMaxEl.value = '';
        if (priceMinEl) priceMinEl.value = '';
        if (priceMaxEl) priceMaxEl.value = '';
        displaySearchTips();
    }

    // 件数バナーとフィルタチップを描画する
    function renderResultHeader(count, container) {
        const activeFilters = getActiveFilters();

        const header = document.createElement('div');
        header.className = 'search-result-header';

        // 件数バナー
        const countBadge = document.createElement('span');
        countBadge.className = 'search-result-count';
        countBadge.textContent = `検索結果: ${count}件`;
        header.appendChild(countBadge);

        // フィルタチップ + クリアボタン（アクティブフィルタがある場合）
        if (activeFilters.length > 0) {
            const chipsWrap = document.createElement('div');
            chipsWrap.className = 'active-filters';

            activeFilters.forEach(filter => {
                const chip = document.createElement('span');
                chip.className = 'active-filter-chip';

                const labelSpan = document.createElement('span');
                labelSpan.textContent = filter.label;
                chip.appendChild(labelSpan);

                const clearBtn = document.createElement('button');
                clearBtn.type = 'button';
                clearBtn.className = 'chip-clear-btn';
                clearBtn.setAttribute('aria-label', `${filter.label}を解除`);
                clearBtn.textContent = '✕';
                clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearFilter(filter.type);
                });
                chip.appendChild(clearBtn);
                chipsWrap.appendChild(chip);
            });

            const clearAllBtn = document.createElement('button');
            clearAllBtn.type = 'button';
            clearAllBtn.className = 'clear-all-filters-btn';
            clearAllBtn.textContent = 'すべてクリア';
            clearAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                clearAllFilters();
            });
            chipsWrap.appendChild(clearAllBtn);

            header.appendChild(chipsWrap);
        }

        container.appendChild(header);
    }

    function createEmptyStateIcon() {
        const svgNamespace = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNamespace, 'svg');
        svg.setAttribute('class', 'empty-icon');
        svg.setAttribute('width', '48');
        svg.setAttribute('height', '48');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const circle = document.createElementNS(svgNamespace, 'circle');
        circle.setAttribute('cx', '11');
        circle.setAttribute('cy', '11');
        circle.setAttribute('r', '8');
        svg.appendChild(circle);

        const lines = [
            {x1: '21', y1: '21', x2: '16.65', y2: '16.65'},
            {x1: '11', y1: '8', x2: '11', y2: '14'},
            {x1: '8', y1: '11', x2: '14', y2: '11'}
        ];
        lines.forEach(coords => {
            const line = document.createElementNS(svgNamespace, 'line');
            Object.entries(coords).forEach(([key, value]) => line.setAttribute(key, value));
            svg.appendChild(line);
        });
        return svg;
    }

    function createScoreRelaxBox(unfilteredScoreCount, onRelax) {
        const relaxBox = document.createElement('div');
        relaxBox.className = 'empty-score-relax-box';

        const relaxHeader = document.createElement('div');
        relaxHeader.className = 'empty-score-relax-header';

        const relaxIcon = document.createElement('span');
        relaxIcon.className = 'empty-score-relax-icon';
        relaxIcon.setAttribute('aria-hidden', 'true');
        relaxIcon.textContent = '💡';
        relaxHeader.appendChild(relaxIcon);

        const relaxTitle = document.createElement('span');
        relaxTitle.className = 'empty-score-relax-title';
        relaxTitle.textContent = `全スコア対象なら ${unfilteredScoreCount}件 の商品が見つかりました`;
        relaxHeader.appendChild(relaxTitle);
        relaxBox.appendChild(relaxHeader);

        const relaxBtn = document.createElement('button');
        relaxBtn.type = 'button';
        relaxBtn.className = 'empty-score-relax-btn';
        relaxBtn.setAttribute('aria-label', `全スコアの商品（${unfilteredScoreCount}件）を表示する`);

        const btnText = document.createElement('span');
        btnText.textContent = `全スコアの商品（${unfilteredScoreCount}件）を表示する`;
        relaxBtn.appendChild(btnText);

        const arrowIcon = document.createElement('span');
        arrowIcon.className = 'empty-score-relax-arrow';
        arrowIcon.setAttribute('aria-hidden', 'true');
        arrowIcon.textContent = ' →';
        relaxBtn.appendChild(arrowIcon);

        relaxBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onRelax();
        });

        relaxBox.appendChild(relaxBtn);
        return relaxBox;
    }

    function createProductRequestBox(isAsinOrUrl, requestFormUrl) {
        const requestBox = document.createElement('div');
        requestBox.className = `empty-request-box${isAsinOrUrl ? ' is-asin-query' : ''}`;

        const requestHeader = document.createElement('div');
        requestHeader.className = 'empty-request-header';

        const requestIcon = document.createElement('span');
        requestIcon.className = 'empty-request-icon';
        requestIcon.setAttribute('aria-hidden', 'true');
        requestIcon.textContent = isAsinOrUrl ? '🔍' : '📝';
        requestHeader.appendChild(requestIcon);

        const requestTitle = document.createElement('span');
        requestTitle.className = 'empty-request-title';
        requestTitle.textContent = isAsinOrUrl ? 'この商品はまだ調査されていません' : 'お探しの商品が見つかりませんか？';
        requestHeader.appendChild(requestTitle);
        requestBox.appendChild(requestHeader);

        const requestDesc = document.createElement('p');
        requestDesc.className = 'empty-request-desc';
        requestDesc.textContent = isAsinOrUrl
            ? '商品調査リクエストを送信していただければ、AIが徹底調査して比較記事を作成します！'
            : '調査リクエストフォームからAmazonのURLや商品名を送信していただければ、AIが徹底調査して比較記事を作成します！';
        requestBox.appendChild(requestDesc);

        const requestLink = document.createElement('a');
        requestLink.href = requestFormUrl;
        requestLink.target = '_blank';
        requestLink.rel = 'noopener noreferrer';
        requestLink.className = 'empty-request-btn';
        requestLink.setAttribute('aria-label', '商品調査リクエストフォームを開く（新しいタブで開きます）');

        const btnText = document.createElement('span');
        btnText.textContent = isAsinOrUrl ? 'この商品の調査をリクエストする' : '商品調査をリクエストする';
        requestLink.appendChild(btnText);

        const externalIcon = document.createElement('span');
        externalIcon.className = 'empty-request-external-icon';
        externalIcon.setAttribute('aria-hidden', 'true');
        externalIcon.textContent = ' ↗';
        requestLink.appendChild(externalIcon);

        requestBox.appendChild(requestLink);
        return requestBox;
    }

    function renderEmptyState(unfilteredScoreCount = 0) {
        const query = searchInput ? searchInput.value.replaceAll('　', ' ').trim() : '';
        const emptyState = document.createElement('div');
        emptyState.className = 'search-empty-state';

        // 空結果時もヘッダー（0件 + フィルタチップ）を表示する
        renderResultHeader(0, emptyState);

        const scoreMinEl = document.getElementById('filter-score-min');
        const isScoreFiltered = scoreMinEl && Number.parseFloat(scoreMinEl.value) > 0;
        const isAsinOrUrl = isAsin(query) || Boolean(extractAsinFromUrl(query)) || isShortAmazonUrl(query);
        const hasScoreRelaxationCandidates = !isAsinOrUrl && isScoreFiltered && unfilteredScoreCount > 0;

        emptyState.appendChild(createEmptyStateIcon());

        const title = document.createElement('span');
        title.className = 'empty-title';
        title.textContent = hasScoreRelaxationCandidates ? 'スコア条件に合う商品は見つかりませんでした' : '見つかりませんでした';
        emptyState.appendChild(title);

        const desc = document.createElement('span');
        desc.className = 'empty-desc';
        desc.textContent = hasScoreRelaxationCandidates
            ? `全スコア（70点未満を含む）対象では ${unfilteredScoreCount}件 の商品があります。`
            : '条件を変えて再度お試しください。';
        emptyState.appendChild(desc);

        // スコア緩和提案ボックス（全スコアなら該当商品がある場合）
        if (hasScoreRelaxationCandidates) {
            const relaxBox = createScoreRelaxBox(unfilteredScoreCount, () => {
                if (scoreMinEl) scoreMinEl.value = '0';
                updateFilterBadge();
                updateSearchActiveChips();
                const q = searchInput.value.replaceAll('　', ' ');
                if (isValidQuery(q)) handleSearch(q);
            });
            emptyState.appendChild(relaxBox);
        }

        // 商品調査リクエスト案内（未調査商品への導線）
        const requestFormUrl =
            searchInput.dataset.requestFormUrl ||
            document.getElementById('request-link')?.getAttribute('href') ||
            document.querySelector('.request-link')?.getAttribute('href');

        if (requestFormUrl) {
            emptyState.appendChild(createProductRequestBox(isAsinOrUrl, requestFormUrl));
        }

        searchResults.appendChild(emptyState);
        searchResults.classList.add('active');
        updateSearchResultsHeight();
        lastSearchState = getSearchState();
    }


    function renderCategorySuggestions(categoryCounts, container) {
        const topCategories = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        if (topCategories.length === 0) return;

        const suggestionArea = document.createElement('div');
        suggestionArea.className = 'search-suggestion-area';

        const label = document.createElement('span');
        label.className = 'suggestion-label';
        label.textContent = '🔍 カテゴリから探す:';
        suggestionArea.appendChild(label);

        const suggestionList = document.createElement('div');
        suggestionList.className = 'suggestion-list';

        const urlDataScript = document.getElementById('category-url-data');
        const urlMap = urlDataScript ? JSON.parse(urlDataScript.textContent) : {};

        topCategories.forEach(([cat, count]) => {
            const safeUrl = sanitizeCategoryUrl(urlMap[cat]);
            if (safeUrl) {
                const btn = document.createElement('a');
                btn.href = safeUrl;
                btn.className = 'suggestion-tag';
                const catSpan = document.createElement('span');
                catSpan.textContent = cat;
                const countSmall = document.createElement('small');
                countSmall.textContent = count;
                btn.appendChild(catSpan);
                btn.appendChild(countSmall);
                suggestionList.appendChild(btn);
            }
        });

        if (suggestionList.children.length > 0) {
            suggestionArea.appendChild(suggestionList);
            container.appendChild(suggestionArea);
        }
    }

    function createThumbnailElement(imageSrc, titleText, permalink) {
        const thumbLink = document.createElement('a');
        thumbLink.href = permalink;
        thumbLink.className = 'result-thumbnail-link';
        thumbLink.tabIndex = -1;
        thumbLink.setAttribute('aria-hidden', 'true');

        const thumbDiv = document.createElement('div');
        if (imageSrc) {
            thumbDiv.className = 'result-thumbnail';
            const img = document.createElement('img');
            img.src = imageSrc;
            img.alt = titleText;
            img.loading = 'lazy';
            thumbDiv.appendChild(img);
        } else {
            thumbDiv.className = 'result-thumbnail no-image';
            const span = document.createElement('span');
            span.textContent = 'No Image';
            thumbDiv.appendChild(span);
        }

        thumbLink.appendChild(thumbDiv);
        return thumbLink;
    }

    function createHeaderElement(titleText, permalink, priceText, scoreText, scoreNum) {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'result-header';

        const titleLink = document.createElement('a');
        titleLink.href = permalink;
        titleLink.className = 'result-title-link';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'result-title';
        titleSpan.textContent = titleText;
        titleLink.appendChild(titleSpan);
        headerDiv.appendChild(titleLink);

        const metricsDiv = document.createElement('div');
        metricsDiv.className = 'result-metrics';

        if (priceText) {
            const priceSpan = document.createElement('span');
            priceSpan.className = 'result-price';
            priceSpan.textContent = `💰 ${priceText}`;
            metricsDiv.appendChild(priceSpan);
        }

        if (scoreText) {
            const scoreClass = getScoreBadgeClass(scoreNum);
            const scoreSpan = document.createElement('span');
            scoreSpan.className = `result-score m3-badge m3-badge-score ${scoreClass}`;
            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined icon-score';
            iconSpan.setAttribute('aria-hidden', 'true');
            iconSpan.textContent = 'trophy';
            scoreSpan.appendChild(iconSpan);
            scoreSpan.appendChild(document.createTextNode(` ${scoreText}点`));
            metricsDiv.appendChild(scoreSpan);
        }

        headerDiv.appendChild(metricsDiv);
        return headerDiv;
    }

    function createCompareButton(item, titleText, permalink, imageSrc, priceText, categories) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'result-actions';

        const compareBtn = document.createElement('button');
        compareBtn.type = 'button';
        compareBtn.className = 'btn-compare-card search-compare-btn';
        compareBtn.dataset.compareBtn = '1';
        compareBtn.dataset.asin = item.asin || '';
        compareBtn.dataset.title = titleText || '';
        compareBtn.dataset.url = permalink || '';
        compareBtn.dataset.affiliateUrl = item.affiliate_url || '';
        compareBtn.dataset.image = imageSrc || '';
        compareBtn.dataset.price = priceText || '';
        compareBtn.dataset.score = String(item.score || 0);
        compareBtn.dataset.savings = String(item.savings_percentage || 0);
        compareBtn.dataset.category = categories?.[0] || '';

        let specsValue = '';
        if (item.specs_json) {
            specsValue = typeof item.specs_json === 'string' ? item.specs_json : JSON.stringify(item.specs_json);
        }
        compareBtn.dataset.specs = specsValue;

        const isCompared = Boolean(globalThis.Compare?.isCompared?.(item.asin));
        compareBtn.setAttribute('aria-pressed', isCompared ? 'true' : 'false');
        const titlePrefix = titleText ? `${titleText}を` : '';
        compareBtn.setAttribute('aria-label', isCompared ? `${titlePrefix}比較から削除` : `${titlePrefix}比較に追加`);

        if (isCompared) {
            compareBtn.classList.add('is-compared');
        }

        const compareIcon = document.createElement('span');
        compareIcon.className = 'material-symbols-outlined compare-icon';
        compareIcon.setAttribute('aria-hidden', 'true');
        compareIcon.textContent = isCompared ? 'check_circle' : 'balance';

        const compareLabel = document.createElement('span');
        compareLabel.className = 'compare-label';
        compareLabel.textContent = isCompared ? '比較中' : '比較';

        compareBtn.appendChild(compareIcon);
        compareBtn.appendChild(compareLabel);
        actionsDiv.appendChild(compareBtn);
        return actionsDiv;
    }

    function renderSearchResultItem(item) {
        const titleText = item.title;
        const summaryText = item.summary || '';
        const imageSrc = item.image;
        const priceText = item.price;
        const categories = item.categories || [];

        let permalink = item.permalink || '';
        if (permalink && !permalink.startsWith('http') && !permalink.startsWith('/')) {
            permalink = '/';
        }
        const scoreText = String(item.score || '');
        const scoreNum = Number.parseInt(item.score, 10) || 0;

        const resultItem = document.createElement('article');
        resultItem.className = 'search-result-item';
        if (item.asin) {
            resultItem.dataset.asin = item.asin;
        }

        resultItem.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('a')) return;
            if (permalink) {
                globalThis.location.href = permalink;
            }
        });

        const mainRow = document.createElement('div');
        mainRow.className = 'result-main-row';

        mainRow.appendChild(createThumbnailElement(imageSrc, titleText, permalink));

        const contentDiv = document.createElement('div');
        contentDiv.className = 'result-content';

        contentDiv.appendChild(createHeaderElement(titleText, permalink, priceText, scoreText, scoreNum));

        if (summaryText) {
            const summaryLink = document.createElement('a');
            summaryLink.href = permalink;
            summaryLink.className = 'result-summary-link';
            summaryLink.tabIndex = -1;
            summaryLink.setAttribute('aria-hidden', 'true');

            const summarySpan = document.createElement('span');
            summarySpan.className = 'result-summary';
            summarySpan.textContent = summaryText;
            summaryLink.appendChild(summarySpan);
            contentDiv.appendChild(summaryLink);
        }

        const footerDiv = document.createElement('div');
        footerDiv.className = 'result-footer';

        const categoriesDiv = document.createElement('div');
        categoriesDiv.className = 'result-categories';
        categories.forEach(cat => {
            const catTag = document.createElement('span');
            catTag.className = 'category-tag';
            catTag.textContent = cat;
            categoriesDiv.appendChild(catTag);
        });
        footerDiv.appendChild(categoriesDiv);

        if (item.asin) {
            footerDiv.appendChild(createCompareButton(item, titleText, permalink, imageSrc, priceText, categories));
        }

        contentDiv.appendChild(footerDiv);
        mainRow.appendChild(contentDiv);
        resultItem.appendChild(mainRow);
        return resultItem;
    }

    function displayResults(results, unfilteredScoreCount = 0) {
        searchResults.textContent = '';

        if (results.length === 0) {
            renderEmptyState(unfilteredScoreCount);
            return;
        }

        const seen = new Set();
        const uniqueResults = [];
        const categoryCounts = {};

        for (const result of results) {
            if (!seen.has(result.item.permalink)) {
                seen.add(result.item.permalink);
                uniqueResults.push(result);

                const categories = result.item.categories || [];
                categories.forEach(cat => {
                    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                });
            }
        }

        renderResultHeader(uniqueResults.length, searchResults);
        renderCategorySuggestions(categoryCounts, searchResults);

        uniqueResults.slice(0, 20).forEach(result => {
            searchResults.appendChild(renderSearchResultItem(result.item));
        });

        if (typeof globalThis.Compare?.sync === 'function') {
            globalThis.Compare.sync();
        }

        searchResults.classList.add('active');
        updateSearchResultsHeight();
        lastSearchState = getSearchState();
    }

    function displaySearchTips() {
        searchResults.textContent = '';

        const container = document.createElement('div');
        container.className = 'search-tips-container';

        const header = document.createElement('div');
        header.className = 'search-tips-header';

        const svgNamespace = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNamespace, 'svg');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const circle = document.createElementNS(svgNamespace, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        svg.appendChild(circle);

        const line1 = document.createElementNS(svgNamespace, 'line');
        line1.setAttribute('x1', '12');
        line1.setAttribute('y1', '16');
        line1.setAttribute('x2', '12');
        line1.setAttribute('y2', '12');
        svg.appendChild(line1);

        const line2 = document.createElementNS(svgNamespace, 'line');
        line2.setAttribute('x1', '12');
        line2.setAttribute('y1', '8');
        line2.setAttribute('x2', '12.01');
        line2.setAttribute('y2', '8');
        svg.appendChild(line2);

        header.appendChild(svg);
        const headerTitle = document.createElement('span');
        headerTitle.textContent = '検索のヒント';
        header.appendChild(headerTitle);
        container.appendChild(header);

        const list = document.createElement('div');
        list.className = 'search-tips-list';

        const tips = [
            {
                icon: '🔗',
                title: 'Amazon URL検索',
                desc: 'Amazonの商品URLや共有リンク（amzn.asia / amzn.to等）を貼り付けると直接検索できます。',
                example: 'https://amzn.asia/d/...'
            },
            {
                icon: '⚙️',
                title: 'スペック検索',
                desc: '「8GB」「軽量」「防水」など、商品の仕様でも検索できます。'
            },
            {
                icon: '🔍',
                title: 'AND検索',
                desc: 'キーワードをスペースで区切ると、複数条件で絞り込めます。',
                example: 'モニター 4K'
            }
        ];

        tips.forEach(tip => {
            const item = document.createElement('div');
            item.className = 'search-tip-item';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'search-tip-icon';
            iconSpan.textContent = tip.icon;
            item.appendChild(iconSpan);

            const content = document.createElement('div');
            content.className = 'search-tip-content';

            const tipTitle = document.createElement('span');
            tipTitle.className = 'search-tip-title';
            tipTitle.textContent = tip.title;
            content.appendChild(tipTitle);

            const tipDesc = document.createElement('span');
            tipDesc.className = 'search-tip-description';
            tipDesc.textContent = tip.desc;
            content.appendChild(tipDesc);

            if (tip.example) {
                const exampleDiv = document.createElement('div');
                exampleDiv.textContent = '例: ';
                const exampleSpan = document.createElement('span');
                exampleSpan.className = 'search-tip-example';
                exampleSpan.textContent = tip.example;
                exampleDiv.appendChild(exampleSpan);
                content.appendChild(exampleDiv);
            }

            item.appendChild(content);
            list.appendChild(item);
        });

        container.appendChild(list);
        searchResults.appendChild(container);
        searchResults.classList.add('active');
        updateSearchResultsHeight();
        lastSearchState = getSearchState();
    }
});
