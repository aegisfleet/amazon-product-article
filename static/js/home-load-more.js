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

    // Check initial state
    const initialHiddenCards = document.querySelectorAll('.card-wrapper.card-hidden');
    if (initialHiddenCards.length === 0) {
        fetchIndexData();
    }

    loadMoreButton.addEventListener('click', async function () {
        if (isLoading) return;

        // If loadMoreButton has become a dedicated back-to-top button
        if (loadMoreButton.classList.contains('is-back-to-top')) {
            globalThis.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // Phase 1: Reveal statically rendered hidden cards (16 to 30)
        const hiddenCards = document.querySelectorAll('.card-wrapper.card-hidden');
        if (hiddenCards.length > 0) {
            for (let i = 0; i < itemsPerBatch && i < hiddenCards.length; i++) {
                hiddenCards[i].classList.remove('card-hidden');
            }

            // Start prefetching dynamic data in background
            fetchIndexData();

            const remainingHidden = document.querySelectorAll('.card-wrapper.card-hidden');
            if (remainingHidden.length === 0) {
                loadMoreButton.textContent = 'さらに読み込む';
                ensureBackToTopLink();
            }
            return;
        }

        // Phase 2: Dynamically load more cards beyond 30 from index.json
        isLoading = true;
        loadMoreButton.disabled = true;
        const originalText = loadMoreButton.textContent;
        loadMoreButton.textContent = '読み込み中...';

        try {
            if (!sortedRemainingArticles) {
                const allArticles = await fetchIndexData();
                sortedRemainingArticles = allArticles.filter(function (item) {
                    return item.asin && !renderedAsins.has(item.asin);
                });
                nextDynamicIndex = 0;
            }

            const batch = sortedRemainingArticles.slice(nextDynamicIndex, nextDynamicIndex + itemsPerBatch);
            nextDynamicIndex += batch.length;

            if (batch.length > 0 && typeof renderCard === 'function') {
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

            const hasMore = nextDynamicIndex < sortedRemainingArticles.length;
            if (hasMore) {
                loadMoreButton.textContent = 'さらに読み込む';
                loadMoreButton.disabled = false;
                ensureBackToTopLink();
            } else {
                // All available articles displayed
                loadMoreButton.textContent = 'トップに戻る';
                loadMoreButton.disabled = false;
                loadMoreButton.classList.add('is-back-to-top');
                if (backToTopBtn) {
                    backToTopBtn.remove();
                    backToTopBtn = null;
                }
            }
        } catch (err) {
            console.error('[home-load-more] Error loading dynamic articles:', err);
            loadMoreButton.textContent = originalText;
            loadMoreButton.disabled = false;
        } finally {
            isLoading = false;
        }
    });
});

// Helper to sanitize URLs for use in href attributes
function sanitizeUrl(url) {
    if (url == null) return null;
    const str = String(url).trim();
    if (!str) return null;
    try {
        const parsed = new URL(str, globalThis.location.origin);
        const protocol = parsed.protocol.toLowerCase();
        // Allow only http and https URLs
        if (protocol === 'http:' || protocol === 'https:') {
            return parsed.toString();
        }
    } catch (e) {
        // If URL construction fails, treat as invalid
        console.warn('URL sanitization failed:', e);
        return null;
    }
    return null;
}

function getScoreClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-caution';
}

function createPickupCardImage(safeImageSrc, shortTitle) {
    const container = document.createElement('div');
    container.className = 'pickup-card-image';

    if (safeImageSrc) {
        const img = document.createElement('img');
        img.src = safeImageSrc;
        img.alt = shortTitle;
        img.loading = 'lazy';
        img.decoding = 'async';
        container.appendChild(img);
    } else {
        const noImage = document.createElement('div');
        noImage.className = 'pickup-card-noimage';
        noImage.textContent = '画像なし';
        container.appendChild(noImage);
    }
    return container;
}

