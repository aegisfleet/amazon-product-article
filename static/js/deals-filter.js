/**
 * deals-filter.js
 * セール対象商品特設ページのフィルタリング・ソート・表示を管理する。
 */

const KNOWN_SALE_EVENTS = [
  'ブラックフライデー',
  'プライム感謝祭',
  'プライムデー',
  'スマイル Sale',
  '新生活セール',
  'ゴールデンウィーク',
  '初売り',
];

const STANDARD_DEAL_BADGES = new Set([
  'タイムセール',
  '限定タイムセール',
  '特選タイムセール',
  'プライム会員限定セール',
  '限定プライムセール',
  '厳選目玉商品',
  'リユースセール',
  'セール',
]);

function extractSaleEventName(badge) {
  const trimmed = String(badge || '').trim();
  if (!trimmed) return '';
  for (const ev of KNOWN_SALE_EVENTS) {
    if (trimmed.includes(ev)) return ev;
  }
  if (STANDARD_DEAL_BADGES.has(trimmed)) return '';
  // 未知のイベントバッジは「先行セール」「プライムセール」等の接尾辞を除いてグルーピング
  const stripped = trimmed.replace(/(先行セール|プライムセール)$/, '').trim();
  return stripped || trimmed;
}

function matchesDealType(p, dealType) {
  if (!dealType) return true;
  const badge = p.dealBadge || '';
  const isPrime = p.dealAccessType === 'PRIME_EXCLUSIVE' || p.dealAccessType === 'PRIME_EARLY_ACCESS';
  const isLimited = badge === '限定タイムセール';
  if (dealType === 'prime') return isPrime;
  if (dealType === 'limited') return isLimited;
  if (dealType === 'standard') return !isPrime && !isLimited;
  if (dealType.startsWith('event:')) {
    const eventName = dealType.slice('event:'.length);
    return badge.includes(eventName);
  }
  if (dealType.startsWith('badge:')) {
    const exactBadge = dealType.slice('badge:'.length);
    return badge === exactBadge;
  }
  return badge.includes(dealType);
}

function getDealTypeLabel(dealType) {
  if (!dealType) return '';
  if (dealType === 'prime') return 'プライム会員限定';
  if (dealType === 'limited') return '限定タイムセール';
  if (dealType === 'standard') return 'タイムセール';
  if (dealType.startsWith('event:')) return `${dealType.slice('event:'.length)}（すべて）`;
  if (dealType.startsWith('badge:')) return dealType.slice('badge:'.length);
  return dealType;
}

function mapCatalogRecordToDealProduct(rec) {
  const priceRaw = typeof rec.price === 'number' && rec.price > 0 ? rec.price : 0;
  const price = priceRaw > 0 ? `￥${priceRaw.toLocaleString('ja-JP')}` : '';
  const asin = String(rec.asin || '').toUpperCase();
  const avail = rec.availability || '';
  const inStock = !avail.includes('在庫切れ') && !avail.includes('取り扱いできません');
  return {
    title: rec.title || asin,
    url: `/catalog/?asin=${encodeURIComponent(asin)}`,
    score: 0,
    price,
    priceRaw,
    asin,
    category: rec.amazon_category || '',
    brand: rec.brand || '',
    image: rec.image || '',
    affiliateUrl: asin ? `https://www.amazon.co.jp/dp/${encodeURIComponent(asin)}?tag=aegis-22&linkCode=ogi&th=1&psc=1` : '',
    lastInvestigated: rec.price_as_of || '',
    priceAsOf: rec.price_as_of || '',
    isAmazonDirect: false,
    isAmazonHaul: false,
    loyaltyPoints: 0,
    pointsRate: 0,
    savingsPercentage: typeof rec.savings_percentage === 'number' ? rec.savings_percentage : 0,
    dealBadge: rec.deal_badge || '',
    dealAccessType: rec.deal_access_type || '',
    availability: avail,
    inStock,
    isUninvestigated: true,
  };
}

