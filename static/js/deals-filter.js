/**
 * deals-filter.js
 * セール対象商品特設ページのフィルタリング・ソート・表示を管理する。
 */

function matchesDealType(p, dealType) {
  if (!dealType) return true;
  const isPrime = p.dealAccessType === 'PRIME_EXCLUSIVE' || p.dealAccessType === 'PRIME_EARLY_ACCESS';
  if (dealType === 'prime') return isPrime;
  if (dealType === 'standard') return !isPrime;
  return true;
}

// --- Sort Helper ---
function sortFilteredProducts(filtered, sortType) {
  if (sortType === 'date') {
    filtered.sort((a, b) => {
      const da = a.lastInvestigated || '';
      const db = b.lastInvestigated || '';
      return db.localeCompare(da) || b.score - a.score;
    });
  } else if (sortType === 'discount') {
    filtered.sort((a, b) => b.savingsPercentage - a.savingsPercentage || b.score - a.score);
  } else if (sortType === 'score') {
    filtered.sort((a, b) => b.score - a.score || b.savingsPercentage - a.savingsPercentage);
  } else if (sortType === 'price-asc') {
    filtered.sort((a, b) => a.priceRaw - b.priceRaw || b.score - a.score);
  } else if (sortType === 'price-desc') {
    filtered.sort((a, b) => b.priceRaw - a.priceRaw || b.score - a.score);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const dataEl = document.getElementById('deals-data');
  if (!dataEl) return;

  /** @type {Array<{title:string, url:string, score:number, price:string, priceRaw:number, asin:string, category:string, image:string, affiliateUrl:string, lastInvestigated:string, isAmazonDirect:boolean, loyaltyPoints:number, savingsPercentage:number, dealBadge:string, dealAccessType:string}>} */
  let allProducts;
  try {
    allProducts = JSON.parse(dataEl.textContent);
  } catch {
    return;
  }

  // DOM refs
  const scoreSlider = document.getElementById('deals-score-slider');
  const minPriceSlider = document.getElementById('deals-min-price-slider');
  const priceSlider = document.getElementById('deals-price-slider');
  const discountSlider = document.getElementById('deals-discount-slider');
  const dealTypeSelect = document.getElementById('deals-type-select');
  const categorySelect = document.getElementById('deals-category-select');
  const sortButtons = document.getElementById('deals-sort-buttons');
  const gridEl = document.getElementById('deals-grid');
  const statsEl = document.getElementById('deals-result-count');
  const noResultsEl = document.getElementById('deals-no-results');
  const resetBtn = document.getElementById('deals-reset-btn');
  const categoryResetBtn = document.getElementById('deals-category-reset-btn');
  const keywordInput = document.getElementById('deals-keyword-input');
  const keywordClearBtn = document.getElementById('deals-keyword-clear-btn');

  const scoreValueEl = document.getElementById('deals-score-value');
  const minPriceValueEl = document.getElementById('deals-min-price-value');
  const priceValueEl = document.getElementById('deals-price-value');
  const discountValueEl = document.getElementById('deals-discount-value');

  if (!scoreSlider || !priceSlider || !gridEl) return;

  let currentSort = 'date'; // Default to newest/last investigated date

  // --- URL Params ---
  function readUrlParams() {
    const params = new URLSearchParams(globalThis.location.search);
    setSliderFromParam(params, 'minScore', scoreSlider, null, 0, 100);
    setSliderFromParam(params, 'minPrice', minPriceSlider, (v) => Math.round(priceToValue(v)));
    setSliderFromParam(params, 'maxPrice', priceSlider, (v) => Math.round(priceToValue(v)));
    setSliderFromParam(params, 'minDiscount', discountSlider, null, 0, 100);

    if (dealTypeSelect && params.has('dealType')) {
      dealTypeSelect.value = params.get('dealType');
    }
    if (categorySelect && params.has('category')) {
      categorySelect.dataset.pendingValue = params.get('category');
    }
    const s = params.get('sort');
    if (s && ['score', 'price-asc', 'price-desc', 'discount', 'date'].includes(s)) {
      currentSort = s;
    }
    if (params.has('q') && keywordInput) {
      keywordInput.value = params.get('q');
      if (keywordClearBtn) keywordClearBtn.style.display = 'block';
    }
  }

  function updateUrlParams() {
    const params = new URLSearchParams();
    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const minDiscount = Number.parseInt(discountSlider.value, 10);
    const dealType = dealTypeSelect ? dealTypeSelect.value : '';
    const category = categorySelect ? categorySelect.value : '';

    if (minScore !== 80) params.set('minScore', String(minScore));
    if (minPrice !== 100) params.set('minPrice', String(minPrice));
    if (maxPrice !== 50000) params.set('maxPrice', String(maxPrice));
    if (minDiscount !== 0) params.set('minDiscount', String(minDiscount));
    if (dealType) params.set('dealType', dealType);
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

  // --- Keyword Badge Helper ---
  function updateKeywordBadge(filteredCount, keywords) {
    const badgeEl = document.getElementById('deals-keyword-count-badge');
    if (!badgeEl) return;

    if (keywords.length > 0) {
      badgeEl.textContent = `${filteredCount}件`;
      badgeEl.style.display = 'inline-flex';
      if (filteredCount === 0) {
        badgeEl.classList.add('zero-results');
      } else {
        badgeEl.classList.remove('zero-results');
      }
    } else {
      badgeEl.style.display = 'none';
    }
  }

  function updateSliderDisplays() {
    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const minDiscount = Number.parseInt(discountSlider.value, 10);

    scoreValueEl.textContent = String(minScore);
    minPriceValueEl.textContent = formatPrice(minPrice);
    priceValueEl.textContent = maxPrice >= 50000 ? '上限なし' : formatPrice(maxPrice) + '以下';
    discountValueEl.textContent = String(minDiscount);
  }

  const debouncedApplyFilters = debounce(applyFilters, 300);

  function applyFilters() {
    updateSliderDisplays();

    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const minDiscount = Number.parseInt(discountSlider.value, 10);
    const dealType = dealTypeSelect ? dealTypeSelect.value : '';

    const rawQ = keywordInput ? keywordInput.value : '';
    const normalizedQ = normalizeText(rawQ);
    const keywords = normalizedQ.split(/\s+/).filter(Boolean);

    // Step 1: Filter by Score, Price, Discount, Deal Type, and Keyword
    let preFiltered = allProducts.filter(p => {
      if (p.score < minScore) return false;
      if (p.priceRaw < minPrice) return false;
      if (maxPrice < 50000 && p.priceRaw > maxPrice) return false;
      if (p.savingsPercentage < minDiscount) return false;
      if (!matchesDealType(p, dealType)) return false;
      if (!matchesKeywords(p, keywords)) return false;
      return true;
    });

    // Step 2: Update Category options
    updateCategoryOptions(preFiltered);

    // Step 3: Filter by selected category
    const category = categorySelect ? categorySelect.value : '';
    let filtered = preFiltered.filter(p => {
      return !category || p.category === category;
    });

    // Step 4: Sort
    sortFilteredProducts(filtered, currentSort);

    // Update Keyword count badge
    updateKeywordBadge(filtered.length, keywords);

    // Animate
    gridEl.classList.add('bargain-grid-fade');
    setTimeout(() => {
      // Render
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
        categoryResetBtn.disabled = (categorySelect.value === '');
      }

      gridEl.classList.remove('bargain-grid-fade');
      updateUrlParams();
    }, 200);
  }

  // --- Reset ---
  function resetFilters() {
    scoreSlider.value = '80';
    minPriceSlider.value = '20';
    priceSlider.value = '1000'; // max
    discountSlider.value = '0';
    if (dealTypeSelect) dealTypeSelect.value = '';
    if (categorySelect) categorySelect.value = '';
    if (keywordInput) keywordInput.value = '';
    if (keywordClearBtn) keywordClearBtn.style.display = 'none';
    const badgeEl = document.getElementById('deals-keyword-count-badge');
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

  // --- Events ---
  initKeywordSearch(keywordInput, keywordClearBtn, debouncedApplyFilters, applyFilters);

  scoreSlider.addEventListener('input', () => {
    updateSliderDisplays();
    debouncedApplyFilters();
  });
  setupSliderTouchPrevention(scoreSlider);
  minPriceSlider.addEventListener('input', () => {
    updateSliderDisplays();
    debouncedApplyFilters();
  });
  setupSliderTouchPrevention(minPriceSlider);
  priceSlider.addEventListener('input', () => {
    updateSliderDisplays();
    debouncedApplyFilters();
  });
  setupSliderTouchPrevention(priceSlider);
  discountSlider.addEventListener('input', () => {
    updateSliderDisplays();
    debouncedApplyFilters();
  });
  setupSliderTouchPrevention(discountSlider);
  if (dealTypeSelect) dealTypeSelect.addEventListener('change', applyFilters);
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
