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
        const parsed = new URL(rawUrl, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.href;
    } catch (e) {
        return null;
    }
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
    if (!Array.isArray(results) || results.length === 0) return [];

    const queryLength = query.trim().length;
    const queryTerms = query.trim().split(/\s+/).filter(Boolean).length;
    const intentStrength = Math.min(1, Math.max(0, ((queryLength - 2) / 10) + ((queryTerms - 1) * 0.08)));

    const fuseScores = results.map(result => Number.isFinite(result.score) ? result.score : 1);
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
        const itemCategories = (item.categories || []).map(c => c.toLowerCase());
        if (itemCategories.length === 0) return 0;

        const queryTerms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
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

    return results
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

            const scoreMin = Number.parseFloat(document.getElementById('filter-score-min')?.value) || 0;
            const scoreMax = Number.parseFloat(document.getElementById('filter-score-max')?.value) || 100;
            const priceMin = Number.parseFloat(document.getElementById('filter-price-min')?.value) || 0;
            const priceMax = Number.parseFloat(document.getElementById('filter-price-max')?.value) || Number.MAX_SAFE_INTEGER;

            if (score < scoreMin) return false;
            // Only apply max filters if they have a numeric value (placeholder is different)
            const scoreMaxInput = document.getElementById('filter-score-max');
            if (scoreMaxInput && scoreMaxInput.value !== '' && score > scoreMax) return false;
            
            const priceMaxInput = document.getElementById('filter-price-max');
            if (price < priceMin) return false;
            if (priceMaxInput && priceMaxInput.value !== '' && price > priceMax) return false;

            return true;
        })
        .sort((a, b) => b.rerankScore - a.rerankScore);
}

