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

        console.log('Search initialized');

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
                        { name: "categories", weight: 0.1 }
                    ],
                    threshold: 0.4,
                    includeScore: true,
                    ignoreLocation: true // Search in entire text
                });
            })
            .catch(err => console.error('Error loading search index:', err));

        // Event Listeners
        searchInput.addEventListener('input', (e) => {
            if (!fuse) return;

            const query = e.target.value;
            if (query.length < 2) {
                searchResults.innerHTML = '';
                searchResults.classList.remove('active');
                return;
            }

            const results = fuse.search(query);
            displayResults(results);
        });

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('active');
            }
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

        const html = uniqueResults.slice(0, 8).map(result => {
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
});