// --- Sort Helper ---
function sortFilteredProducts(filtered, sortType) {
  const invOrder = (a, b) => Number(Boolean(a.isUninvestigated)) - Number(Boolean(b.isUninvestigated));
  if (sortType === 'date') {
    filtered.sort((a, b) => {
      const da = a.lastInvestigated || a.priceAsOf || '';
      const db = b.lastInvestigated || b.priceAsOf || '';
      return db.localeCompare(da) || invOrder(a, b) || b.score - a.score;
    });
  } else if (sortType === 'discount') {
    filtered.sort((a, b) => b.savingsPercentage - a.savingsPercentage || invOrder(a, b) || b.score - a.score);
  } else if (sortType === 'score') {
    filtered.sort((a, b) => invOrder(a, b) || b.score - a.score || b.savingsPercentage - a.savingsPercentage);
  } else if (sortType === 'price-asc') {
    filtered.sort((a, b) => a.priceRaw - b.priceRaw || invOrder(a, b) || b.score - a.score);
  } else if (sortType === 'price-desc') {
    filtered.sort((a, b) => b.priceRaw - a.priceRaw || invOrder(a, b) || b.score - a.score);
  } else if (sortType === 'points-rate') {
    filtered.sort((a, b) => (b.pointsRate || 0) - (a.pointsRate || 0) || invOrder(a, b) || b.score - a.score);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const dataEl = document.getElementById('deals-data');
  if (!dataEl) return;

  /** @type {Array<{title:string, url:string, score:number, price:string, priceRaw:number, asin:string, category:string, image:string, affiliateUrl:string, lastInvestigated:string, isAmazonDirect:boolean, isAmazonHaul:boolean, loyaltyPoints:number, savingsPercentage:number, dealBadge:string, dealAccessType:string}>} */
  const investigatedProducts = await loadProductDataset(dataEl, 'deals-no-results');
  if (!investigatedProducts) return;
  const investigatedAsinSet = new Set(investigatedProducts.map((p) => String(p.asin || '').toUpperCase()).filter(Boolean));
  let uninvestigatedProducts = [];
  let uninvestigatedLoaded = false;
  let uninvestigatedLoadingPromise = null;

  // DOM refs
  const scoreSlider = document.getElementById('deals-score-slider');
  const minPriceSlider = document.getElementById('deals-min-price-slider');
  const priceSlider = document.getElementById('deals-price-slider');
  const discountSlider = document.getElementById('deals-discount-slider');
  const dealTypeSelect = document.getElementById('deals-type-select');
  const inStockFilter = document.getElementById('deals-in-stock-filter');
  const includeUninvestigatedFilter = document.getElementById('deals-include-uninvestigated');
  const uninvestigatedStatusEl = document.getElementById('deals-uninvestigated-status');
  const categorySelect = document.getElementById('deals-category-select');
  const sortButtons = document.getElementById('deals-sort-buttons');
  const gridEl = document.getElementById('deals-grid');
  const statsEl = document.getElementById('deals-result-count');
  const noResultsEl = document.getElementById('deals-no-results');
  const resetBtn = document.getElementById('deals-reset-btn');
  const categoryResetBtn = document.getElementById('deals-category-reset-btn');
  const keywordInput = document.getElementById('deals-keyword-input');
  const keywordClearBtn = document.getElementById('deals-keyword-clear-btn');
  const activeChipsContainer = document.getElementById('deals-active-chips');
  const noResultsActionsEl = document.getElementById('deals-no-results-actions');
  const loadMoreContainer = document.getElementById('deals-load-more-container');
  const loadMoreBtn = document.getElementById('deals-load-more-btn');

  const scoreValueEl = document.getElementById('deals-score-value');
  const minPriceValueEl = document.getElementById('deals-min-price-value');
  const priceValueEl = document.getElementById('deals-price-value');
  const discountValueEl = document.getElementById('deals-discount-value');
  const heroTotalCountEl = document.getElementById('deals-hero-total-count');
  const heroHitCountEl = document.getElementById('deals-hero-hit-count');
  const heroMaxDiscountEl = document.getElementById('deals-hero-max-discount');
  const heroPresetsContainer = document.getElementById('deals-hero-presets');
  const featuredPresetBtn = document.getElementById('deals-preset-featured');
  const eventPresetBtn = document.getElementById('deals-preset-event');
  const eventPresetLabelEl = document.getElementById('deals-preset-event-label');

  let activeMajorEvent = '';

  function getActiveProducts() {
    if (includeUninvestigatedFilter?.checked && uninvestigatedLoaded) {
      return [...investigatedProducts, ...uninvestigatedProducts];
    }
    return investigatedProducts;
  }

  function updateHeroTotalCount() {
    if (heroTotalCountEl) {
      heroTotalCountEl.textContent = getActiveProducts().length.toLocaleString();
    }
  }

  async function ensureUninvestigatedDealsLoaded() {
    if (uninvestigatedLoaded) return true;
    if (uninvestigatedLoadingPromise) return uninvestigatedLoadingPromise;

    const catalogDealsSrc = dataEl.dataset.catalogDealsSrc || '/catalog-deals-index.json';
    if (uninvestigatedStatusEl) {
      uninvestigatedStatusEl.textContent = '未調査セール商品を読み込み中...';
      uninvestigatedStatusEl.style.display = 'inline';
    }

    uninvestigatedLoadingPromise = (async () => {
      try {
        const res = await fetch(catalogDealsSrc);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rawRecords = await res.json();
        const mapped = [];
        for (const rec of Array.isArray(rawRecords) ? rawRecords : []) {
          const asin = String(rec?.asin || '').toUpperCase();
          if (!asin || investigatedAsinSet.has(asin)) continue;
          mapped.push(mapCatalogRecordToDealProduct(rec));
        }
        uninvestigatedProducts = mapped;
        uninvestigatedLoaded = true;
        if (uninvestigatedStatusEl) {
          uninvestigatedStatusEl.textContent = `未調査セール ${mapped.length.toLocaleString()}件を追加`;
        }
        return true;
      } catch (err) {
        console.error('Failed to load catalog-deals-index.json:', err);
        if (uninvestigatedStatusEl) {
          uninvestigatedStatusEl.textContent = '未調査データの読み込みに失敗しました';
        }
        return false;
      } finally {
        uninvestigatedLoadingPromise = null;
      }
    })();

    return uninvestigatedLoadingPromise;
  }

  function updateDealTypeOptions(products) {
    if (!dealTypeSelect) return;
    const currentVal = dealTypeSelect.value || dealTypeSelect.dataset.pendingValue || '';
    delete dealTypeSelect.dataset.pendingValue;

    const badgeCounts = new Map();
    let primeCount = 0;
    for (const p of products) {
      if (p.dealBadge) {
        badgeCounts.set(p.dealBadge, (badgeCounts.get(p.dealBadge) || 0) + 1);
      }
      if (p.dealAccessType === 'PRIME_EXCLUSIVE' || p.dealAccessType === 'PRIME_EARLY_ACCESS') {
        primeCount += 1;
      }
    }

    const eventCountMap = new Map();
    for (const [badge, cnt] of badgeCounts.entries()) {
      const evName = extractSaleEventName(badge);
      if (evName) {
        eventCountMap.set(evName, (eventCountMap.get(evName) || 0) + cnt);
      }
    }
    const eventGroups = [...eventCountMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    activeMajorEvent = eventGroups[0]?.name || '';

    dealTypeSelect.innerHTML = '<option value="">すべてのセール</option>';
    const appendOption = (value, label) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      dealTypeSelect.appendChild(opt);
    };

    for (const ev of eventGroups) {
      appendOption(`event:${ev.name}`, `${ev.name}（すべて） (${ev.count.toLocaleString()})`);
    }
    if (primeCount > 0) {
      appendOption('prime', `プライム会員限定 (${primeCount.toLocaleString()})`);
    }
    const sortedBadges = [...badgeCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [badge, count] of sortedBadges) {
      appendOption(`badge:${badge}`, `${badge} (${count.toLocaleString()})`);
    }

    if (currentVal && Array.from(dealTypeSelect.options).some((o) => o.value === currentVal)) {
      dealTypeSelect.value = currentVal;
    } else if (currentVal === 'limited' || currentVal === 'standard') {
      appendOption(currentVal, getDealTypeLabel(currentVal));
      dealTypeSelect.value = currentVal;
    } else {
      dealTypeSelect.value = '';
    }

    if (featuredPresetBtn) {
      featuredPresetBtn.hidden = !badgeCounts.has('厳選目玉商品');
    }
    if (eventPresetBtn && eventPresetLabelEl) {
      eventPresetBtn.hidden = !activeMajorEvent;
      if (activeMajorEvent) {
        eventPresetLabelEl.textContent = activeMajorEvent;
      }
    }
  }

  updateHeroTotalCount();
  updateDealTypeOptions(investigatedProducts);

  if (!scoreSlider || !priceSlider || !gridEl) return;

  // Initialize Paginated Grid Renderer (renders initial 30 items + incremental loading)
  const paginatedRenderer = typeof createPaginatedGridRenderer === 'function'
    ? createPaginatedGridRenderer({
        gridEl,
        loadMoreContainer,
        loadMoreBtn,
        batchSize: 30,
        renderItem: (p) => renderCard(p),
      })
    : null;

  let currentSort = 'date'; // Default to newest/last investigated date

  // --- URL Params ---
  function readUrlParams() {
    const params = new URLSearchParams(globalThis.location.search);
    setSliderFromParam(params, 'minScore', scoreSlider, null, 0, 100);
    setSliderFromParam(params, 'minPrice', minPriceSlider, (v) => Math.round(priceToValue(v)));
    setSliderFromParam(params, 'maxPrice', priceSlider, (v) => Math.round(priceToValue(v)));
    setSliderFromParam(params, 'minDiscount', discountSlider, null, 0, 100);

    if (dealTypeSelect && params.has('dealType')) {
      dealTypeSelect.dataset.pendingValue = params.get('dealType');
    }
    if (inStockFilter && params.get('inStock') === '1') {
      inStockFilter.checked = true;
    }
    if (includeUninvestigatedFilter && params.get('includeUninvestigated') === '1') {
      includeUninvestigatedFilter.checked = true;
    }
    if (categorySelect && params.has('category')) {
      categorySelect.dataset.pendingValue = params.get('category');
    }
    const s = params.get('sort');
    if (s && ['score', 'price-asc', 'price-desc', 'discount', 'date', 'points-rate'].includes(s)) {
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
    if (maxPrice !== 200000) params.set('maxPrice', String(maxPrice));
    if (minDiscount !== 0) params.set('minDiscount', String(minDiscount));
    if (dealType) params.set('dealType', dealType);
    if (inStockFilter?.checked) params.set('inStock', '1');
    if (includeUninvestigatedFilter?.checked) params.set('includeUninvestigated', '1');
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
    priceValueEl.textContent = maxPrice >= 200000 ? '上限なし' : formatPrice(maxPrice) + '以下';
    discountValueEl.textContent = String(minDiscount);
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

    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const minDiscount = Number.parseInt(discountSlider.value, 10);
    const dealType = dealTypeSelect ? dealTypeSelect.value : '';

    const rawQ = keywordInput ? keywordInput.value : '';
    const normalizedQ = normalizeText(rawQ);
    const keywords = normalizedQ.split(/\s+/).filter(Boolean);

    const showOnlyInStock = inStockFilter ? inStockFilter.checked : false;
    const activeProducts = getActiveProducts();

    // Step 1: Filter by Score, Price, Discount, Deal Type, and Keyword
    let preFiltered = activeProducts.filter(p => {
      if (!p.isUninvestigated && p.score < minScore) return false;
      if (p.priceRaw < minPrice) return false;
      if (maxPrice < 200000 && p.priceRaw > maxPrice) return false;
      if (p.savingsPercentage < minDiscount) return false;
      if (!matchesDealType(p, dealType)) return false;
      if (!matchesKeywords(p, keywords)) return false;
      if (showOnlyInStock && (p.inStock === false || (typeof isAvailableInStock === 'function' && !isAvailableInStock(p.availability)))) return false;
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

    // Step 5: Update Active Chips
    updateActiveChips();

    // Update Keyword count badge
    updateKeywordBadge(filtered.length, keywords);

    // Animate
    gridEl.classList.add('bargain-grid-fade');
    setTimeout(() => {
      // Render
      if (filtered.length === 0) {
        if (paginatedRenderer) {
          paginatedRenderer.setItems([]);
        } else {
          gridEl.innerHTML = '';
        }
        gridEl.style.display = 'none';
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        noResultsEl.style.display = 'flex';
      } else {
        noResultsEl.style.display = 'none';
        gridEl.style.display = '';
        if (paginatedRenderer) {
          paginatedRenderer.setItems(filtered);
        } else {
          gridEl.replaceChildren(...filtered.map(p => renderCard(p)));
        }
      }
      statsEl.textContent = String(filtered.length);
      if (heroHitCountEl) {
        heroHitCountEl.textContent = filtered.length.toLocaleString();
      }
      if (heroMaxDiscountEl) {
        const maxDisc = filtered.length > 0
          ? filtered.reduce((acc, p) => Math.max(acc, Number(p.savingsPercentage) || 0), 0)
          : 0;
        heroMaxDiscountEl.innerHTML = `${maxDisc}<span class="showcase-telemetry-unit">% OFF</span>`;
      }
      syncHeroPresetsState();

      if (categoryResetBtn && categorySelect) {
        const hasCategory = categorySelect.value !== '';
        categoryResetBtn.disabled = !hasCategory;
        categoryResetBtn.hidden = !hasCategory;
      }

      gridEl.classList.remove('bargain-grid-fade');
      updateUrlParams();
    }, 200);
  }

  function updateActiveChips() {
    if (!activeChipsContainer || typeof renderActiveFilterChips !== 'function') return;

    const chips = [];
    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minPrice = valueToPrice(Number.parseInt(minPriceSlider.value, 10));
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const minDiscount = Number.parseInt(discountSlider.value, 10);
    const dealType = dealTypeSelect ? dealTypeSelect.value : '';
    const category = categorySelect ? categorySelect.value : '';
    const rawQ = keywordInput ? keywordInput.value.trim() : '';

    if (minScore > 0 && minScore !== 80) {
      chips.push({
        id: 'score',
        icon: '🏆',
        label: `スコア ${minScore}点以上`,
        onRemove: () => {
          scoreSlider.value = '80';
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
          minPriceSlider.value = '13';
          applyFilters();
        }
      });
    }

    if (maxPrice < 200000) {
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

    if (minDiscount > 0) {
      chips.push({
        id: 'discount',
        icon: '📉',
        label: `${minDiscount}%OFF以上`,
        onRemove: () => {
          discountSlider.value = '0';
          applyFilters();
        }
      });
    }

    if (dealType) {
      chips.push({
        id: 'dealType',
        icon: '🏷️',
        label: getDealTypeLabel(dealType),
        onRemove: () => {
          dealTypeSelect.value = '';
          applyFilters();
        }
      });
    }

    if (inStockFilter?.checked) {
      chips.push({
        id: 'inStock',
        icon: 'inventory_2',
        label: '在庫ありのみ',
        onRemove: () => {
          inStockFilter.checked = false;
          applyFilters();
        }
      });
    }

    if (includeUninvestigatedFilter?.checked) {
      chips.push({
        id: 'includeUninvestigated',
        icon: 'manage_search',
        label: '未調査のセール品を含む',
        onRemove: () => {
          includeUninvestigatedFilter.checked = false;
          if (uninvestigatedStatusEl) uninvestigatedStatusEl.style.display = 'none';
          updateHeroTotalCount();
          updateDealTypeOptions(getActiveProducts());
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
    if (typeof renderNoResultsQuickActions === 'function') {
      renderNoResultsQuickActions(noResultsActionsEl, chips);
    }
  }

  // --- Reset ---
  function resetFilters() {
    scoreSlider.value = '80';
    minPriceSlider.value = '13';
    priceSlider.value = '1000'; // max
    discountSlider.value = '0';
    if (dealTypeSelect) dealTypeSelect.value = '';
    if (inStockFilter) inStockFilter.checked = false;
    if (includeUninvestigatedFilter) includeUninvestigatedFilter.checked = false;
    if (uninvestigatedStatusEl) uninvestigatedStatusEl.style.display = 'none';
    if (categorySelect) categorySelect.value = '';
    if (keywordInput) keywordInput.value = '';
    if (keywordClearBtn) keywordClearBtn.style.display = 'none';
    const badgeEl = document.getElementById('deals-keyword-count-badge');
    if (badgeEl) badgeEl.style.display = 'none';
    currentSort = 'date';
    updateSortButtons();
    updateHeroTotalCount();
    updateDealTypeOptions(getActiveProducts());
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
  discountSlider.addEventListener('input', () => {
    updateSliderDisplays();
    triggerFilterWithSkeleton();
  });
  setupSliderTouchPrevention(discountSlider);
  if (dealTypeSelect) dealTypeSelect.addEventListener('change', applyFilters);
  if (inStockFilter) inStockFilter.addEventListener('change', applyFilters);
  if (includeUninvestigatedFilter) {
    includeUninvestigatedFilter.addEventListener('change', async () => {
      if (includeUninvestigatedFilter.checked) {
        showSkeleton();
        await ensureUninvestigatedDealsLoaded();
      } else if (uninvestigatedStatusEl) {
        uninvestigatedStatusEl.style.display = 'none';
      }
      updateHeroTotalCount();
      updateDealTypeOptions(getActiveProducts());
      applyFilters();
    });
  }
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
          e.preventDefault();
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

  function syncHeroPresetsState() {
    if (!heroPresetsContainer) return;
    const minScore = Number.parseInt(scoreSlider.value, 10);
    const minDiscount = Number.parseInt(discountSlider.value, 10);
    const maxPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
    const inStock = Boolean(inStockFilter?.checked);
    const dealType = dealTypeSelect ? dealTypeSelect.value : '';

    const activeMap = {
      score80: minScore >= 80,
      discount30: minDiscount >= 30,
      under5000: maxPrice <= 5000,
      instock: inStock,
      featured: dealType === 'badge:厳選目玉商品',
      event: Boolean(activeMajorEvent) && dealType === `event:${activeMajorEvent}`,
    };

    for (const btn of heroPresetsContainer.querySelectorAll('.showcase-preset-btn')) {
      const key = btn.dataset.preset;
      const isActive = Boolean(activeMap[key]);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
      const iconEl = btn.querySelector('.showcase-preset-icon');
      if (iconEl) {
        iconEl.textContent = isActive ? 'check_circle' : 'chevron_right';
      }
    }
  }

  function handleHeroPresetClick(presetKey) {
    if (presetKey === 'score80') {
      const cur = Number.parseInt(scoreSlider.value, 10);
      scoreSlider.value = cur >= 80 ? '0' : '80';
    } else if (presetKey === 'discount30') {
      const cur = Number.parseInt(discountSlider.value, 10);
      discountSlider.value = cur >= 30 ? '0' : '30';
    } else if (presetKey === 'under5000') {
      const curPrice = valueToPrice(Number.parseInt(priceSlider.value, 10));
      priceSlider.value = curPrice <= 5000 ? '1000' : String(Math.round(priceToValue(5000)));
    } else if (presetKey === 'instock' && inStockFilter) {
      inStockFilter.checked = !inStockFilter.checked;
    } else if (presetKey === 'featured' && dealTypeSelect) {
      dealTypeSelect.value = dealTypeSelect.value === 'badge:厳選目玉商品' ? '' : 'badge:厳選目玉商品';
    } else if (presetKey === 'event' && dealTypeSelect && activeMajorEvent) {
      const targetVal = `event:${activeMajorEvent}`;
      dealTypeSelect.value = dealTypeSelect.value === targetVal ? '' : targetVal;
    }
    applyFilters();
  }

  if (heroPresetsContainer) {
    heroPresetsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.showcase-preset-btn');
      if (!btn?.dataset.preset) return;
      handleHeroPresetClick(btn.dataset.preset);
    });
  }

  // --- Init ---
  readUrlParams();
  if (includeUninvestigatedFilter?.checked) {
    await ensureUninvestigatedDealsLoaded();
    updateHeroTotalCount();
  }
  updateDealTypeOptions(getActiveProducts());
  updateSortButtons();
  syncHeroPresetsState();
  applyFilters();
});
