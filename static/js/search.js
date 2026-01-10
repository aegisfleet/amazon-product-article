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
        let scrollTimeout;
        let isProgramScrolling = false;

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

            // 位置をチェックして必要ならスクロール実行
            function checkAndScroll() {
                // ヘッダーが画面内に見えているかチェック
                const headerRect = header ? header.getBoundingClientRect() : null;
                const isHeaderVisible = headerRect && headerRect.bottom > 0;

                // ヘッダーが見える場合はヘッダー直下を基準に、見えない場合は画面上端を基準に
                const targetPosition = isHeaderVisible ? (headerRect.bottom + 10) : 10;
                const offsetForScroll = isHeaderVisible ? (header.offsetHeight + 10) : 10;

                const containerTop = container.getBoundingClientRect().top;

                // 検索窓が適正位置にあればスクロール不要
                if (containerTop >= targetPosition && containerTop <= targetPosition + 50) {
                    return false;
                }

                // 目標スクロール位置を計算
                const y = containerTop + window.pageYOffset - offsetForScroll;

                // 上がりすぎている場合は即座にスクロール、下にある場合はスムーススクロール
                if (containerTop < targetPosition) {
                    window.scrollTo({ top: y, behavior: 'instant' });
                } else {
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
                return true;
            }

            // 初回チェック
            isProgramScrolling = true;
            const needsScroll = checkAndScroll();

            if (!needsScroll) {
                isProgramScrolling = false;
                updateScrollPosition();
                if (callback) callback();
                return;
            }

            // 200ms周期で最大10回リトライして位置を調整
            // （AndroidのIME自動スクロール機能との競合に対応）
            let retryCount = 0;
            const maxRetries = 10;
            const retryInterval = setInterval(() => {
                retryCount++;
                const stillNeeds = checkAndScroll();

                // 位置が適正になった、または最大リトライ回数に達したら終了
                if (!stillNeeds || retryCount >= maxRetries) {
                    clearInterval(retryInterval);
                    isProgramScrolling = false;
                    updateScrollPosition();
                    if (callback) callback();
                }
            }, 200);
        }

        // === イベントリスナー ===

        searchInput.addEventListener('mousedown', () => {
            isSearchInputMouseDown = true;
        });

        // 検索窓クリック時: 検索結果が非表示なら再表示
        searchInput.addEventListener('click', (e) => {
            if (searchResults.classList.contains('active')) {
                return;
            }

            const query = e.target.value.replace(/　/g, ' ');
            if (query.trim().length < 2) {
                displaySearchTips();
            } else if (fuse) {
                displayResults(fuse.search(query));
            }

            // スクロール処理（検索結果表示後に高さ計算）
            scrollSearchIntoView(() => {
                updateSearchResultsHeight();
            });
        });

        // 検索窓フォーカス時: スクロール＋検索結果表示
        searchInput.addEventListener('focus', (e) => {
            // IME（仮想キーボード）の起動を待ってからスクロール
            // 500ms待つ間はプログラムスクロール扱いにする
            isProgramScrolling = true;

            setTimeout(() => {
                scrollSearchIntoView(() => {
                    updateSearchResultsHeight();
                });
            }, 500);

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
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
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
            const scoreDisplay = item.score ? `<span class="result-score">🏆 ${item.score}点</span>` : '';
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
