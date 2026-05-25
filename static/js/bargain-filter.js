/**
 * bargain-filter.js
 * 「あともう一品」特設ページのフィルタリング・ソート・表示を管理する。
 */

// --- Price Slider Mapping Helpers ---
function valueToPrice(v) {
  if (v <= 400) {
    const t = v / 400;
    return Math.round(t * 20) * 100;
  } else if (v <= 700) {
    const t = (v - 400) / 300;
    return 2000 + Math.round(t * 16) * 500;
  } else {
    const t = (v - 700) / 300;
    return 10000 + Math.round(t * 40000);
  }
}

function priceToValue(price) {
  if (price <= 2000) {
    return (price / 2000) * 400;
  } else if (price <= 10000) {
    return 400 + ((price - 2000) / (10000 - 2000)) * 300;
  } else {
    const clampedPrice = Math.min(50000, price);
    return 700 + ((clampedPrice - 10000) / (50000 - 10000)) * 300;
  }
}

// --- Format price ---
function formatPrice(raw) {
  if (!raw && raw !== 0) return '';
  return '¥' + Number(raw).toLocaleString('ja-JP');
}

// --- Score class ---
function scoreClass(score) {
  if (score >= 80) return 'score-excellent';
  if (score >= 60) return 'score-good';
  return 'score-fair';
}

// --- Render ---
function renderCard(p) {
  const imgHtml = p.image
    ? `<img src="${p.image}" alt="${p.title}" loading="lazy" decoding="async">`
    : `<div class="bargain-card-noimage">画像なし</div>`;

  const amazonBadge = p.isAmazonDirect
    ? `<span class="badge-amazon-direct">Amazon直販</span>`
    : '';

  const pointsBadge = p.loyaltyPoints
    ? `<span class="bargain-card-points">🎁 ${p.loyaltyPoints}pt</span>`
    : '';

  const btnHtml = p.affiliateUrl
    ? `<a href="${p.affiliateUrl}" class="btn-amazon-small" target="_blank" rel="noopener noreferrer">🛒 Amazonで見る</a>`
    : `<a href="${p.url}" class="bargain-card-review-link">レビューを読む →</a>`;

  return `
    <article class="bargain-card">
      <a href="${p.url}" class="bargain-card-image-link">
        <div class="bargain-card-image">${imgHtml}</div>
      </a>
      <div class="bargain-card-body">
        <div class="bargain-card-category">${p.category || ''}</div>
        <h3 class="bargain-card-title">
          <a href="${p.url}">${p.title}</a>
        </h3>
        <div class="bargain-card-meta">
          <span class="bargain-card-price">${p.price || ''}</span>
          <span class="card-score ${scoreClass(p.score)}">🏆 ${p.score}点</span>
        </div>
        <div class="bargain-card-badges">
          ${amazonBadge}${pointsBadge}
        </div>
        <div class="bargain-card-actions">${btnHtml}</div>
      </div>
    </article>`;
}

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

  if (!scoreSlider || !priceSlider || !gridEl) return;

  let currentSort = 'date'; // Default to Newest

  // --- URL Params ---
  function readUrlParams() {
    const params = new URLSearchParams(globalThis.location.search);
    if (params.has('minScore')) {
      const v = Number.parseInt(params.get('minScore'), 10);
      if (!Number.isNaN(v)) scoreSlider.value = String(Math.max(0, Math.min(100, v)));
    }
    if (params.has('minPrice')) {
      const v = Number.parseInt(params.get('minPrice'), 10);
      if (!Number.isNaN(v)) minPriceSlider.value = String(Math.round(priceToValue(v)));
    }
    if (params.has('maxPrice')) {
      const v = Number.parseInt(params.get('maxPrice'), 10);
      if (!Number.isNaN(v)) priceSlider.value = String(Math.round(priceToValue(v)));
    }
    if (params.has('category') && categorySelect) {
      // We will set this after populating categories
      categorySelect.dataset.pendingValue = params.get('category');
    }
    if (params.has('sort')) {
      const s = params.get('sort');
      if (['score', 'price', 'date'].includes(s)) {
        currentSort = s;
      }
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

    // Step 1: Filter by Score and Price range
    let preFiltered = allProducts.filter(p => {
      if (p.score < minScore) return false;
      if (p.priceRaw < minPrice) return false;
      if (maxPrice > 0 && p.priceRaw > maxPrice) return false;
      if (maxPrice === 0 && p.priceRaw > 0) return false;
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
        gridEl.innerHTML = filtered.map(renderCard).join('');
      }
      statsEl.textContent = String(filtered.length);

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
  scoreSlider.addEventListener('input', applyFilters);
  minPriceSlider.addEventListener('input', applyFilters);
  priceSlider.addEventListener('input', applyFilters);
  if (categorySelect) categorySelect.addEventListener('change', applyFilters);
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);

  if (sortButtons) {
    sortButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.bargain-sort-btn');
      if (!btn) return;
      currentSort = btn.dataset.sort;
      updateSortButtons();
      applyFilters();
    });
  }

  // --- Init ---
  readUrlParams();
  updateSortButtons();
  applyFilters();
});
