document.addEventListener('DOMContentLoaded', function () {
    const loadMoreButton = document.getElementById('load-more-button');
    const productGrid = document.getElementById('product-grid');
    const loadMoreContainer = document.getElementById('load-more-container');

    const itemsPerBatch = 15;

    if (!loadMoreButton || !productGrid) return;

    // Track ASINs already rendered on the page to prevent duplicate cards
    const renderedAsins = new Set();
    document.querySelectorAll('#product-grid [data-asin]').forEach(function (el) {
        if (el.dataset.asin) renderedAsins.add(el.dataset.asin);
    });

    let indexDataPromise = null;
    let sortedRemainingArticles = null;
    let nextDynamicIndex = 0;
    let isLoading = false;

    // Auxiliary back-to-top button so users can easily scroll up while loading more
    let backToTopBtn = null;
    function ensureBackToTopLink() {
        if (backToTopBtn || !loadMoreContainer) return;
        backToTopBtn = document.createElement('button');
        backToTopBtn.type = 'button';
        backToTopBtn.className = 'btn-load-more btn-back-to-top-sub';
        backToTopBtn.textContent = 'トップに戻る ↑';
        backToTopBtn.addEventListener('click', function () {
            globalThis.scrollTo({ top: 0, behavior: 'smooth' });
        });
        loadMoreContainer.appendChild(backToTopBtn);
    }

    // Prefetch or fetch index.json
    function fetchIndexData() {
        if (!indexDataPromise) {
            const searchInput = document.getElementById('search-input');
            const searchIndexUrl = searchInput?.dataset?.searchIndexUrl || '/index.json';
            indexDataPromise = fetch(searchIndexUrl)
                .then(function (res) {
                    if (!res.ok) throw new Error('Failed to fetch index.json');
                    return res.json();
                })
                .then(function (data) {
                    if (!Array.isArray(data)) return [];
                    // Sort by last_investigated descending, then score descending
                    return data.slice().sort(function (a, b) {
                        const da = a.last_investigated || '';
                        const db = b.last_investigated || '';
                        if (da !== db) return db.localeCompare(da);
                        return (b.score || 0) - (a.score || 0);
                    });
                })
                .catch(function (err) {
                    console.warn('[home-load-more] Failed to load index data:', err);
                    return [];
                });
        }
        return indexDataPromise;
    }

    // Check initial state
    const initialHiddenCards = document.querySelectorAll('.card-wrapper.card-hidden');
    if (initialHiddenCards.length === 0) {
        fetchIndexData();
    }

    // Phase 1 helper: Reveal statically rendered hidden cards (16 to 30)
    function revealHiddenCards() {
        const hiddenCards = document.querySelectorAll('.card-wrapper.card-hidden');
        if (hiddenCards.length === 0) return false;

        for (let i = 0; i < itemsPerBatch && i < hiddenCards.length; i++) {
            hiddenCards[i].classList.remove('card-hidden');
        }

        fetchIndexData();

        const remainingHidden = document.querySelectorAll('.card-wrapper.card-hidden');
        if (remainingHidden.length === 0) {
            loadMoreButton.textContent = 'さらに読み込む';
            ensureBackToTopLink();
        }
        return true;
    }

    // Phase 2 helper: Append dynamic product cards to grid
    function appendDynamicCards(batch) {
        if (!batch.length || typeof renderCard !== 'function') return;

        const fragment = document.createDocumentFragment();
        batch.forEach(function (item) {
            renderedAsins.add(item.asin);
            const productData = mapIndexItemToProduct(item);
            const cardEl = renderCard(productData);

            const wrapper = document.createElement('div');
            wrapper.className = 'card-wrapper';
            wrapper.appendChild(cardEl);
            fragment.appendChild(wrapper);
        });
        productGrid.appendChild(fragment);
    }

    // Phase 2 helper: Update button state after dynamic load
    function updateLoadMoreButtonState(hasMore) {
        loadMoreButton.disabled = false;
        if (hasMore) {
            loadMoreButton.textContent = 'さらに読み込む';
            ensureBackToTopLink();
            return;
        }

        loadMoreButton.textContent = 'トップに戻る';
        loadMoreButton.classList.add('is-back-to-top');
        if (backToTopBtn) {
            backToTopBtn.remove();
            backToTopBtn = null;
        }
    }

    // Phase 2 helper: Fetch and render next batch
    async function loadNextDynamicBatch() {
        if (!sortedRemainingArticles) {
            const allArticles = await fetchIndexData();
            sortedRemainingArticles = allArticles.filter(function (item) {
                return item.asin && !renderedAsins.has(item.asin);
            });
            nextDynamicIndex = 0;
        }

        const batch = sortedRemainingArticles.slice(nextDynamicIndex, nextDynamicIndex + itemsPerBatch);
        nextDynamicIndex += batch.length;

        appendDynamicCards(batch);

        const hasMore = nextDynamicIndex < sortedRemainingArticles.length;
        updateLoadMoreButtonState(hasMore);
    }

    loadMoreButton.addEventListener('click', async function () {
        if (isLoading) return;

        // If loadMoreButton has become a dedicated back-to-top button
        if (loadMoreButton.classList.contains('is-back-to-top')) {
            globalThis.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // Phase 1: Reveal statically rendered hidden cards (16 to 30)
        if (revealHiddenCards()) {
            return;
        }

        // Phase 2: Dynamically load more cards beyond 30 from index.json
        isLoading = true;
        loadMoreButton.disabled = true;
        const originalText = loadMoreButton.textContent;
        loadMoreButton.textContent = '読み込み中...';

        try {
            await loadNextDynamicBatch();
        } catch (err) {
            console.error('[home-load-more] Error loading dynamic articles:', err);
            loadMoreButton.textContent = originalText;
            loadMoreButton.disabled = false;
        } finally {
            isLoading = false;
        }
    });
});

// Map index.json item to renderCard format
function mapIndexItemToProduct(item) {
    let specsHtml = '';
    if (item.specs_json) {
        try {
            const specsObj = typeof item.specs_json === 'string' ? JSON.parse(item.specs_json) : item.specs_json;
            if (specsObj && typeof specsObj === 'object') {
                specsHtml = Object.entries(specsObj)
                    .map(function (entry) {
                        return '<span class="card-spec-tag">' + entry[0] + ': ' + entry[1] + '</span>';
                    })
                    .join('');
            }
        } catch {
            // ignore
        }
    }

    return {
        url: item.permalink,
        title: item.title,
        image: item.image,
        category: Array.isArray(item.categories) && item.categories.length > 0 ? item.categories[0] : '',
        categoryUrl: item.category_url || '',
        description: item.summary || '',
        price: item.price || '',
        priceRaw: item.price_value || 0,
        score: item.score || 0,
        lastInvestigated: item.last_investigated || '',
        asin: item.asin || '',
        parentAsin: item.parent_asin || '',
        affiliateUrl: item.affiliate_url || '',
        savingsPercentage: item.savings_percentage || null,
        specsHtml: specsHtml
    };
}
