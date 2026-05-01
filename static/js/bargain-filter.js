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
  const priceSlider = document.getElementById('bargain-price-slider');
  const scoreValueEl = document.getElementById('bargain-score-value');
  const priceValueEl = document.getElementById('bargain-price-value');
  const categorySelect = document.getElementById('bargain-category-select');
  const sortButtons = document.getElementById('bargain-sort-buttons');
  const gridEl = document.getElementById('bargain-grid');
  const statsEl = document.getElementById('bargain-result-count');
  const noResultsEl = document.getElementById('bargain-no-results');
  const resetBtn = document.getElementById('bargain-reset-btn');

  if (!scoreSlider || !priceSlider || !gridEl) return;

  let currentSort = 'score';

  // --- URL Params ---
  function readUrlParams() {
    const params = new URLSearchParams(globalThis.location.search);
    if (params.has('minScore')) {
      const v = parseInt(params.get('minScore'), 10);
      if (!isNaN(v)) scoreSlider.value = String(Math.max(0, Math.min(100, v)));
    }
    if (params.has('maxPrice')) {
      const v = parseInt(params.get('maxPrice'), 10);
      if (!isNaN(v)) priceSlider.value = String(Math.max(0, Math.min(50000, v)));
    }
    if (params.has('category') && categorySelect) {
      categorySelect.value = params.get('category');
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
    const minScore = parseInt(scoreSlider.value, 10);
    const maxPrice = parseInt(priceSlider.value, 10);
    const category = categorySelect ? categorySelect.value : '';

    if (minScore !== 80) params.set('minScore', String(minScore));
    if (maxPrice !== 2000) params.set('maxPrice', String(maxPrice));
    if (category) params.set('category', category);
    if (currentSort !== 'score') params.set('sort', currentSort);

    const qs = params.toString();
    const newUrl = globalThis.location.pathname + (qs ? '?' + qs : '');
    globalThis.history.replaceState(null, '', newUrl);
  }

  // --- Populate categories ---
  function populateCategories() {
    if (!categorySelect) return;
    const cats = new Map();
    for (const p of allProducts) {
      if (p.category) {
        cats.set(p.category, (cats.get(p.category) || 0) + 1);
      }
    }
    const sorted = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = `${cat} (${count})`;
      categorySelect.appendChild(opt);
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

  function applyFilters() {
    const minScore = parseInt(scoreSlider.value, 10);
    const maxPrice = parseInt(priceSlider.value, 10);
    const category = categorySelect ? categorySelect.value : '';

    // Update display values
    scoreValueEl.textContent = String(minScore);
    priceValueEl.textContent = formatPrice(maxPrice);

    // Filter
    let filtered = allProducts.filter(p => {
      if (p.score < minScore) return false;
      if (maxPrice > 0 && p.priceRaw > maxPrice) return false;
      if (maxPrice === 0 && p.priceRaw > 0) return false;
      if (category && p.category !== category) return false;
      return true;
    });

    // Sort
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
    priceSlider.value = '2000';
    if (categorySelect) categorySelect.value = '';
    currentSort = 'score';
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
  populateCategories();
  readUrlParams();
  updateSortButtons();
  applyFilters();
});
