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
    if (selectedCategories.length === 0) return true;
    const cardCategories = (card.dataset.categories || '').split(',');
    return cardCategories.some(cat => selectedCategories.includes(cat.trim()));
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
 * Master check to see if a card should be visible
 */
function isCardVisible(card, filters) {
    if (!matchesKeyword(card, filters.searchQuery)) return false;
    if (!matchesCategory(card, filters.selectedCategories)) return false;
    if (!matchesPrice(card, filters.priceRange)) return false;
    if (!matchesScore(card, filters.scoreRange)) return false;
    if (!matchesSpecs(card, filters.requiredSpecs)) return false;
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
        const values = params.get(paramName).split(',');
        container.querySelectorAll(`input[name="${checkboxName}"]`).forEach(cb => {
            cb.checked = values.includes(cb.value);
        });
    }
}

/**
 * Update filter section expansion state
 */
function updateFilterSectionState(params, filterSection, filterToggle) {
    if (params.toString()) {
        const hasOtherFilters = params.has('price') || params.has('score') || params.has('categories') || params.has('specs');
        if (hasOtherFilters && filterSection && filterSection.classList.contains('collapsed')) {
            filterSection.classList.remove('collapsed');
            if (filterToggle) filterToggle.setAttribute('aria-expanded', 'true');
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

    if (!sortSelect || !productGrid) return;

    // Store original cards for filtering
    let allCards = Array.from(productGrid.querySelectorAll('.card'));

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



    /**
     * Apply all filters to cards
     */
    function filterCards() {
        const filters = {
            selectedCategories: getSelectedCategories(),
            priceRange: getSelectedPriceRange(),
            scoreRange: getScoreRange(),
            searchQuery: keywordSearch ? keywordSearch.value.trim().toLowerCase() : '',
            requiredSpecs: getSelectedSpecs()
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

        const sortedCards = cards.sort((a, b) => {
            let valA, valB;

            switch (sortValue) {
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
        sortedCards.forEach(card => productGrid.appendChild(card));
    }

    /**
     * Update URL with current filter/sort state
     */
    function updateUrl() {
        const params = new URLSearchParams();

        // Sort
        if (sortSelect.value && sortSelect.value !== 'date-desc') {
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
        if (keywordSearch && keywordSearch.value.trim()) {
            params.set('q', keywordSearch.value.trim());
        }

        const newUrl = globalThis.location.pathname + (params.toString() ? '?' + params.toString() : '');
        globalThis.history.replaceState({ path: newUrl }, '', newUrl);
    }

    /**
     * Apply filter/sort state from URL
     */
    function applyUrlState() {
        const params = new URLSearchParams(globalThis.location.search);

        updateSortState(params, sortSelect);
        updateRadioState(params, 'price', 'price-filter');
        updateRadioState(params, 'score', 'score-filter');
        updateCheckboxState(params, 'categories', categoryFilters, 'category');

        const specFilters = document.getElementById('spec-filters');
        updateCheckboxState(params, 'specs', specFilters, 'spec');

        updateFilterSectionState(params, filterSection, filterToggle);
        updateSearchState(params, keywordSearch);
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

        // Apply filters
        filterCards();
        updateUrl();
    }

    // Handle sort selection change
    sortSelect.addEventListener('change', function () {
        sortCards(this.value);
        updateUrl();
    });

    // Handle filter toggle        // フィルターヘッダーのクリックイベント（スマホ開閉用）
    if (filterToggle && filterSection) {
        filterToggle.addEventListener('click', () => {
            const isCollapsed = filterSection.classList.toggle('collapsed');
            filterToggle.setAttribute('aria-expanded', !isCollapsed);
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
        categoryFilters.addEventListener('change', function () {
            filterCards();
            updateUrl();
        });
    }

    // Handle price filter changes
    document.querySelectorAll('input[name="price-filter"]').forEach(radio => {
        radio.addEventListener('change', () => {
            filterCards();
            updateUrl();
        });
    });

    // Handle score filter changes
    document.querySelectorAll('input[name="score-filter"]').forEach(radio => {
        radio.addEventListener('change', () => {
            filterCards();
            updateUrl();
        });
    });

    // Handle spec filter changes
    const specFilters = document.getElementById('spec-filters');
    if (specFilters) {
        specFilters.addEventListener('change', function () {
            filterCards();
            updateUrl();
        });
    }

    // Handle keyword search input
    if (keywordSearch) {
        let debounceTimer;
        keywordSearch.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                filterCards();
                updateUrl();
            }, 300);
        });
    }

    // Handle bfcache restoration: re-apply sort and filters when page is restored
    globalThis.addEventListener('pageshow', function (event) {
        // Re-store all cards reference
        allCards = Array.from(productGrid.querySelectorAll('.card'));

        // Re-apply the URL state in case it was modified
        applyUrlState();

        // Re-apply the sort to match the preserved select value
        const currentValue = sortSelect.value;
        if (currentValue && currentValue !== 'date-desc') {
            sortCards(currentValue);
        }

        // Re-apply filters
        filterCards();
    });

    // Initial load from URL
    applyUrlState();

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
