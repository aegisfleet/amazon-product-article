/**
 * low-scores-filter.js
 * 「低スコア迷品館」特設ページのフィルタリング・ソート・表示を管理する。
 */

/**
 * Sort products based on sort selection
 */
function sortLowScoreProducts(products, sortValue) {
  products.sort((a, b) => {
    switch (sortValue) {
      case 'score-asc':
        return a.score - b.score || a.priceRaw - b.priceRaw;
      case 'score-desc':
        return b.score - a.score || a.priceRaw - b.priceRaw;
      case 'price-asc':
        return a.priceRaw - b.priceRaw || a.score - b.score;
      case 'price-desc':
        return b.priceRaw - a.priceRaw || a.score - b.score;
      case 'date':
        return (b.lastInvestigated || '').localeCompare(a.lastInvestigated || '') || a.score - b.score;
      case 'discount':
        return b.savingsPercentage - a.savingsPercentage || a.score - b.score;
      case 'points-rate':
        return (b.pointsRate || 0) - (a.pointsRate || 0) || a.score - b.score;
      default:
        return 0;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const dataEl = document.getElementById('low-scores-data');
  if (!dataEl) return;

  /** @type {Array<{title:string, url:string, score:number, price:string, priceRaw:number, asin:string, category:string, image:string, affiliateUrl:string, lastInvestigated:string, isAmazonDirect:boolean, isAmazonHaul:boolean, loyaltyPoints:number}>} */
  let allProducts;
  try {
    allProducts = JSON.parse(dataEl.textContent);
  } catch {
    return;
  }

  // DOM refs
  const scoreSlider = document.getElementById('low-scores-score-slider');
  const minPriceSlider = document.getElementById('low-scores-min-price-slider');
  const priceSlider = document.getElementById('low-scores-price-slider');
  const scoreValueEl = document.getElementById('low-scores-score-value');
  const minPriceValueEl = document.getElementById('low-scores-min-price-value');
  const priceValueEl = document.getElementById('low-scores-price-value');
  const categorySelect = document.getElementById('low-scores-category-select');
  const sortButtons = document.getElementById('low-scores-sort-buttons');
  const gridEl = document.getElementById('low-scores-grid');
  const statsEl = document.getElementById('low-scores-result-count');
  const noResultsEl = document.getElementById('low-scores-no-results');
  const resetBtn = document.getElementById('low-scores-reset-btn');
  const categoryResetBtn = document.getElementById('low-scores-category-reset-btn');
  const keywordInput = document.getElementById('low-scores-keyword-input');
  const keywordClearBtn = document.getElementById('low-scores-keyword-clear-btn');
  const activeChipsContainer = document.getElementById('low-scores-active-chips');

  if (!scoreSlider || !priceSlider || !gridEl) return;

  let currentSort = 'date'; // Default to newest first

  // --- URL Params ---
  function readUrlParams() {
    const params = new URLSearchParams(globalThis.location.search);
    setSliderFromParam(params, 'maxScore', scoreSlider, null, 1, 50);
    setSliderFromParam(params, 'minPrice', minPriceSlider, (v) => Math.round(priceToValue(v)));
    setSliderFromParam(params, 'maxPrice', priceSlider, (v) => Math.round(priceToValue(v)));
    if (params.has('category') && categorySelect) {
      categorySelect.dataset.pendingValue = params.get('category');
    }
    if (params.has('sort')) {
      const s = params.get('sort');
      if (['score-asc', 'score-desc', 'price-asc', 'price-desc', 'date', 'discount', 'points-rate'].includes(s)) {
        currentSort = s;
      }
    }
    if (params.has('q') && keywordInput) {
      keywordInput.value = params.get('q');
      if (keywordClearBtn) keywordClearBtn.style.display = 'block';
    }
  }

  function updateUrlParams() {
    const params = new URLSearchParams();
    const maxScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const category = categorySelect ? categorySelect.value : '';

    if (maxScore !== 50) params.set('maxScore', String(maxScore));
    if (minPrice !== 100) params.set('minPrice', String(minPrice));
    if (maxPrice < 50000) params.set('maxPrice', String(maxPrice));
    if (category) params.set('category', category);
    if (currentSort !== 'date') params.set('sort', currentSort);
    const q = keywordInput ? keywordInput.value.trim() : '';
    if (q) params.set('q', q);

    const qs = params.toString();
    const newUrl = globalThis.location.pathname + (qs ? '?' + qs : '');
    globalThis.history.replaceState(null, '', newUrl);
  }

  // --- Dynamic Category Update ---
  function updateCategoryOptions(availableProducts) {
    if (!categorySelect) return;
    const currentVal = categorySelect.value || categorySelect.dataset.pendingValue || '';
    delete categorySelect.dataset.pendingValue;

    const cats = new Map();
    for (const p of availableProducts) {
      if (p.category) {
        cats.set(p.category, (cats.get(p.category) || 0) + 1);
      }
    }

    // Clear and rebuild
    categorySelect.innerHTML = '<option value="">すべてのカテゴリ</option>';
    const sorted = [...cats.entries()].sort((a, b) => b[1] - a[1]);

    let exists = false;
    for (const [cat, count] of sorted) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = `${cat} (${count})`;
      categorySelect.appendChild(opt);
      if (cat === currentVal) exists = true;
    }

    if (exists) {
      categorySelect.value = currentVal;
    } else {
      categorySelect.value = '';
    }
  }

  function updateSliderDisplays() {
    const maxScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));

    scoreValueEl.textContent = String(maxScore);
    minPriceValueEl.textContent = formatPrice(minPrice);
    priceValueEl.textContent = maxPrice >= 50000 ? '上限なし' : formatPrice(maxPrice) + '以下';
  }

  function showSkeleton() {
    if (!gridEl) return;
    if (gridEl.querySelector('.skeleton-card')) return;
    if (noResultsEl) noResultsEl.style.display = 'none';
    gridEl.style.display = '';
    if (typeof renderSkeletonGrid === 'function') {
      gridEl.replaceChildren(renderSkeletonGrid(6));
    }
  }

  const debouncedApplyFilters = debounce(applyFilters, 300);

  /**
   * Update badges, list DOM rendering, and grid stats
   */
  function updateFilterUI(filtered, keywords) {
    const badgeEl = document.getElementById('low-scores-keyword-count-badge');
    if (badgeEl) {
      if (keywords.length > 0) {
        badgeEl.textContent = `${filtered.length}件`;
        badgeEl.style.display = 'inline-flex';
        badgeEl.classList.toggle('zero-results', filtered.length === 0);
      } else {
        badgeEl.style.display = 'none';
      }
    }

    gridEl.classList.add('bargain-grid-fade');
    setTimeout(() => {
      if (filtered.length === 0) {
        gridEl.innerHTML = '';
        gridEl.style.display = 'none';
        noResultsEl.style.display = 'flex';
      } else {
        noResultsEl.style.display = 'none';
        gridEl.style.display = '';
        gridEl.replaceChildren(...filtered.map(p => renderCard(p)));
      }
      statsEl.textContent = String(filtered.length);

      if (categoryResetBtn && categorySelect) {
        const hasCategory = categorySelect.value !== '';
        categoryResetBtn.disabled = !hasCategory;
        categoryResetBtn.hidden = !hasCategory;
      }

      gridEl.classList.remove('bargain-grid-fade');
      updateUrlParams();
    }, 200);
  }

  function updateCategoryResetBtn() {
    if (categoryResetBtn && categorySelect) {
      const hasCategory = categorySelect.value !== '';
      categoryResetBtn.disabled = !hasCategory;
      categoryResetBtn.hidden = !hasCategory;
    }
  }

  function applyFilters() {
    showSkeleton();
    updateSliderDisplays();
    updateCategoryResetBtn();

    const maxScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));

    const rawQ = keywordInput ? keywordInput.value : '';
    const keywords = normalizeText(rawQ).split(/\s+/).filter(Boolean);

    // Step 1: Filter by Max Score, Price range, and Keyword
    const preFiltered = allProducts.filter(p => {
      if (p.score > maxScore) return false;
      if (p.priceRaw < minPrice) return false;
      if (maxPrice < 50000 && p.priceRaw > maxPrice) return false;
      return matchesKeywords(p, keywords);
    });

    // Step 2: Update Category options based on Score and Price range
    updateCategoryOptions(preFiltered);

    // Step 3: Filter by selected category
    const category = categorySelect ? categorySelect.value : '';
    const filtered = preFiltered.filter(p => !category || p.category === category);

    // Step 4: Sort
    sortLowScoreProducts(filtered, currentSort);

    // Step 5: Update Active Chips
    updateActiveChips();

    // Step 6: Update UI
    updateFilterUI(filtered, keywords);
  }

  function updateActiveChips() {
    if (!activeChipsContainer || typeof renderActiveFilterChips !== 'function') return;

    const chips = [];
    const maxScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const category = categorySelect ? categorySelect.value : '';
    const rawQ = keywordInput ? keywordInput.value.trim() : '';

    if (maxScore < 50) {
      chips.push({
        id: 'score',
        icon: '⚠️',
        label: `最高スコア ${maxScore}点以下`,
        onRemove: () => {
          scoreSlider.value = '50';
          applyFilters();
        }
      });
    }

    if (minPrice > 100) {
      chips.push({
        id: 'minPrice',
        icon: '💰',
        label: `${formatPrice(minPrice)}〜`,
        onRemove: () => {
          minPriceSlider.value = '20';
          applyFilters();
        }
      });
    }

    if (maxPrice < 50000) {
      chips.push({
        id: 'maxPrice',
        icon: '💰',
        label: `〜${formatPrice(maxPrice)}`,
        onRemove: () => {
          priceSlider.value = '1000';
          applyFilters();
        }
      });
    }

    if (category) {
      chips.push({
        id: 'category',
        icon: '📂',
        label: `カテゴリ: ${category}`,
        onRemove: () => {
          categorySelect.value = '';
          applyFilters();
        }
      });
    }

    if (rawQ) {
      chips.push({
        id: 'keyword',
        icon: '🔍',
        label: `「${rawQ}」`,
        onRemove: () => {
          keywordInput.value = '';
          if (keywordClearBtn) keywordClearBtn.style.display = 'none';
          applyFilters();
        }
      });
    }

    renderActiveFilterChips(activeChipsContainer, chips, resetFilters);
  }

  // --- Reset ---
  function resetFilters() {
    scoreSlider.value = '50';
    minPriceSlider.value = '20';
    priceSlider.value = '1000';
    if (categorySelect) categorySelect.value = '';
    if (keywordInput) keywordInput.value = '';
    if (keywordClearBtn) keywordClearBtn.style.display = 'none';
    const badgeEl = document.getElementById('low-scores-keyword-count-badge');
    if (badgeEl) badgeEl.style.display = 'none';
    currentSort = 'date';
    updateSortButtons();
    applyFilters();
  }

  // --- Sort buttons ---
  function updateSortButtons() {
    if (!sortButtons) return;
    for (const btn of sortButtons.querySelectorAll('.bargain-sort-btn')) {
      btn.classList.toggle('active', btn.dataset.sort === currentSort);
    }
  }

  const triggerFilterWithSkeleton = () => {
    showSkeleton();
    debouncedApplyFilters();
  };

  // --- Events ---
  initKeywordSearch(keywordInput, keywordClearBtn, triggerFilterWithSkeleton, applyFilters);

  scoreSlider.addEventListener('input', () => {
    updateSliderDisplays();
    triggerFilterWithSkeleton();
  });
  setupSliderTouchPrevention(scoreSlider);
  minPriceSlider.addEventListener('input', () => {
    updateSliderDisplays();
    triggerFilterWithSkeleton();
  });
  setupSliderTouchPrevention(minPriceSlider);
  priceSlider.addEventListener('input', () => {
    updateSliderDisplays();
    triggerFilterWithSkeleton();
  });
  setupSliderTouchPrevention(priceSlider);
  if (categorySelect) categorySelect.addEventListener('change', applyFilters);
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);
  if (categoryResetBtn) {
    categoryResetBtn.addEventListener('click', () => {
      if (categorySelect && categorySelect.value !== '') {
        categorySelect.value = '';
        applyFilters();
      }
    });
  }

  if (sortButtons) {
    sortButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.bargain-sort-btn');
      if (!btn) return;
      currentSort = btn.dataset.sort;
      updateSortButtons();
      applyFilters();
    });
  }

  // --- Category Click Filter ---
  if (gridEl) {
    gridEl.addEventListener('click', (e) => {
      const catEl = e.target.closest('.bargain-card-category');
      if (catEl) {
        const catText = catEl.textContent.trim();
        if (catText && categorySelect) {
          if (categorySelect.value === catText) {
            categorySelect.value = '';
          } else {
            categorySelect.value = catText;
          }
          applyFilters();
        }
      }
    });
  }

  // --- Init ---
  readUrlParams();
  updateSortButtons();
  applyFilters();
});