function createPickupCardSpecs(item) {
    const container = document.createElement('div');
    container.className = 'card-specs';

    if (!item.specs || typeof item.specs !== 'object') return container;

    const isZeroValue = (val) => {
        if (typeof val !== 'string' && typeof val !== 'number') return false;
        return /^0+(\.0+)?\s*[a-z]*$/i.test(String(val).trim());
    };

    const specMap = [
        { key: 'os', label: 'OS: ' },
        { key: 'cpu', label: 'CPU: ' },
        { key: 'ram', label: 'RAM: ' },
        { key: 'storage', label: 'ROM: ' },
        { key: 'display_size', label: '画面: ' },
        { key: 'battery_capacity', label: 'バッテリー: ' },
        { key: 'weight', label: '重量: ' },
        { key: 'quantity', label: '内容量: ' },
        { key: 'content', label: '内容量: ' },
        { key: 'count', label: '個数: ' },
        { key: 'capacity', label: '容量: ' }
    ];

    const skipZeroCheckKeys = new Set(["os", "cpu", "ram", "storage", "display_size", "battery_capacity"]);

    specMap.forEach(spec => {
        const val = item.specs[spec.key];
        if (val) {
            if (!skipZeroCheckKeys.has(spec.key) && isZeroValue(val)) {
                return;
            }
            const span = document.createElement('span');
            span.className = 'card-spec-tag';
            span.textContent = spec.label + val;
            container.appendChild(span);
        }
    });

    const material = item.specs.material;
    if (material && typeof material === 'string') {
        const span = document.createElement('span');
        span.className = 'card-spec-tag';
        span.textContent = '素材: ' + material;
        container.appendChild(span);
    }

    const { height: h, width: w, depth: d } = item.specs;
    const parts = [h, w, d].filter(Boolean).filter(val => !isZeroValue(val));
    if (parts.length > 0) {
        const span = document.createElement('span');
        span.className = 'card-spec-tag';
        span.textContent = 'サイズ: ' + parts.join(' × ');
        container.appendChild(span);
    }

    return container;
}

function createPickupCardMeta(score, scoreClass, price) {
    const container = document.createElement('div');
    container.className = 'pickup-card-meta';

    if (price) {
        const priceSpan = document.createElement('span');
        priceSpan.className = 'pickup-card-price';
        priceSpan.textContent = price;
        container.appendChild(priceSpan);
    }

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'pickup-card-score m3-badge m3-badge-score ' + scoreClass;
    scoreSpan.innerHTML = '<span class="material-symbols-outlined icon-score" aria-hidden="true">trophy</span> ' + score + '点';
    container.appendChild(scoreSpan);

    return container;
}

function renderPickupItems(items, pickupGrid) {
    pickupGrid.textContent = '';

    items.forEach(function (item) {
        const safeHref = sanitizeUrl(item.url);
        if (!safeHref) return;

        const title = typeof item.title === 'string' ? item.title : '';
        const shortTitle = title.length > 30 ? `${title.slice(0, 30)}...` : title;
        const score = Number(item.score || 0);
        const scoreClass = getScoreClass(score);
        const price = typeof item.price === 'string' ? item.price : '';
        const image = typeof item.image === 'string' ? item.image.trim() : '';
        const safeImageSrc = image ? sanitizeUrl(image) : '';

        const cardLink = document.createElement('a');
        cardLink.href = safeHref;
        cardLink.className = 'pickup-card';
        cardLink.dataset.score = String(score);
        cardLink.dataset.price = price;
        cardLink.dataset.trackProduct = '1';
        cardLink.dataset.asin = typeof item.asin === 'string' ? item.asin : '';
        cardLink.dataset.category = typeof item.category === 'string' ? item.category : 'unknown';
        cardLink.dataset.priceBucket = typeof item.priceBucket === 'string' ? item.priceBucket : 'unknown';

        const imageContainer = createPickupCardImage(safeImageSrc, shortTitle);
        const contentContainer = document.createElement('div');
        contentContainer.className = 'pickup-card-content';

        const titleElement = document.createElement('p');
        titleElement.className = 'pickup-card-title';
        titleElement.textContent = shortTitle;

        const specsContainer = createPickupCardSpecs(item);
        const metaContainer = createPickupCardMeta(score, scoreClass, price);

        contentContainer.appendChild(titleElement);
        contentContainer.appendChild(specsContainer);
        contentContainer.appendChild(metaContainer);

        cardLink.appendChild(imageContainer);
        cardLink.appendChild(contentContainer);
        pickupGrid.appendChild(cardLink);
    });
}

