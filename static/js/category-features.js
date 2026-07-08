/**
 * category-features.js
 * カテゴリページ（親・子）のフィルタリング・ソート・表示を管理する。
 */

/**
 * Check if a card matches the selected category
 */
function matchesCategory(card, selectedCategory) {
    if (!selectedCategory) return true;
    const cardCategories = (card.dataset.categories || '').split(',').map(c => c.trim());
    return cardCategories.includes(selectedCategory);
}

/**
 * Check if a card matches the selected price range
 */
function matchesPrice(card, minPrice, maxPrice) {
    const price = Number.parseInt(card.dataset.price) || 0;
    return price >= minPrice && (maxPrice >= 50000 || price <= maxPrice);
}

/**
 * Check if a card matches the selected score range
 */
function matchesScore(card, minScore) {
    const score = Number.parseFloat(card.dataset.score) || 0;
    return score >= minScore;
}

/**
 * Check if a card matches the selected specs
 */
function matchesSpecs(card, requiredSpecs) {
    if (requiredSpecs.length === 0) return true;
    const cardSpecs = new Set((card.dataset.specs || '').split(',').map(s => s.trim()));
    return requiredSpecs.every(spec => cardSpecs.has(spec));
}

/**
 * Check if a card matches the selected deal status
 */
function matchesDeal(card, showOnlyDeals) {
    if (!showOnlyDeals) return true;
    return card.dataset.hasDeal === 'true';
}

/**
 * Master check to see if a card should be visible
 */
function isCardVisible(card, filters) {
    if (!matchesCategory(card, filters.category)) return false;
    if (!matchesPrice(card, filters.minPrice, filters.maxPrice)) return false;
    if (!matchesScore(card, filters.minScore)) return false;
    if (!matchesSpecs(card, filters.requiredSpecs)) return false;
    if (!matchesDeal(card, filters.showOnlyDeals)) return false;

    if (filters.keywords.length > 0) {
        const title = card.querySelector('.card-title')?.textContent || '';
        const excerpt = card.querySelector('.card-excerpt')?.textContent || '';
        const specs = Array.from(card.querySelectorAll('.card-spec-tag')).map(tag => tag.textContent).join(' ');
        const text = normalizeText([title, excerpt, specs].join(' '));
        return filters.keywords.every(kw => text.includes(kw));
    }
    return true;
}

