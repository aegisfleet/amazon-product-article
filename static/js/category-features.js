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

/**
 * Helper to apply slider values from URL parameters
 */
function applySliderState(params, paramName, slider, isPrice) {
    if (!slider || !params.has(paramName)) return;
    const rawVal = Number.parseInt(params.get(paramName), 10);
    slider.value = isPrice
        ? String(Math.round(priceToValue(rawVal)))
        : String(rawVal);
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
     * Get current filter values from DOM elements
     */
    function getFilterValues() {
        const minScore = scoreSlider ? Number.parseInt(scoreSlider.value, 10) : 0;
        const minPrice = minPriceSlider ? valueToPrice(Number.parseInt(minPriceSlider.value, 10)) : 0;
        const maxPrice = priceSlider ? valueToPrice(Number.parseInt(priceSlider.value, 10)) : 50000;
        const category = categorySelect ? categorySelect.value : '';
        const showOnlyDeals = dealFilter ? dealFilter.checked : false;

        const rawQ = keywordSearch ? keywordSearch.value : '';
        const keywords = normalizeText(rawQ).split(/\s+/).filter(Boolean);

        const specFilters = document.getElementById('spec-filters');
        const requiredSpecs = specFilters ? Array.from(specFilters.querySelectorAll('input[name="spec"]:checked')).map(cb => cb.value) : [];

        return {
            category,
            minPrice,
            maxPrice,
            minScore,
            showOnlyDeals,
            keywords,
            requiredSpecs
        };
    }

    /**
     * Update UI counts and badges based on filter results
     */
    function updateUIElements(visibleCount, totalCount, keywords) {
        if (productCount) {
            productCount.textContent = visibleCount === totalCount
                ? `${totalCount} 件の商品`
                : `${visibleCount} / ${totalCount} 件の商品`;
        }

        if (keywordCountBadge) {
            if (keywords.length > 0) {
                keywordCountBadge.textContent = `${visibleCount}件`;
                keywordCountBadge.style.display = 'inline-flex';
                keywordCountBadge.classList.toggle('zero-results', visibleCount === 0);
            } else {
                keywordCountBadge.style.display = 'none';
            }
        }

        if (categoryResetBtn && categorySelect) {
            const hasCategory = categorySelect.value !== '';
            categoryResetBtn.disabled = !hasCategory;
            categoryResetBtn.hidden = !hasCategory;
        }

        const categoryPillElements = document.querySelectorAll('.category-pill');
        if (categoryPillElements.length > 0 && categorySelect) {
            const currentCat = categorySelect.value;
            categoryPillElements.forEach(pill => {
                const pCat = pill.dataset.category || pill.textContent.trim();
                pill.classList.toggle('active', pCat === currentCat && currentCat !== '');
            });
        }
    }

    /**
     * Apply all filters to cards
     */
    function filterCards() {
        updateSliderDisplays();

        const filters = getFilterValues();

        allCards.forEach(card => {
            card.style.display = isCardVisible(card, filters) ? '' : 'none';
        });

        const visibleCount = allCards.filter(card => card.style.display !== 'none').length;
        updateUIElements(visibleCount, allCards.length, filters.keywords);
        updateActiveChips();

        updateUrl(filters);
    }

    function updateActiveChips() {
        const activeChipsContainer = document.getElementById('category-active-chips');
        if (!activeChipsContainer || typeof renderActiveFilterChips !== 'function') return;

        const filters = getFilterValues();
        const chips = [];

        if (filters.minScore > 0) {
            chips.push({
                id: 'score',
                icon: '🏆',
                label: `スコア ${filters.minScore}点以上`,
                onRemove: () => {
                    if (scoreSlider) scoreSlider.value = '0';
                    filterCards();
                }
            });
        }

        if (filters.minPrice > 100) {
            chips.push({
                id: 'minPrice',
                icon: '💰',
                label: `${formatPrice(filters.minPrice)}〜`,
                onRemove: () => {
                    if (minPriceSlider) minPriceSlider.value = '20';
                    filterCards();
                }
            });
        }

        if (filters.maxPrice < 50000) {
            chips.push({
                id: 'maxPrice',
                icon: '💰',
                label: `〜${formatPrice(filters.maxPrice)}`,
                onRemove: () => {
                    if (priceSlider) priceSlider.value = '1000';
                    filterCards();
                }
            });
        }

        if (filters.showOnlyDeals) {
            chips.push({
                id: 'deal',
                icon: '🏷️',
                label: 'タイムセール対象のみ',
                onRemove: () => {
                    if (dealFilter) dealFilter.checked = false;
                    filterCards();
                }
            });
        }

        if (filters.category) {
            chips.push({
                id: 'category',
                icon: '📂',
                label: `カテゴリ: ${filters.category}`,
                onRemove: () => {
                    if (categorySelect) categorySelect.value = '';
                    filterCards();
                }
            });
        }

        if (keywordSearch?.value.trim()) {
            const rawQ = keywordSearch.value.trim();
            chips.push({
                id: 'keyword',
                icon: '🔍',
                label: `「${rawQ}」`,
                onRemove: () => {
                    keywordSearch.value = '';
                    if (keywordClearBtn) keywordClearBtn.style.display = 'none';
                    filterCards();
                }
            });
        }

        if (filters.requiredSpecs.length > 0) {
            const specLabels = {
                '5g': '5G対応',
                'amoled': '有機EL',
                'gps': 'GPS内蔵',
                'felica': 'FeliCa/おサイフケータイ',
                'waterproof': '防水対応'
            };
            filters.requiredSpecs.forEach(spec => {
                chips.push({
                    id: `spec-${spec}`,
                    icon: '⚙️',
                    label: specLabels[spec] || spec,
                    onRemove: () => {
                        const specInput = document.querySelector(`input[name="spec"][value="${spec}"]`);
                        if (specInput) specInput.checked = false;
                        filterCards();
                    }
                });
            });
        }

        const resetAll = () => {
            if (filterReset) filterReset.click();
        };

        renderActiveFilterChips(activeChipsContainer, chips, resetAll);
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
                case 'points-desc':
                    valA = Number.parseFloat(a.dataset.pointsRate) || 0;
                    valB = Number.parseFloat(b.dataset.pointsRate) || 0;
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
    function updateUrl(filters) {
        const params = new URLSearchParams();

        if (currentSort && currentSort !== 'score-desc') {
            params.set('sort', currentSort);
        }

        if (filters.minScore !== 0) {
            params.set('minScore', String(filters.minScore));
        }

        if (filters.minPrice !== 100) {
            params.set('minPrice', String(filters.minPrice));
        }

        if (filters.maxPrice < 50000) {
            params.set('maxPrice', String(filters.maxPrice));
        }

        if (filters.category) {
            params.set('category', filters.category);
        }

        if (filters.requiredSpecs.length > 0) {
            params.set('specs', filters.requiredSpecs.join(','));
        }

        const rawQ = keywordSearch ? keywordSearch.value.trim() : '';
        if (rawQ) {
            params.set('q', rawQ);
        }

        if (filters.showOnlyDeals) {
            params.set('deal', 'active');
        }



        const queryStr = params.toString();
        const newUrl = globalThis.location.pathname + (queryStr ? '?' + queryStr : '');
        globalThis.history.replaceState({ path: newUrl }, '', newUrl);
    }

    /**
     * Helper to apply specs checkboxes from URL parameters
     */
    function applySpecsState(params) {
        if (!params.has('specs')) return;
        const specFilters = document.getElementById('spec-filters');
        if (!specFilters) return;

        const values = new Set(params.get('specs').split(','));
        specFilters.querySelectorAll('input[name="spec"]').forEach(cb => {
            cb.checked = values.has(cb.value);
        });
    }

    /**
     * Helper to apply keyword search value from URL parameters
     */
    function applyKeywordState(params) {
        if (!keywordSearch || !params.has('q')) return;
        keywordSearch.value = params.get('q');
        if (keywordClearBtn) {
            keywordClearBtn.style.display = 'block';
        }
    }

    /**
     * Apply filter/sort state from URL
     */
    function applyUrlState() {
        const params = new URLSearchParams(globalThis.location.search);



        if (params.has('sort')) {
            currentSort = params.get('sort');
            updateSortButtons();
        }

        applySliderState(params, 'minScore', scoreSlider, false);
        applySliderState(params, 'minPrice', minPriceSlider, true);
        applySliderState(params, 'maxPrice', priceSlider, true);

        if (params.has('category') && categorySelect) {
            categorySelect.value = params.get('category');
        }

        applySpecsState(params);
        applyKeywordState(params);

        if (dealFilter) {
            dealFilter.checked = params.get('deal') === 'active';
        }
    }



    /**
     * Reset all filters to default state
     */
    function resetFilters() {
        if (scoreSlider) scoreSlider.value = '0';
        if (minPriceSlider) minPriceSlider.value = '20';
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



        filterCards();
    }

    // --- Slider Events ---
    if (scoreSlider) {
        scoreSlider.addEventListener('input', () => {
            updateSliderDisplays();
            debouncedFilterCards();
        });
        setupSliderTouchPrevention(scoreSlider);
    }
    if (minPriceSlider) {
        minPriceSlider.addEventListener('input', () => {
            updateSliderDisplays();
            debouncedFilterCards();
        });
        setupSliderTouchPrevention(minPriceSlider);
    }
    if (priceSlider) {
        priceSlider.addEventListener('input', () => {
            updateSliderDisplays();
            debouncedFilterCards();
        });
        setupSliderTouchPrevention(priceSlider);
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

    // --- Category Click Filters (Pill & Card Tag) ---
    const categoryPillsContainer = document.querySelector('.category-pills-container');
    if (categoryPillsContainer) {
        categoryPillsContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.category-pill');
            if (!pill) return;
            e.preventDefault();
            const cat = pill.dataset.category || pill.textContent.trim();
            if (cat && categorySelect) {
                if (categorySelect.value === cat) {
                    categorySelect.value = '';
                } else {
                    categorySelect.value = cat;
                }
                filterCards();
            }
        });
    }

    if (productGrid) {
        productGrid.addEventListener('click', (e) => {
            const catEl = e.target.closest('.bargain-card-category, .card-tag');
            if (!catEl || catEl.classList.contains('card-tag-sub') || catEl.classList.contains('card-tag-brand') || catEl.tagName === 'A' || catEl.closest('a')) return;
            e.preventDefault();
            const cat = catEl.dataset.category || catEl.textContent.trim();
            if (cat && categorySelect) {
                if (categorySelect.value === cat) {
                    categorySelect.value = '';
                } else {
                    categorySelect.value = cat;
                }
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
    initKeywordSearch(keywordSearch, keywordClearBtn, debouncedFilterCards, filterCards);

    // --- Spec Filters Event ---
    const specFilters = document.getElementById('spec-filters');
    if (specFilters) {
        specFilters.addEventListener('change', () => {
            filterCards();
        });
    }



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
