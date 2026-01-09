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

        // スクロール中のクリック誤判定を防ぐためのフラグ
        let isSearchInputMouseDown = false;

        // スクロール時に検索結果をフェードアウト（モバイル対応）
        let lastScrollY = window.scrollY;
        let scrollTimeout;
        let isProgramScrolling = false; // プログラムによるスクロール中フラグ

        function updateScrollPosition() {
            lastScrollY = window.scrollY;
        }

        searchInput.addEventListener('mousedown', () => {
            isSearchInputMouseDown = true;
        });

        // 検索窓クリック時に検索結果を再表示（フェードアウト後やフォーカス済みの場合）
        searchInput.addEventListener('click', (e) => {
            // 既に表示されている場合は何もしない
            if (searchResults.classList.contains('active')) {
                return;
            }

            const query = e.target.value.replace(/　/g, ' ');
            if (query.trim().length < 2) {
                displaySearchTips();
            } else if (fuse) {
                const results = fuse.search(query);
                displayResults(results);
            }

            // 再クリック時も自動スクロールを実行
            isProgramScrolling = true;
            setTimeout(() => {
                const container = document.querySelector('.search-container');
                const header = document.querySelector('.site-header');
                const headerHeight = header ? header.offsetHeight : 0;

                if (container) {
                    const y = container.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }, 100);

            // スクロール完了後にフラグをリセット
            setTimeout(() => {
                isProgramScrolling = false;
                updateScrollPosition();
            }, 800);
        });

        searchInput.addEventListener('focus', (e) => {
            // 検索窓を画面上部へスクロール（キーボード表示後のレイアウト安定を待つ）
            setTimeout(() => {
                const container = document.querySelector('.search-container');
                const header = document.querySelector('.site-header');
                const headerHeight = header ? header.offsetHeight : 0;

                if (container) {
                    const y = container.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10; // ヘッダー分と余白を引く
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }, 300);

            const query = e.target.value.replace(/　/g, ' ');
            if (query.trim().length < 2) {
                // ヒント表示はfuse初期化前でも可能
                displaySearchTips();
            } else if (fuse) {
                // 検索実行はfuse初期化後のみ
                const results = fuse.search(query);
                displayResults(results);
            }
        });

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            // スクロール中にmouseupがずれた場合を考慮
            if (isSearchInputMouseDown) {
                isSearchInputMouseDown = false;
                return;
            }
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('active');
            }
        });



        window.addEventListener('scroll', () => {
            // プログラムによるスクロール中は無視
            if (isProgramScrolling) {
                return;
            }

            if (!searchResults.classList.contains('active')) {
                updateScrollPosition();
                return;
            }

            const scrollDelta = Math.abs(window.scrollY - lastScrollY);

            // 100px以上スクロールしたらフェードアウト
            if (scrollDelta > 100) {
                searchResults.classList.add('fade-out');

                // フェードアウト完了後にactiveクラスを削除
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    searchResults.classList.remove('active', 'fade-out');
                    updateScrollPosition();
                }, 200);
            }
        }, { passive: true });

        // フォーカス時にプログラムスクロールのフラグを設定
        searchInput.addEventListener('focus', () => {
            // プログラムスクロール中フラグをセット
            isProgramScrolling = true;

            // スクロール完了後にフラグをリセットしてスクロール位置を更新
            // (フォーカス時のsetTimeoutスクロール300ms + smoothスクロール完了猶予500ms)
            setTimeout(() => {
                isProgramScrolling = false;
                updateScrollPosition();
            }, 1000);
        });
    }

    function displayResults(results) {
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item"><span class="result-summary">検索結果が見つかりませんでした</span></div>';
            searchResults.classList.add('active');
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
    }
});