// Handle both early and late script loading
function initCategoryFeatures() {
    const scoreSlider = document.getElementById('score-slider');
    const minPriceSlider = document.getElementById('min-price-slider');
    const priceSlider = document.getElementById('price-slider');

    const scoreValueEl = document.getElementById('score-value');
    const minPriceValueEl = document.getElementById('min-price-value');
    const priceValueEl = document.getElementById('price-value');

    const categorySelect = document.getElementById('category-select');
    const categoryResetBtn = document.getElementById('category-reset-btn');
    const sortButtons = document.getElementById('sort-buttons');
    const dealFilter = document.getElementById('deal-filter');
    const keywordSearch = document.getElementById('keyword-search');
    const keywordClearBtn = document.getElementById('keyword-clear-btn');
    const keywordCountBadge = document.getElementById('keyword-count-badge');
    const filterReset = document.getElementById('filter-reset');

    const productGrid = document.getElementById('product-grid');
    const productCount = document.getElementById('product-count');

    if (!productGrid) return;

    // Get the default sort value from HTML state before applying URL params
    let currentSort = 'score-desc';
    if (sortButtons) {
        const activeBtn = sortButtons.querySelector('.bargain-sort-btn.active');
        if (activeBtn) currentSort = activeBtn.dataset.sort || 'score-desc';
    }

    let allCards = Array.from(productGrid.querySelectorAll('.card'));
    let activePreset = '';

    const presetDefinitions = {
        'cost-performance': {
            minScore: 80,
            maxPrice: 20000
        },
        'high-performance': {
            minScore: 90,
            maxPrice: 50000
        },
        'beginner': {
            minScore: 0,
            maxPrice: 10000,
            specs: ['5g', 'gps', 'amoled']
        },
        'lightweight': {
            minScore: 0,
            maxPrice: 50000,
            specs: ['lightweight']
        }
    };

    /**
     * Update slider text displays
     */
    function updateSliderDisplays() {
        const minScore = scoreSlider ? Number.parseInt(scoreSlider.value, 10) : 0;
        const minPrice = minPriceSlider ? valueToPrice(Number.parseInt(minPriceSlider.value, 10)) : 0;
        const maxPrice = priceSlider ? valueToPrice(Number.parseInt(priceSlider.value, 10)) : 50000;

        if (scoreValueEl) scoreValueEl.textContent = String(minScore);
        if (minPriceValueEl) minPriceValueEl.textContent = formatPrice(minPrice);
        if (priceValueEl) {
            priceValueEl.textContent = maxPrice >= 50000 ? '上限なし' : formatPrice(maxPrice) + '以下';
        }
    }

    /**
     * Apply all filters to cards
     */
    function filterCards() {
        updateSliderDisplays();

        const minScore = scoreSlider ? Number.parseInt(scoreSlider.value, 10) : 0;
        const minPrice = minPriceSlider ? valueToPrice(Number.parseInt(minPriceSlider.value, 10)) : 0;
        const maxPrice = priceSlider ? valueToPrice(Number.parseInt(priceSlider.value, 10)) : 50000;
        const category = categorySelect ? categorySelect.value : '';
        const showOnlyDeals = dealFilter ? dealFilter.checked : false;

        const rawQ = keywordSearch ? keywordSearch.value : '';
        const normalizedQ = normalizeText(rawQ);
        const keywords = normalizedQ.split(/\s+/).filter(Boolean);

        const specFilters = document.getElementById('spec-filters');
        const requiredSpecs = specFilters ? Array.from(specFilters.querySelectorAll('input[name="spec"]:checked')).map(cb => cb.value) : [];

        const filters = {
            category,
            minPrice,
            maxPrice,
            minScore,
            showOnlyDeals,
            keywords,
            requiredSpecs
        };

        allCards.forEach(card => {
            const visible = isCardVisible(card, filters);
            card.style.display = visible ? '' : 'none';
        });

        // Update counts
        const visibleCount = allCards.filter(card => card.style.display !== 'none').length;
        const totalCount = allCards.length;
        if (productCount) {
            if (visibleCount === totalCount) {
                productCount.textContent = `${totalCount} 件の商品`;
            } else {
                productCount.textContent = `${visibleCount} / ${totalCount} 件の商品`;
            }
        }

        // Update Keyword count badge
        if (keywordCountBadge) {
            if (keywords.length > 0) {
                keywordCountBadge.textContent = `${visibleCount}件`;
                keywordCountBadge.style.display = 'inline-flex';
                if (visibleCount === 0) {
                    keywordCountBadge.classList.add('zero-results');
                } else {
                    keywordCountBadge.classList.remove('zero-results');
                }
            } else {
                keywordCountBadge.style.display = 'none';
            }
        }

        if (categoryResetBtn && categorySelect) {
            categoryResetBtn.disabled = (categorySelect.value === '');
        }

        updateUrl();
    }

    const debouncedFilterCards = debounce(filterCards, 300);

    /**
     * Sort cards based on the given sort value
     */
    function sortCards(sortValue) {
        const cards = Array.from(productGrid.querySelectorAll('.card'));

        cards.sort((a, b) => {
            let valA, valB;

            switch (sortValue) {
                case 'savings-desc':
                    valA = Number.parseInt(a.dataset.savingsPercentage) || 0;
                    valB = Number.parseInt(b.dataset.savingsPercentage) || 0;
                    return valB - valA;
                case 'price-asc':
                    valA = Number.parseInt(a.dataset.price) || 0;
                    valB = Number.parseInt(b.dataset.price) || 0;
                    return valA - valB;
                case 'price-desc':
                    valA = Number.parseInt(a.dataset.price) || 0;
                    valB = Number.parseInt(b.dataset.price) || 0;
                    return valB - valA;
                case 'score-desc':
                    valA = Number.parseFloat(a.dataset.score) || 0;
                    valB = Number.parseFloat(b.dataset.score) || 0;
                    return valB - valA;
                case 'date-desc':
                default:
                    valA = Number.parseInt(a.dataset.date) || 0;
                    valB = Number.parseInt(b.dataset.date) || 0;
                    return valB - valA;
            }
        });

        // Re-append sorted cards
        productGrid.innerHTML = '';
        cards.forEach(card => productGrid.appendChild(card));
    }

    /**
     * Update active sort button states
     */
    function updateSortButtons() {
        if (!sortButtons) return;
        sortButtons.querySelectorAll('.bargain-sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === currentSort);
        });
    }

    /**
     * Update URL with current filter/sort state
     */
    function updateUrl() {
        const params = new URLSearchParams();

        if (currentSort && currentSort !== 'score-desc') {
            params.set('sort', currentSort);
        }

        const minScore = scoreSlider ? scoreSlider.value : '0';
        if (minScore !== '0') {
            params.set('minScore', minScore);
        }

        const minPrice = minPriceSlider ? valueToPrice(Number.parseInt(minPriceSlider.value, 10)) : 0;
        if (minPrice !== 0) {
            params.set('minPrice', String(minPrice));
        }

        const maxPrice = priceSlider ? valueToPrice(Number.parseInt(priceSlider.value, 10)) : 50000;
        if (maxPrice < 50000) {
            params.set('maxPrice', String(maxPrice));
        }

        if (categorySelect && categorySelect.value) {
            params.set('category', categorySelect.value);
        }

        const specFilters = document.getElementById('spec-filters');
        if (specFilters) {
            const selectedSpecs = Array.from(specFilters.querySelectorAll('input[name="spec"]:checked')).map(cb => cb.value);
            if (selectedSpecs.length > 0) {
                params.set('specs', selectedSpecs.join(','));
            }
        }

        if (keywordSearch && keywordSearch.value.trim()) {
            params.set('q', keywordSearch.value.trim());
        }

        if (dealFilter && dealFilter.checked) {
            params.set('deal', 'active');
        }

        if (activePreset) {
            params.set('preset', activePreset);
        }

        const newUrl = globalThis.location.pathname + (params.toString() ? '?' + params.toString() : '');
        globalThis.history.replaceState({ path: newUrl }, '', newUrl);
    }

    /**
     * Apply filter/sort state from URL
     */
    function applyUrlState() {
        const params = new URLSearchParams(globalThis.location.search);

        if (params.has('preset')) {
            activePreset = params.get('preset');
            updatePresetButtons();
        }

        if (params.has('sort')) {
            currentSort = params.get('sort');
            updateSortButtons();
        }

        if (params.has('minScore') && scoreSlider) {
            scoreSlider.value = params.get('minScore');
        }

        if (params.has('minPrice') && minPriceSlider) {
            minPriceSlider.value = String(Math.round(priceToValue(Number.parseInt(params.get('minPrice'), 10))));
        }

        if (params.has('maxPrice') && priceSlider) {
            priceSlider.value = String(Math.round(priceToValue(Number.parseInt(params.get('maxPrice'), 10))));
        }

        if (params.has('category') && categorySelect) {
            categorySelect.value = params.get('category');
        }

        if (params.has('specs')) {
            const specFilters = document.getElementById('spec-filters');
            if (specFilters) {
                const values = new Set(params.get('specs').split(','));
                specFilters.querySelectorAll('input[name="spec"]').forEach(cb => {
                    cb.checked = values.has(cb.value);
                });
            }
        }

        if (params.has('q') && keywordSearch) {
            keywordSearch.value = params.get('q');
            if (keywordClearBtn) keywordClearBtn.style.display = 'block';
        }

        if (dealFilter) {
            dealFilter.checked = params.get('deal') === 'active';
        }
    }

    /**
     * Apply active preset variables to sliders and check state
     */
    function applyPreset(presetKey) {
        const preset = presetDefinitions[presetKey];
        if (!preset) return;

        activePreset = presetKey;
        updatePresetButtons();

        if (scoreSlider) scoreSlider.value = String(preset.minScore);
        if (minPriceSlider) minPriceSlider.value = '0';
        if (priceSlider) {
            priceSlider.value = String(Math.round(priceToValue(preset.maxPrice)));
        }

        const specFilters = document.getElementById('spec-filters');
        if (specFilters) {
            specFilters.querySelectorAll('input[name="spec"]').forEach(cb => {
                cb.checked = preset.specs ? preset.specs.includes(cb.value) : false;
            });
        }

        filterCards();
    }

    function updatePresetButtons() {
        document.querySelectorAll('.filter-preset-btn').forEach(btn => {
            const isActive = btn.dataset.preset === activePreset;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });
    }

    /**
     * Reset all filters to default state
     */
    function resetFilters() {
        if (scoreSlider) scoreSlider.value = '0';
        if (minPriceSlider) minPriceSlider.value = '0';
        if (priceSlider) priceSlider.value = '1000';
        if (categorySelect) categorySelect.value = '';
        if (dealFilter) dealFilter.checked = false;

        const specFilters = document.getElementById('spec-filters');
        if (specFilters) {
            specFilters.querySelectorAll('input[name="spec"]').forEach(cb => {
                cb.checked = false;
            });
        }

        if (keywordSearch) {
            keywordSearch.value = '';
        }
        if (keywordClearBtn) {
            keywordClearBtn.style.display = 'none';
        }

        activePreset = '';
        updatePresetButtons();

        filterCards();
    }

    // --- Slider Events ---
    if (scoreSlider) {
        scoreSlider.addEventListener('input', () => {
            updateSliderDisplays();
            debouncedFilterCards();
        });
    }
    if (minPriceSlider) {
        minPriceSlider.addEventListener('input', () => {
            updateSliderDisplays();
            debouncedFilterCards();
        });
    }
    if (priceSlider) {
        priceSlider.addEventListener('input', () => {
            updateSliderDisplays();
            debouncedFilterCards();
        });
    }

    // --- Category Select Events ---
    if (categorySelect) {
        categorySelect.addEventListener('change', filterCards);
    }
    if (categoryResetBtn) {
        categoryResetBtn.addEventListener('click', () => {
            if (categorySelect && categorySelect.value !== '') {
                categorySelect.value = '';
                filterCards();
            }
        });
    }

    // --- Deal Filter Event ---
    if (dealFilter) {
        dealFilter.addEventListener('change', filterCards);
    }

    // --- Sort Button Events ---
    if (sortButtons) {
        sortButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.bargain-sort-btn');
            if (!btn) return;
            currentSort = btn.dataset.sort;
            updateSortButtons();
            sortCards(currentSort);
            updateUrl();
            if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                globalThis.ApaAnalytics.trackFilterUse('sort', currentSort);
            }
        });
    }

    // --- Keyword Search Events ---
    if (keywordSearch) {
        keywordSearch.addEventListener('input', (e) => {
            if (keywordClearBtn) {
                keywordClearBtn.style.display = keywordSearch.value ? 'block' : 'none';
            }
            if (e.isComposing) return;
            debouncedFilterCards();
        });
    }
    if (keywordClearBtn) {
        keywordClearBtn.addEventListener('click', () => {
            keywordSearch.value = '';
            keywordClearBtn.style.display = 'none';
            keywordSearch.focus();
            filterCards();
        });
    }

    // --- Spec Filters Event ---
    const specFilters = document.getElementById('spec-filters');
    if (specFilters) {
        specFilters.addEventListener('change', () => {
            activePreset = '';
            updatePresetButtons();
            filterCards();
        });
    }

    // --- Preset Button Events ---
    document.querySelectorAll('.filter-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            if (activePreset === preset) {
                activePreset = '';
                updatePresetButtons();
                resetFilters();
            } else {
                applyPreset(preset);
            }
        });
    });

    if (filterReset) {
        filterReset.addEventListener('click', resetFilters);
    }

    // Handle bfcache restoration
    globalThis.addEventListener('pageshow', () => {
        allCards = Array.from(productGrid.querySelectorAll('.card'));
        applyUrlState();
        updateSortButtons();
        updateSliderDisplays();
        sortCards(currentSort);
        filterCards();
    });

    // Initial load
    applyUrlState();
    updateSortButtons();
    updateSliderDisplays();
    sortCards(currentSort);
    filterCards();
}

// Initialize when DOM is ready, or immediately if already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCategoryFeatures);
} else {
    initCategoryFeatures();
}
