/**
 * bargain-filter.js
 * 「あともう一品」特設ページのフィルタリング・ソート・表示を管理する。
 */

document.addEventListener('DOMContentLoaded', () => {
  const dataEl = document.getElementById('bargain-data');
  if (!dataEl) return;

  /** @type {Array<{title:string, url:string, score:number, price:string, priceRaw:number, asin:string, category:string, image:string, affiliateUrl:string, lastInvestigated:string, isAmazonDirect:boolean, loyaltyPoints:number}>} */
  let allProducts;
  try {
    allProducts = JSON.parse(dataEl.textContent);
  } catch {
    return;
  }

  // DOM refs
  const scoreSlider = document.getElementById('bargain-score-slider');
  const minPriceSlider = document.getElementById('bargain-min-price-slider');
  const priceSlider = document.getElementById('bargain-price-slider');
  const scoreValueEl = document.getElementById('bargain-score-value');
  const minPriceValueEl = document.getElementById('bargain-min-price-value');
  const priceValueEl = document.getElementById('bargain-price-value');
  const categorySelect = document.getElementById('bargain-category-select');
  const sortButtons = document.getElementById('bargain-sort-buttons');
  const gridEl = document.getElementById('bargain-grid');
  const statsEl = document.getElementById('bargain-result-count');
  const noResultsEl = document.getElementById('bargain-no-results');
  const resetBtn = document.getElementById('bargain-reset-btn');
  const categoryResetBtn = document.getElementById('bargain-category-reset-btn');
  const keywordInput = document.getElementById('bargain-keyword-input');
  const keywordClearBtn = document.getElementById('bargain-keyword-clear-btn');

  if (!scoreSlider || !priceSlider || !gridEl) return;

  let currentSort = 'date'; // Default to Newest

  // --- URL Params ---
  function readUrlParams() {
    const params = new URLSearchParams(globalThis.location.search);
    setSliderFromParam(params, 'minScore', scoreSlider, null, 0, 100);
    setSliderFromParam(params, 'minPrice', minPriceSlider, (v) => Math.round(priceToValue(v)));
    setSliderFromParam(params, 'maxPrice', priceSlider, (v) => Math.round(priceToValue(v)));
    if (params.has('category') && categorySelect) {
      // We will set this after populating categories
      categorySelect.dataset.pendingValue = params.get('category');
    }
    if (params.has('sort')) {
      const s = params.get('sort');
      if (['score', 'price', 'date', 'discount'].includes(s)) {
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
    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const category = categorySelect ? categorySelect.value : '';

    if (minScore !== 80) params.set('minScore', String(minScore));
    if (minPrice !== 100) params.set('minPrice', String(minPrice));
    if (maxPrice !== 2000) params.set('maxPrice', String(maxPrice));
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

  function applyFilters() {
    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));

    // Ensure minPrice <= maxPrice for logical UX (optional, but good)
    if (minPrice > maxPrice) {
      // You could either sync them or just let the filter handle it
      // Let's just update display for now
    }

    // Update display values
    scoreValueEl.textContent = String(minScore);
    minPriceValueEl.textContent = formatPrice(minPrice);
    priceValueEl.textContent = formatPrice(maxPrice);

    const rawQ = keywordInput ? keywordInput.value : '';
    const normalizedQ = normalizeText(rawQ);
    const keywords = normalizedQ.split(/\s+/).filter(Boolean);

    // Step 1: Filter by Score, Price range, and Keyword
    let preFiltered = allProducts.filter(p => {
      if (p.score < minScore) return false;
      if (p.priceRaw < minPrice) return false;
      if (maxPrice > 0 && p.priceRaw > maxPrice) return false;
      if (maxPrice === 0 && p.priceRaw > 0) return false;
      if (!matchesKeywords(p, keywords)) return false;
      return true;
    });

    // Step 2: Update Category options based on Score and Price range
    updateCategoryOptions(preFiltered);

    // Step 3: Filter by selected category
    const category = categorySelect ? categorySelect.value : '';
    let filtered = preFiltered.filter(p => {
      return !category || p.category === category;
    });

    // Step 4: Sort
    if (currentSort === 'score') {
      filtered.sort((a, b) => b.score - a.score || a.priceRaw - b.priceRaw);
    } else if (currentSort === 'price') {
      filtered.sort((a, b) => a.priceRaw - b.priceRaw || b.score - a.score);
    } else if (currentSort === 'date') {
      filtered.sort((a, b) => {
        const da = a.lastInvestigated || '';
        const db = b.lastInvestigated || '';
        return db.localeCompare(da) || b.score - a.score;
      });
    } else if (currentSort === 'discount') {
      filtered.sort((a, b) => b.savingsPercentage - a.savingsPercentage || b.score - a.score);
    }

    // Update Keyword count badge
    const badgeEl = document.getElementById('bargain-keyword-count-badge');
    if (badgeEl) {
      if (keywords.length > 0) {
        badgeEl.textContent = `${filtered.length}件`;
        badgeEl.style.display = 'inline-flex';
        if (filtered.length === 0) {
          badgeEl.classList.add('zero-results');
        } else {
          badgeEl.classList.remove('zero-results');
        }
      } else {
        badgeEl.style.display = 'none';
      }
    }

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
        gridEl.replaceChildren(...filtered.map(renderCard));
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
    priceSlider.value = '400';
    if (categorySelect) categorySelect.value = '';
    if (keywordInput) keywordInput.value = '';
    if (keywordClearBtn) keywordClearBtn.style.display = 'none';
    const badgeEl = document.getElementById('bargain-keyword-count-badge');
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
  if (keywordInput) {
    keywordInput.addEventListener('input', () => {
      if (keywordClearBtn) {
        keywordClearBtn.style.display = keywordInput.value ? 'block' : 'none';
      }
      applyFilters();
    });
  }
  if (keywordClearBtn) {
    keywordClearBtn.addEventListener('click', () => {
      keywordInput.value = '';
      keywordClearBtn.style.display = 'none';
      keywordInput.focus();
      applyFilters();
    });
  }

  scoreSlider.addEventListener('input', applyFilters);
  minPriceSlider.addEventListener('input', applyFilters);
  priceSlider.addEventListener('input', applyFilters);
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
