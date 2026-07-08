/**
 * Check if a card matches the keyword search query
 */
function matchesKeyword(card, query) {
    if (!query) return true;
    const title = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
    const excerpt = card.querySelector('.card-excerpt')?.textContent.toLowerCase() || '';
    const specs = Array.from(card.querySelectorAll('.card-spec-tag')).map(tag => tag.textContent.toLowerCase()).join(' ');

    return title.includes(query) || excerpt.includes(query) || specs.includes(query);
}

/**
 * Check if a card matches the selected categories
 */
function matchesCategory(card, selectedCategories) {
    if (selectedCategories.size === 0) return true;
    const cardCategories = (card.dataset.categories || '').split(',');
    return cardCategories.some(cat => selectedCategories.has(cat.trim()));
}

/**
 * Check if a card matches the selected price range
 */
function matchesPrice(card, priceRange) {
    if (!priceRange) return true;
    const price = Number.parseInt(card.dataset.price) || 0;
    return price >= priceRange.min && price <= priceRange.max;
}

/**
 * Check if a card matches the selected score range
 */
function matchesScore(card, scoreRange) {
    if (!scoreRange) return true;
    const score = Number.parseFloat(card.dataset.score) || 0;

    // Special case for "90-100" (90点以上): score >= 90
    if (scoreRange.max === 100) {
        return score >= scoreRange.min;
    }
    // Special case for "0-70" (70点以下): score < 70
    if (scoreRange.min === 0) {
        return score < scoreRange.max;
    }
    // Normal range: min <= score < max
    return score >= scoreRange.min && score < scoreRange.max;
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
 * Check if a card matches the active preset constraints
 */
function matchesPreset(card, presetKey, presetDefinitions) {
    if (!presetKey) return true;
    const preset = presetDefinitions[presetKey];
    if (!preset) return true;

    const price = Number.parseInt(card.dataset.price) || 0;
    const score = Number.parseFloat(card.dataset.score) || 0;
    const cardSpecs = (card.dataset.specs || '').toLowerCase();

    if (typeof preset.minScore === 'number' && score < preset.minScore) return false;
    if (typeof preset.maxPrice === 'number' && price > preset.maxPrice) return false;

    if (Array.isArray(preset.requiredAnySpecs) && preset.requiredAnySpecs.length > 0) {
        const hasAnySpec = preset.requiredAnySpecs.some(spec => cardSpecs.includes(spec.toLowerCase()));
        if (!hasAnySpec) return false;
    }

    return true;
}

/**
 * Master check to see if a card should be visible
 */
function isCardVisible(card, filters) {
    if (!matchesKeyword(card, filters.searchQuery)) return false;
    if (!matchesCategory(card, filters.selectedCategories)) return false;
    if (!matchesPrice(card, filters.priceRange)) return false;
    if (!matchesScore(card, filters.scoreRange)) return false;
    if (!matchesSpecs(card, filters.requiredSpecs)) return false;
    if (!matchesDeal(card, filters.showOnlyDeals)) return false;
    if (!matchesPreset(card, filters.activePreset, filters.presetDefinitions)) return false;
    return true;
}

/**
 * Update sort selection from URL params
 */
function updateSortState(params, sortSelect) {
    if (params.has('sort')) {
        sortSelect.value = params.get('sort');
    }
}

/**
 * Update radio button state from URL params
 */
function updateRadioState(params, paramName, radioGroupName) {
    if (params.has(paramName)) {
        const value = params.get(paramName);
        const radio = document.querySelector(`input[name="${radioGroupName}"][value="${value}"]`);
        if (radio) {
            document.querySelectorAll(`input[name="${radioGroupName}"]`).forEach(r => r.checked = false);
            radio.checked = true;
        }
    }
}

/**
 * Update checkbox states from URL params
 */
function updateCheckboxState(params, paramName, container, checkboxName) {
    if (params.has(paramName) && container) {
        const values = new Set(params.get(paramName).split(','));
        container.querySelectorAll(`input[name="${checkboxName}"]`).forEach(cb => {
            cb.checked = values.has(cb.value);
        });
    }
}

/**
 * Update filter section expansion state
 */
function updateFilterSectionState(params, filterSection, filterToggle) {
    if (params.toString()) {
        const hasOtherFilters = params.has('price') || params.has('score') || params.has('categories') || params.has('specs') || params.has('preset') || params.has('deal');
        if (hasOtherFilters && filterSection?.classList.contains('collapsed')) {
            filterSection.classList.remove('collapsed');
            filterToggle?.setAttribute('aria-expanded', 'true');
        }
    }
}

/**
 * Update keyword search input from URL params
 */
function updateSearchState(params, keywordSearch) {
    if (params.has('q') && keywordSearch) {
        keywordSearch.value = params.get('q');
    }
}

// Handle both early and late script loading
function initCategoryFeatures() {
    const sortSelect = document.getElementById('sort-select');
    const productGrid = document.getElementById('product-grid');
    const productCount = document.getElementById('product-count');
    const filterSection = document.getElementById('filter-section');
    const filterToggle = document.getElementById('filter-toggle');
    const filterReset = document.getElementById('filter-reset');
    const categoryFilters = document.getElementById('category-filters');
    const keywordSearch = document.getElementById('keyword-search');
    const presetButtons = Array.from(document.querySelectorAll('.filter-preset-btn'));

    if (!sortSelect || !productGrid) return;

    // Get the default sort value from HTML state before applying URL params
    const defaultSortValue = sortSelect.value || 'date-desc';

    // Store original cards for filtering
    let allCards = Array.from(productGrid.querySelectorAll('.card'));
    let activePreset = '';

    const presetDefinitions = {
        'cost-performance': {
            minScore: 80,
            maxPrice: 20000
        },
        'high-performance': {
            minScore: 90
        },
        beginner: {
            maxPrice: 10000,
            requiredAnySpecs: ['5g', 'gps', 'amoled']
        },
        lightweight: {
            requiredAnySpecs: ['lightweight', 'portable', 'weight-light', 'weight', '軽量']
        }
    };

    /**
     * Get currently visible cards based on filters
     * @returns {HTMLElement[]} Array of visible card elements
     */
    function getVisibleCards() {
        const cards = Array.from(productGrid.querySelectorAll('.card'));
        return cards.filter(card => card.style.display !== 'none');
    }

    /**
     * Update the product count display
     */
    function updateProductCount() {
        if (!productCount) return;
        const visibleCount = getVisibleCards().length;
        const totalCount = allCards.length;
        if (visibleCount === totalCount) {
            productCount.textContent = `${totalCount} 件の商品`;
        } else {
            productCount.textContent = `${visibleCount} / ${totalCount} 件の商品`;
        }
    }

    /**
     * Get selected categories from checkboxes
     * @returns {string[]} Array of selected category names
     */
    function getSelectedCategories() {
        if (!categoryFilters) return [];
        const checkboxes = categoryFilters.querySelectorAll('input[name="category"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    /**
     * Get selected price range
     * @returns {{min: number, max: number} | null} Price range or null for all
     */
    function getSelectedPriceRange() {
        const selected = document.querySelector('input[name="price-filter"]:checked');
        if (!selected || selected.value === 'all') return null;

        const value = selected.value;
        if (value.endsWith('-')) {
            // e.g., "50000-" means 50000 and above
            return { min: Number.parseInt(value), max: Infinity };
        } else if (value.startsWith('0-')) {
            // e.g., "0-5000" means up to 5000
            return { min: 0, max: Number.parseInt(value.split('-')[1]) };
        } else {
            // e.g., "5000-20000"
            const [min, max] = value.split('-').map(Number);
            return { min, max };
        }
    }

    /**
     * Get score filter range
     * @returns {{min: number, max: number} | null} Score range or null for all
     */
    function getScoreRange() {
        const selected = document.querySelector('input[name="score-filter"]:checked');
        if (!selected || selected.value === 'all') return null;

        const value = selected.value;
        const [min, max] = value.split('-').map(Number);
        return { min, max };
    }

    /**
     * Get selected specs from checkboxes
     * @returns {string[]} Array of selected spec values
     */
    function getSelectedSpecs() {
        const specFilters = document.getElementById('spec-filters');
        if (!specFilters) return [];
        const checkboxes = specFilters.querySelectorAll('input[name="spec"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    function setActivePreset(presetKey) {
        activePreset = presetKey;
        presetButtons.forEach(button => {
            const isActive = button.dataset.preset === presetKey;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }

    function clearActivePreset() {
        setActivePreset('');
    }

    function setRadioValue(groupName, value) {
        const target = document.querySelector(`input[name="${groupName}"][value="${value}"]`);
        if (target) {
            document.querySelectorAll(`input[name="${groupName}"]`).forEach(input => {
                input.checked = false;
            });
            target.checked = true;
        }
    }

    function setSpecValues(specValues) {
        const specFilters = document.getElementById('spec-filters');
        if (!specFilters) return;

        const checkboxes = Array.from(specFilters.querySelectorAll('input[name="spec"]'));
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });

        if (specValues.length === 0) return;

        const loweredTargets = specValues.map(value => value.toLowerCase());
        let hasMatched = false;

        checkboxes.forEach(checkbox => {
            const labelText = checkbox.closest('label')?.textContent.toLowerCase() || '';
            const valueText = checkbox.value.toLowerCase();
            const matched = loweredTargets.some(target => valueText.includes(target) || labelText.includes(target));
            if (matched) {
                checkbox.checked = true;
                hasMatched = true;
            }
        });

        if (!hasMatched && loweredTargets.includes('軽量')) {
            const fallbackKeywords = ['weight', '軽量', '持ち運び'];
            checkboxes.forEach(checkbox => {
                const labelText = checkbox.closest('label')?.textContent.toLowerCase() || '';
                const valueText = checkbox.value.toLowerCase();
                const matched = fallbackKeywords.some(keyword => valueText.includes(keyword) || labelText.includes(keyword));
                if (matched) {
                    checkbox.checked = true;
                }
            });
        }
    }

    function applyPreset(presetKey) {
        const preset = presetDefinitions[presetKey];
        if (!preset) return;

        setRadioValue('price-filter', 'all');
        setRadioValue('score-filter', 'all');
        setSpecValues([]);
        setActivePreset(presetKey);
        filterCards();
        updateUrl();
    }



    /**
     * Apply all filters to cards
     */
    function filterCards() {
        const dealFilter = document.getElementById('deal-filter');
        const filters = {
            selectedCategories: new Set(getSelectedCategories()),
            priceRange: getSelectedPriceRange(),
            scoreRange: getScoreRange(),
            searchQuery: keywordSearch?.value.trim().toLowerCase() || '',
            requiredSpecs: getSelectedSpecs(),
            showOnlyDeals: dealFilter ? dealFilter.checked : false,
            activePreset,
            presetDefinitions
        };

        allCards.forEach(card => {
            const visible = isCardVisible(card, filters);
            card.style.display = visible ? '' : 'none';
        });

        updateProductCount();
    }

    /**
     * Sort cards based on the given sort value
     * @param {string} sortValue - The sort criteria
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
     * Update URL with current filter/sort state
     */
    function updateUrl() {
        const params = new URLSearchParams();

        // Sort
        if (sortSelect.value && sortSelect.value !== defaultSortValue) {
            params.set('sort', sortSelect.value);
        }

        // Price
        const selectedPrice = document.querySelector('input[name="price-filter"]:checked');
        if (selectedPrice && selectedPrice.value !== 'all') {
            params.set('price', selectedPrice.value);
        }

        // Score
        const selectedScore = document.querySelector('input[name="score-filter"]:checked');
        if (selectedScore && selectedScore.value !== 'all') {
            params.set('score', selectedScore.value);
        }

        // Categories
        const selectedCats = getSelectedCategories();
        if (selectedCats.length > 0) {
            params.set('categories', selectedCats.join(','));
        }

        // Specs
        const selectedSpecs = getSelectedSpecs();
        if (selectedSpecs.length > 0) {
            params.set('specs', selectedSpecs.join(','));
        }

        // Search Query
        if (keywordSearch?.value.trim()) {
            params.set('q', keywordSearch.value.trim());
        }

        // Deal
        const dealFilter = document.getElementById('deal-filter');
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
            const presetKey = params.get('preset');
            if (presetKey && presetDefinitions[presetKey]) {
                setActivePreset(presetKey);
            }
        }

        updateSortState(params, sortSelect);
        updateRadioState(params, 'price', 'price-filter');
        updateRadioState(params, 'score', 'score-filter');
        updateCheckboxState(params, 'categories', categoryFilters, 'category');

        const specFilters = document.getElementById('spec-filters');
        updateCheckboxState(params, 'specs', specFilters, 'spec');

        updateFilterSectionState(params, filterSection, filterToggle);
        updateSearchState(params, keywordSearch);

        const dealFilter = document.getElementById('deal-filter');
        if (dealFilter) {
            dealFilter.checked = params.get('deal') === 'active';
        }
    }

    /**
     * Reset all filters to default state
     */
    function resetFilters() {
        // Reset category checkboxes - uncheck all (default state)
        if (categoryFilters) {
            const checkboxes = categoryFilters.querySelectorAll('input[name="category"]');
            checkboxes.forEach(cb => cb.checked = false);
        }

        // Reset price filter
        const priceAll = document.querySelector('input[name="price-filter"][value="all"]');
        if (priceAll) priceAll.checked = true;

        // Reset score filter
        const scoreAll = document.querySelector('input[name="score-filter"][value="all"]');
        if (scoreAll) scoreAll.checked = true;

        // Reset spec filters - uncheck all
        const specFilters = document.getElementById('spec-filters');
        if (specFilters) {
            const specCheckboxes = specFilters.querySelectorAll('input[name="spec"]');
            specCheckboxes.forEach(cb => cb.checked = false);
        }

        // Reset keyword search
        if (keywordSearch) {
            keywordSearch.value = '';
        }

        // Reset deal filter
        const dealFilter = document.getElementById('deal-filter');
        if (dealFilter) {
            dealFilter.checked = false;
        }

        clearActivePreset();

        // Apply filters
        filterCards();
        updateUrl();
    }

    // Handle sort selection change
    sortSelect.addEventListener('change', function () {
        sortCards(this.value);
        updateUrl();
        // GA4 トラッキング
        if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
            globalThis.ApaAnalytics.trackFilterUse('sort', this.value);
        }
    });

    // Handle filter toggle        // フィルターヘッダーのクリックイベント（スマホ開閉用）
    if (filterToggle && filterSection) {
        filterToggle.addEventListener('click', () => {
            const isCollapsed = filterSection.classList.toggle('collapsed');
            filterToggle?.setAttribute('aria-expanded', !isCollapsed);
        });
    }

    // Handle filter reset
    if (filterReset) {
        filterReset.addEventListener('click', function (e) {
            e.stopPropagation(); // Don't trigger toggle
            resetFilters();
        });
    }

    // Handle category filter changes
    if (categoryFilters) {
        categoryFilters.addEventListener('change', function (e) {
            clearActivePreset();
            filterCards();
            updateUrl();
            // GA4 トラッキング
            if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                const cb = e.target instanceof HTMLInputElement ? e.target : null;
                const visibleCount = document.querySelectorAll('#product-grid .card:not([hidden])').length;
                globalThis.ApaAnalytics.trackFilterUse('category', cb ? cb.value : '', visibleCount);
            }
        });
    }

    // Handle price filter changes
    document.querySelectorAll('input[name="price-filter"]').forEach(radio => {
        radio.addEventListener('change', () => {
            clearActivePreset();
            filterCards();
            updateUrl();
            // GA4 トラッキング
            if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                const checked = document.querySelector('input[name="price-filter"]:checked');
                globalThis.ApaAnalytics.trackFilterUse('price', checked ? checked.value : '');
            }
        });
    });

    // Handle score filter changes
    document.querySelectorAll('input[name="score-filter"]').forEach(radio => {
        radio.addEventListener('change', () => {
            clearActivePreset();
            filterCards();
            updateUrl();
            // GA4 トラッキング
            if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                const checked = document.querySelector('input[name="score-filter"]:checked');
                globalThis.ApaAnalytics.trackFilterUse('score', checked ? checked.value : '');
            }
        });
    });

    // Handle spec filter changes
    const specFilters = document.getElementById('spec-filters');
    if (specFilters) {
        specFilters.addEventListener('change', function (e) {
            clearActivePreset();
            filterCards();
            updateUrl();
            // GA4 トラッキング
            if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                const cb = e.target instanceof HTMLInputElement ? e.target : null;
                globalThis.ApaAnalytics.trackFilterUse('spec', cb ? cb.value : '');
            }
        });
    }

    // Handle deal filter changes
    const dealFilter = document.getElementById('deal-filter');
    if (dealFilter) {
        dealFilter.addEventListener('change', () => {
            clearActivePreset();
            filterCards();
            updateUrl();
            // GA4 トラッキング
            if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                globalThis.ApaAnalytics.trackFilterUse('deal', dealFilter.checked ? 'active' : '');
            }
        });
    }

    // Handle keyword search input
    if (keywordSearch) {
        let debounceTimer;
        keywordSearch.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                clearActivePreset();
                filterCards();
                updateUrl();
            }, 300);
        });
    }

    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const presetKey = button.dataset.preset || '';
            if (!presetKey) return;

            if (activePreset === presetKey) {
                clearActivePreset();
                filterCards();
                updateUrl();
                // GA4 トラッキング
                if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                    globalThis.ApaAnalytics.trackFilterUse('preset', '');
                }
                return;
            }

            applyPreset(presetKey);
            // GA4 トラッキング
            if (globalThis.ApaAnalytics && typeof globalThis.ApaAnalytics.trackFilterUse === 'function') {
                globalThis.ApaAnalytics.trackFilterUse('preset', presetKey);
            }
        });
    });

    // Handle bfcache restoration: re-apply sort and filters when page is restored
    globalThis.addEventListener('pageshow', function (event) {
        // Re-store all cards reference
        allCards = Array.from(productGrid.querySelectorAll('.card'));

        // Re-apply the URL state in case it was modified
        applyUrlState();

        // Re-apply the sort to match the preserved select value
        const currentValue = sortSelect.value;
        if (currentValue) {
            sortCards(currentValue);
        }

        // Re-apply filters
        filterCards();
    });

    // Initial load from URL
    applyUrlState();

    if (activePreset) {
        applyPreset(activePreset);
    }

    // Initial count update
    updateProductCount();

    // Initial sort to ensure display matches the default "Newest" selection
    sortCards(sortSelect.value);

    // Initial filter application
    filterCards();
}

// Initialize when DOM is ready, or immediately if already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCategoryFeatures);
} else {
    initCategoryFeatures();
}
