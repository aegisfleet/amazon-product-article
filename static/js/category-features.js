// Handle both early and late script loading
function initCategoryFeatures() {
    const sortSelect = document.getElementById('sort-select');
    const productGrid = document.getElementById('product-grid');
    const productCount = document.getElementById('product-count');
    const filterSection = document.getElementById('filter-section');
    const filterToggle = document.getElementById('filter-toggle');
    const filterReset = document.getElementById('filter-reset');
    const categoryFilters = document.getElementById('category-filters');

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
            return { min: parseInt(value), max: Infinity };
        } else if (value.startsWith('0-')) {
            // e.g., "0-5000" means up to 5000
            return { min: 0, max: parseInt(value.split('-')[1]) };
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
        const selectedCategories = getSelectedCategories();
        const priceRange = getSelectedPriceRange();
        const scoreRange = getScoreRange();

        allCards.forEach(card => {
            let visible = true;

            // Category filter
            if (selectedCategories.length > 0) {
                const cardCategories = (card.dataset.categories || '').split(',');
                const hasMatchingCategory = cardCategories.some(cat =>
                    selectedCategories.includes(cat.trim())
                );
                if (!hasMatchingCategory) {
                    visible = false;
                }
            }

            // Price filter
            if (visible && priceRange) {
                const price = parseInt(card.dataset.price) || 0;
                if (price < priceRange.min || price > priceRange.max) {
                    visible = false;
                }
            }

            // Score filter (range-based)
            // For ranges like 90-100: score >= 90
            // For ranges like 80-90: 80 <= score < 90
            // For ranges like 0-70: score < 70
            if (visible && scoreRange) {
                const score = parseFloat(card.dataset.score) || 0;
                // Special case for "90-100" (90点以上): score >= 90
                if (scoreRange.max === 100) {
                    if (score < scoreRange.min) {
                        visible = false;
                    }
                }
                // Special case for "0-70" (70点以下): score < 70
                else if (scoreRange.min === 0) {
                    if (score >= scoreRange.max) {
                        visible = false;
                    }
                }
                // Normal range: min <= score < max
                else {
                    if (score < scoreRange.min || score >= scoreRange.max) {
                        visible = false;
                    }
                }
            }

            // Specs filter (AND logic - must have ALL selected specs)
            const requiredSpecs = getSelectedSpecs();
            if (visible && requiredSpecs.length > 0) {
                const cardSpecs = (card.dataset.specs || '').split(',').map(s => s.trim());
                const hasAllSpecs = requiredSpecs.every(spec => cardSpecs.includes(spec));
                if (!hasAllSpecs) {
                    visible = false;
                }
            }

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
                    valA = parseInt(a.dataset.price) || 0;
                    valB = parseInt(b.dataset.price) || 0;
                    return valA - valB;
                case 'price-desc':
                    valA = parseInt(a.dataset.price) || 0;
                    valB = parseInt(b.dataset.price) || 0;
                    return valB - valA;
                case 'score-desc':
                    valA = parseFloat(a.dataset.score) || 0;
                    valB = parseFloat(b.dataset.score) || 0;
                    return valB - valA;
                case 'date-desc':
                default:
                    valA = parseInt(a.dataset.date) || 0;
                    valB = parseInt(b.dataset.date) || 0;
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

        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

    /**
     * Apply filter/sort state from URL
     */
    function applyUrlState() {
        const params = new URLSearchParams(window.location.search);

        // Sort
        if (params.has('sort')) {
            sortSelect.value = params.get('sort');
        }

        // Price
        if (params.has('price')) {
            const radio = document.querySelector(`input[name="price-filter"][value="${params.get('price')}"]`);
            if (radio) {
                document.querySelectorAll('input[name="price-filter"]').forEach(r => r.checked = false);
                radio.checked = true;
            }
        }

        // Score
        if (params.has('score')) {
            const radio = document.querySelector(`input[name="score-filter"][value="${params.get('score')}"]`);
            if (radio) {
                document.querySelectorAll('input[name="score-filter"]').forEach(r => r.checked = false);
                radio.checked = true;
            }
        }

        // Categories
        if (params.has('categories') && categoryFilters) {
            const cats = params.get('categories').split(',');
            categoryFilters.querySelectorAll('input[name="category"]').forEach(cb => {
                cb.checked = cats.includes(cb.value);
            });
        }

        // Specs
        if (params.has('specs')) {
            const specFilters = document.getElementById('spec-filters');
            if (specFilters) {
                const specs = params.get('specs').split(',');
                specFilters.querySelectorAll('input[name="spec"]').forEach(cb => {
                    cb.checked = specs.includes(cb.value);
                });
            }
        }

        // If any filters are active, ensure the filter section is expanded
        if (params.toString()) {
            filterSection.classList.remove('collapsed');
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

        // Apply filters
        filterCards();
        updateUrl();
    }

    // Handle sort selection change
    sortSelect.addEventListener('change', function () {
        sortCards(this.value);
        updateUrl();
    });

    // Handle filter toggle (expand/collapse)
    if (filterToggle && filterSection) {
        filterToggle.addEventListener('click', function () {
            filterSection.classList.toggle('collapsed');
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

    // Handle bfcache restoration: re-apply sort and filters when page is restored
    window.addEventListener('pageshow', function (event) {
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