document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    let fuse;

    if (!searchInput || !searchResults) return;

    // Prevent multiple initializations
    if (searchInput.dataset.searchInitialized) {
        return;
    }
    searchInput.dataset.searchInitialized = 'true';

    // スマートフォンでの検索結果の高さを動的に調整（仮想キーボード対応）
    function updateSearchResultsHeight() {
        // モバイル判定（640px以下）
        if (globalThis.innerWidth > 640) {
            searchResults.style.maxHeight = '';
            return;
        }

        // Visual Viewport APIが利用可能な場合
        if (globalThis.visualViewport) {
            const viewport = globalThis.visualViewport;
            const searchContainer = document.querySelector('.search-container');
            if (!searchContainer) return;

            // 検索コンテナの下端からvisual viewportの下端までの高さを計算
            const containerRect = searchContainer.getBoundingClientRect();
            const searchInputHeight = searchInput.offsetHeight;
            const containerBottom = containerRect.top + searchInputHeight + 8; // 8px = 検索結果のtop margin
            const availableHeight = viewport.height - containerBottom - 20; // 20px = 下部余白

            // 最小200px、最大none
            const maxHeight = Math.max(200, availableHeight);
            searchResults.style.maxHeight = `${maxHeight}px`;
        }
    }

    // Visual Viewport resize イベントで高さを動的に更新
    if (globalThis.visualViewport) {
        globalThis.visualViewport.addEventListener('resize', updateSearchResultsHeight);
        globalThis.visualViewport.addEventListener('scroll', updateSearchResultsHeight);
    }

    // ウィンドウリサイズ時も更新
    globalThis.addEventListener('resize', updateSearchResultsHeight);

    // Load Fuse.js if not already loaded
    if (globalThis.Fuse) {
        initializeSearch();
    } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2';
        script.onload = initializeSearch;
        document.head.appendChild(script);
    }

    function initializeSearch() {
        if (fuse) return; // Already initialized

        // Fetch index.json dynamically from data attribute
        const searchIndexUrl = searchInput.dataset.searchIndexUrl || '/index.json';
        fetch(searchIndexUrl)
            .then(response => response.json())
            .then(data => {
                const searchIndex = data;
                fuse = new Fuse(searchIndex, {
                    keys: [
                        { name: "asin", weight: 1 },
                        { name: "title", weight: 0.7 },
                        { name: "contents", weight: 0.2 },
                        { name: "categories", weight: 1 }, // 0.1から1へ大幅強化
                        { name: "specs", weight: 0.3 }
                    ],

                    threshold: 0.2, // 0.4から0.2へ厳格化。日本語の短いワードでの誤一致を抑制。
                    distance: 100,
                    includeScore: true,
                    ignoreLocation: true, // Search in entire text
                    useExtendedSearch: true
                });
            })
            .catch(err => console.error('Error loading search index:', err));

        const handleSearch = debounce((query) => {
            // 検索中表示
            searchResults.textContent = '';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'search-loading';
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            loadingDiv.appendChild(spinner);
            const loadingText = document.createElement('span');
            loadingText.className = 'loading-text';
            loadingText.textContent = '検索中...';
            loadingDiv.appendChild(loadingText);
            searchResults.appendChild(loadingDiv);
            searchResults.classList.add('active');
            updateSearchResultsHeight();

            // 検索と表示
            const results = searchWithRerank(query);
            displayResults(results);
        }, 300);


        function searchWithRerank(query) {
            return rerankResults(fuse.search(query), query);
        }

        // Event Listeners
        searchInput.addEventListener('input', (e) => {
            if (!fuse) return;
            if (e.isComposing) return;

            const query = e.target.value.replaceAll('　', ' ');
            if (query.trim().length === 0) {
                displaySearchTips();
                return;
            }

            if (query.trim().length < 2) {
                // 1文字のときはヒントを表示したままにする
                return;
            }

            handleSearch(query);
        });

        // IME入力確定時にも検索を実行
        searchInput.addEventListener('compositionend', (e) => {
            if (!fuse) return;
            const query = e.target.value.replaceAll('　', ' ');
            if (query.trim().length >= 2) {
                handleSearch(query);
            }
        });

        // Filter event listeners to trigger re-search
        ['filter-score-min', 'filter-score-max', 'filter-price-min', 'filter-price-max'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    const query = searchInput.value.replaceAll('　', ' ');
                    if (query.trim().length >= 2) {
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

            const query = e.target.value.replaceAll('　', ' ');
            if (query.trim().length < 2) {
                displaySearchTips();
            } else if (fuse) {
                displayResults(searchWithRerank(query));
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
            const query = e.target.value.replaceAll('　', ' ');
            if (query.trim().length < 2) {
                displaySearchTips();
            } else if (fuse) {
                displayResults(searchWithRerank(query));
            }
        });

        // 外側クリック時: 検索結果を閉じる
        document.addEventListener('click', (e) => {
            if (isSearchInputMouseDown) {
                isSearchInputMouseDown = false;
                return;
            }
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
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

    function displayResults(results) {
        searchResults.textContent = '';

        if (results.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'search-empty-state';

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
            emptyState.appendChild(svg);

            const title = document.createElement('span');
            title.className = 'empty-title';
            title.textContent = '見つかりませんでした';
            emptyState.appendChild(title);

            const desc = document.createElement('span');
            desc.className = 'empty-desc';
            desc.textContent = '別のキーワードでもう一度お試しください。';
            emptyState.appendChild(desc);

            searchResults.appendChild(emptyState);
            searchResults.classList.add('active');
            updateSearchResultsHeight();
            return;
        }

        // Deduplicate results by permalink just in case
        const seen = new Set();
        const uniqueResults = [];
        const categoryCounts = {};

        for (const result of results) {
            if (!seen.has(result.item.permalink)) {
                seen.add(result.item.permalink);
                uniqueResults.push(result);

                // Collect categories for suggestions
                const categories = result.item.categories || [];
                categories.forEach(cat => {
                    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                });
            }
        }

        // Render category suggestions at the top
        const topCategories = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        if (topCategories.length > 0) {
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
                searchResults.appendChild(suggestionArea);
            }
        }

        uniqueResults.slice(0, 20).forEach(result => {
            const item = result.item;
            const titleText = item.title;
            const summaryText = item.summary || '';
            const imageSrc = item.image;
            const priceText = item.price;

            let permalink = item.permalink || '';
            if (permalink && !permalink.startsWith('http') && !permalink.startsWith('/')) {
                permalink = '/';
            }
            const scoreText = String(item.score || '');

            const resultLink = document.createElement('a');
            resultLink.href = permalink;
            resultLink.className = 'search-result-item';

            // Thumbnail
            if (imageSrc) {
                const thumbDiv = document.createElement('div');
                thumbDiv.className = 'result-thumbnail';
                const img = document.createElement('img');
                img.src = imageSrc;
                img.alt = titleText;
                img.loading = 'lazy';
                thumbDiv.appendChild(img);
                resultLink.appendChild(thumbDiv);
            } else {
                const thumbDiv = document.createElement('div');
                thumbDiv.className = 'result-thumbnail no-image';
                const span = document.createElement('span');
                span.textContent = 'No Image';
                thumbDiv.appendChild(span);
                resultLink.appendChild(thumbDiv);
            }

            // Content
            const contentDiv = document.createElement('div');
            contentDiv.className = 'result-content';

            // Header
            const headerDiv = document.createElement('div');
            headerDiv.className = 'result-header';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'result-title';
            titleSpan.textContent = titleText;
            headerDiv.appendChild(titleSpan);

            // Metrics
            const metricsDiv = document.createElement('div');
            metricsDiv.className = 'result-metrics';
            
            if (item.price) {
                const priceSpan = document.createElement('span');
                priceSpan.className = 'result-price';
                priceSpan.textContent = `💰 ${priceText}`;
                metricsDiv.appendChild(priceSpan);
            }

            if (item.score) {
                let scoreClass = 'score-fair';
                const score = Number.parseInt(item.score, 10) || 0;
                if (score >= 80) {
                    scoreClass = 'score-excellent';
                } else if (score >= 60) {
                    scoreClass = 'score-good';
                }
                const scoreSpan = document.createElement('span');
                scoreSpan.className = `result-score ${scoreClass}`;
                scoreSpan.textContent = `🏆 ${scoreText}点`;
                metricsDiv.appendChild(scoreSpan);
            }
            headerDiv.appendChild(metricsDiv);
            contentDiv.appendChild(headerDiv);

            // Summary
            const summarySpan = document.createElement('span');
            summarySpan.className = 'result-summary';
            summarySpan.textContent = summaryText;
            contentDiv.appendChild(summarySpan);

            // Categories
            const categories = item.categories || [];
            if (categories.length > 0) {
                const categoriesDiv = document.createElement('div');
                categoriesDiv.className = 'result-categories';
                categories.forEach(cat => {
                    const catTag = document.createElement('span');
                    catTag.className = 'category-tag';
                    catTag.textContent = cat;
                    categoriesDiv.appendChild(catTag);
                });
                contentDiv.appendChild(categoriesDiv);
            }

            resultLink.appendChild(contentDiv);
            searchResults.appendChild(resultLink);
        });

        searchResults.classList.add('active');
        updateSearchResultsHeight();
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
    }
});
