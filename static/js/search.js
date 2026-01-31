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
        if (window.innerWidth > 640) {
            searchResults.style.maxHeight = '';
            return;
        }

        // Visual Viewport APIが利用可能な場合
        if (window.visualViewport) {
            const viewport = window.visualViewport;
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
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateSearchResultsHeight);
        window.visualViewport.addEventListener('scroll', updateSearchResultsHeight);
    }

    // ウィンドウリサイズ時も更新
    window.addEventListener('resize', updateSearchResultsHeight);

    // Load Fuse.js if not already loaded
    if (window.Fuse) {
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
                        { name: "title", weight: 0.7 },
                        { name: "contents", weight: 0.2 },
                        { name: "categories", weight: 0.1 },
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

        // Debounce function to limit search frequency
        function debounce(func, wait) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        const handleSearch = debounce((query) => {
            const results = fuse.search(query);
            displayResults(results);
        }, 300);

        // Event Listeners
        searchInput.addEventListener('input', (e) => {
            if (!fuse) return;

            const query = e.target.value.replace(/　/g, ' ');
            if (query.trim().length === 0) {
                displaySearchTips();
                return;
            }

            if (query.trim().length < 2) {
                // Keep the tips visible while typing the first character
                return;
            }

            handleSearch(query);
        });

        // === スクロール関連の状態管理 ===
        let isSearchInputMouseDown = false;
        let lastScrollY = window.scrollY;
        let fadeOutTimeout; // 検索結果フェードアウト用
        let focusScrollTimeout; // フォーカス時のスクロール遅延用
        let isProgramScrolling = false;
        let calibrationInterval = null;

        // 現在のスクロール位置を記録
        function updateScrollPosition() {
            lastScrollY = window.scrollY;
        }

        // 検索窓を見える位置にスクロールする共通関数
        function scrollSearchIntoView(callback) {
            const container = document.querySelector('.search-container');
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
            window.scrollTo({
                top: window.pageYOffset,
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
                const currentScrollY = window.pageYOffset;
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
                window.scrollTo({
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
                window.removeEventListener('touchstart', stopOnInteraction);
                window.removeEventListener('wheel', stopOnInteraction);
            };
            window.addEventListener('touchstart', stopOnInteraction, { passive: true });
            window.addEventListener('wheel', stopOnInteraction, { passive: true });
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

            const query = e.target.value.replace(/　/g, ' ');
            if (query.trim().length < 2) {
                displaySearchTips();
            } else if (fuse) {
                displayResults(fuse.search(query));
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
            const query = e.target.value.replace(/　/g, ' ');
            if (query.trim().length < 2) {
                displaySearchTips();
            } else if (fuse) {
                displayResults(fuse.search(query));
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

        // 手動スクロール時: 100px以上で検索結果をフェードアウト
        window.addEventListener('scroll', () => {
            if (isProgramScrolling) return;

            if (!searchResults.classList.contains('active')) {
                updateScrollPosition();
                return;
            }

            if (Math.abs(window.scrollY - lastScrollY) > 100) {
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
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item"><span class="result-summary">検索結果が見つかりませんでした</span></div>';
            searchResults.classList.add('active');
            updateSearchResultsHeight();
            return;
        }

        // Deduplicate results by permalink just in case
        const seen = new Set();
        const uniqueResults = [];
        for (const result of results) {
            if (!seen.has(result.item.permalink)) {
                seen.add(result.item.permalink);
                uniqueResults.push(result);
            }
        }

        const html = uniqueResults.slice(0, 20).map(result => {
            const item = result.item;
            const priceDisplay = item.price ? `<span class="result-price">💰 ${item.price}</span>` : '';
            let scoreClass = 'score-fair';
            const score = parseInt(item.score) || 0;
            if (score >= 80) {
                scoreClass = 'score-excellent';
            } else if (score >= 60) {
                scoreClass = 'score-good';
            }
            const scoreDisplay = item.score ? `<span class="result-score ${scoreClass}">🏆 ${item.score}点</span>` : '';
            const thumbnailHtml = item.image ? `
                <div class="result-thumbnail">
                    <img src="${item.image}" alt="${item.title}" loading="lazy">
                </div>
            ` : `
                <div class="result-thumbnail no-image">
                    <span>No Image</span>
                </div>
            `;

            return `
                <a href="${item.permalink}" class="search-result-item">
                    ${thumbnailHtml}
                    <div class="result-content">
                        <div class="result-header">
                            <span class="result-title">${item.title}</span>
                            <div class="result-metrics">
                                ${priceDisplay}
                                ${scoreDisplay}
                            </div>
                        </div>
                        <span class="result-summary">${item.summary || ''}</span>
                        ${item.categories ? `<div class="result-categories">${item.categories.map(c => `<span class="category-tag">${c}</span>`).join('')}</div>` : ''}
                    </div>
                </a>
            `;
        }).join('');

        searchResults.innerHTML = html;
        searchResults.classList.add('active');
        updateSearchResultsHeight();
    }

    function displaySearchTips() {
        const tipsHtml = `
            <div class="search-tips-container">
                <div class="search-tips-header">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                    <span>検索のヒント</span>
                </div>
                <div class="search-tips-list">
                    <div class="search-tip-item">
                        <span class="search-tip-icon">⚙️</span>
                        <div class="search-tip-content">
                            <span class="search-tip-title">スペック検索</span>
                            <span class="search-tip-description">「8GB」「軽量」「防水」など、商品の仕様でも検索できます。</span>
                        </div>
                    </div>
                    <div class="search-tip-item">
                        <span class="search-tip-icon">🔍</span>
                        <div class="search-tip-content">
                            <span class="search-tip-title">AND検索</span>
                            <span class="search-tip-description">キーワードをスペースで区切ると、複数条件で絞り込めます。</span>
                            <div>例: <span class="search-tip-example">モニター 4K</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        searchResults.innerHTML = tipsHtml;
        searchResults.classList.add('active');
        updateSearchResultsHeight();
    }
});