function createSeededRandom(seed) {
    let state = seed >>> 0;
    return function () {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function shuffleWithSeed(items, seed) {
    const random = createSeededRandom(seed);
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// High Score Pickup Personalization/Shuffle Feature
document.addEventListener('DOMContentLoaded', async function () {
    const pickupGrid = document.getElementById('pickup-grid');
    const pickupDataElement = document.getElementById('pickup-data');

    if (!pickupGrid || !pickupDataElement) return;

    let pickupItems = [];
    try {
        const parsed = JSON.parse(pickupDataElement.textContent || '[]');
        if (Array.isArray(parsed)) {
            pickupItems = parsed;
        }
    } catch {
        pickupItems = [];
    }

    if (!pickupItems.length) return;

    // Load category mapping (category -> parent group)
    let categoryToGroup = {};
    try {
        const basePathMatch = /^(\/[^/]+\/)?/.exec(globalThis.location.pathname);
        const basePath = basePathMatch ? basePathMatch[0] : '/';
        const response = await fetch(`${basePath}data/categorygroups.json`);
        if (response.ok) {
            const data = await response.json();
            // Handle both Array format (new) and Object format (legacy)
            if (data?.categoryGroups && Array.isArray(data.categoryGroups)) {
                data.categoryGroups.forEach(group => {
                    if (group.children) {
                        group.children.forEach(cat => {
                            categoryToGroup[cat] = group.name;
                            categoryToGroup[cat.toLowerCase()] = group.name;
                        });
                    }
                    categoryToGroup[group.name] = group.name;
                    categoryToGroup[group.name.toLowerCase()] = group.name;
                });
            } else if (data) {
                // Legacy format: Object where keys are group names
                Object.entries(data).forEach(([groupName, groupData]) => {
                    if (groupData.categories && Array.isArray(groupData.categories)) {
                        groupData.categories.forEach(cat => {
                            categoryToGroup[cat] = groupName;
                            categoryToGroup[cat.toLowerCase()] = groupName;
                        });
                    }
                    categoryToGroup[groupName] = groupName;
                    categoryToGroup[groupName.toLowerCase()] = groupName;
                });
            }
            console.log('[Personalization] Loaded category mapping:', Object.keys(categoryToGroup).length, 'entries');
        }
    } catch (e) {
        console.warn('Failed to load category mapping for personalization:', e);
    }

    const hasPersonalization =
        typeof globalThis.ProductPersonalization === 'object' &&
        typeof globalThis.ProductPersonalization.rankItems === 'function' &&
        typeof globalThis.ProductPersonalization.getPreferences === 'function';

    const preferences = hasPersonalization ? globalThis.ProductPersonalization.getPreferences(30, categoryToGroup) : { events: [] };
    const initialItems = (preferences?.events?.length)
        ? globalThis.ProductPersonalization.rankItems(pickupItems, categoryToGroup).slice(0, 6)
        : shuffleWithSeed(pickupItems, Date.now()).slice(0, 6);

    renderPickupItems(initialItems, pickupGrid);
    pickupGrid.classList.remove('is-loading');

    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const resetBtn = target.closest('[data-reset-history="1"]');
        if (!resetBtn) return;

        const randomized = shuffleWithSeed(pickupItems, Date.now()).slice(0, 6);
        renderPickupItems(randomized, pickupGrid);
    });
});
