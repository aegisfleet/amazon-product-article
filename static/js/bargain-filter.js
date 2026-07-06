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

// --- Price Slider Mapping Helpers ---
function getPriceBucket(priceRaw) {
  if (!priceRaw || priceRaw <= 0) return 'unknown';
  if (priceRaw < 3000) return 'under-3000';
  if (priceRaw < 7000) return '3000-6999';
  if (priceRaw < 15000) return '7000-14999';
  if (priceRaw < 30000) return '15000-29999';
  return '30000-plus';
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

function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(String(url), globalThis.location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.href;
    }
  } catch {
    // ignore invalid URL
  }
  return '#';
}

function safeImageUrl(url) {
  if (!url) return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  try {
    const u = new URL(String(url), globalThis.location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'data:') {
      return u.href;
    }
  } catch {
    // ignore invalid URL
  }
  return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
}


// --- Render ---
function renderImageLink(p) {
  const imageLink = document.createElement('a');
  imageLink.className = 'card-image-link';
  imageLink.href = safeUrl(p.url);
  imageLink.tabIndex = -1;
  imageLink.setAttribute('aria-hidden', 'true');

  const imageWrap = document.createElement('div');
  imageWrap.className = 'card-image';

  if (p.image) {
    const img = document.createElement('img');
    img.src = safeImageUrl(p.image);
    img.alt = String(p.title || '');
    img.loading = 'lazy';
    img.decoding = 'async';
    imageWrap.appendChild(img);
  } else {
    const noImage = document.createElement('div');
    noImage.className = 'card-image-noimage';
    noImage.textContent = '画像なし';
    imageWrap.appendChild(noImage);
  }

  imageLink.appendChild(imageWrap);
  return imageLink;
}

function renderCardHeader(p) {
  const header = document.createElement('div');
  header.className = 'card-header';

  if (p.category) {
    const category = document.createElement('span');
    category.className = 'card-tag bargain-card-category';
    category.textContent = String(p.category || '');
    header.appendChild(category);
  }
  if (p.subcategory) {
    const subcat = document.createElement('span');
    subcat.className = 'card-tag-sub';
    subcat.textContent = String(p.subcategory);
    header.appendChild(subcat);
  }

  const title = document.createElement('h3');
  title.className = 'card-title';
  const titleLink = document.createElement('a');
  titleLink.href = safeUrl(p.url);
  titleLink.textContent = String(p.title || '');
  title.appendChild(titleLink);
  header.appendChild(title);
  return header;
}

function renderCardMeta(p) {
  const metaExt = document.createElement('div');
  metaExt.className = 'card-meta-ext';

  const mainRow = document.createElement('div');
  mainRow.className = 'meta-main-row';

  if (p.price) {
    const price = document.createElement('span');
    price.className = 'card-price';
    price.innerHTML = `<span aria-hidden="true">💰</span> ${p.price}`;
    mainRow.appendChild(price);
  }

  if (p.loyaltyPoints) {
    const points = document.createElement('span');
    points.className = 'card-points';
    points.innerHTML = `<span aria-hidden="true">🎁</span> ${p.loyaltyPoints}pt`;
    mainRow.appendChild(points);
  }

  if (p.score) {
    const score = document.createElement('span');
    score.className = `card-score ${scoreClass(p.score)}`;
    score.innerHTML = `<span aria-hidden="true">🏆</span> ${p.score}点`;
    mainRow.appendChild(score);
  }
  metaExt.appendChild(mainRow);

  const detailsRow = document.createElement('div');
  detailsRow.className = 'meta-details-row';

  if (p.isAmazonDirect) {
    const direct = document.createElement('span');
    direct.className = 'badge-amazon-direct';
    direct.textContent = 'Amazon直販';
    detailsRow.appendChild(direct);
  }

  if (p.dealBadge) {
    const deal = document.createElement('span');
    const isPrime = p.dealAccessType === 'PRIME_EXCLUSIVE' || p.dealAccessType === 'PRIME_EARLY_ACCESS';
    deal.className = `badge-deal ${isPrime ? 'deal-prime' : 'deal-standard'}`;
    deal.textContent = p.dealBadge;
    detailsRow.appendChild(deal);
  }

  if (p.savingsPercentage) {
    const savings = document.createElement('span');
    savings.className = 'badge-savings';
    savings.textContent = `${p.savingsPercentage}% OFF`;
    detailsRow.appendChild(savings);
  }

  if (p.availability) {
    const avail = document.createElement('span');
    avail.className = 'badge-availability';
    avail.textContent = p.availability;
    detailsRow.appendChild(avail);
  }

  if (detailsRow.children.length > 0) {
    metaExt.appendChild(detailsRow);
  }

  return metaExt;
}

function formatInvestigatedDate(lastInvestigated) {
  if (!lastInvestigated) return '';
  try {
    const d = new Date(lastInvestigated);
    if (!Number.isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}年${month}月${day}日`;
    }
  } catch {
    // ignore
  }
  return lastInvestigated;
}

function renderCardActions(p) {
  const actions = document.createElement('div');
  actions.className = 'card-footer-actions';

  const actionBtn = document.createElement('a');
  if (p.affiliateUrl) {
    actionBtn.href = safeUrl(p.affiliateUrl);
    actionBtn.className = 'btn-amazon-small';
    actionBtn.target = '_blank';
    actionBtn.rel = 'noopener noreferrer';
    actionBtn.innerHTML = '<span aria-hidden="true">🛒</span> Amazonで見る';
    actionBtn.dataset.trackProduct = '1';
    actionBtn.dataset.asin = p.asin || '';
    actionBtn.dataset.category = p.category || '';
    actionBtn.dataset.priceBucket = getPriceBucket(p.priceRaw);
    actionBtn.dataset.price = p.price || '';
    actionBtn.dataset.score = String(p.score || 0);
  } else {
    actionBtn.href = safeUrl(p.url);
    actionBtn.className = 'read-more';
    actionBtn.textContent = 'レビューを読む →';
  }
  actions.appendChild(actionBtn);

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'btn-favorite-card';
  favBtn.dataset.favoriteBtn = '1';
  favBtn.dataset.asin = p.asin || '';
  favBtn.dataset.title = p.title || '';
  favBtn.dataset.url = p.url || '';
  favBtn.dataset.affiliateUrl = p.affiliateUrl || '';
  favBtn.dataset.image = p.image || '';
  favBtn.dataset.price = p.price || '';
  favBtn.dataset.score = String(p.score || 0);
  favBtn.dataset.category = p.category || '';
  favBtn.setAttribute('aria-pressed', 'false');
  favBtn.setAttribute('aria-label', 'お気に入りに追加');

  const favIcon = document.createElement('span');
  favIcon.className = 'fav-icon';
  favIcon.setAttribute('aria-hidden', 'true');
  const isFav = globalThis.Favorites && typeof globalThis.Favorites.isFavorite === 'function' && globalThis.Favorites.isFavorite(p.asin);
  if (isFav) {
    favBtn.classList.add('is-favorited');
    favBtn.setAttribute('aria-pressed', 'true');
    favBtn.setAttribute('aria-label', 'お気に入りから削除');
    favIcon.textContent = '❤️';
  } else {
    favIcon.textContent = '🤍';
  }
  favBtn.appendChild(favIcon);
  actions.appendChild(favBtn);

  return actions;
}

function renderCardFooter(p) {
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'article-meta';
  dateSpan.textContent = formatInvestigatedDate(p.lastInvestigated);
  footer.appendChild(dateSpan);

  const actions = renderCardActions(p);
  footer.appendChild(actions);

  return footer;
}

function renderCard(p) {
  const article = document.createElement('article');
  article.className = 'card';

  const imageLink = renderImageLink(p);
  article.appendChild(imageLink);

  const body = document.createElement('div');
  body.className = 'card-content';

  const header = renderCardHeader(p);
  body.appendChild(header);

  if (p.description) {
    const excerpt = document.createElement('p');
    excerpt.className = 'card-excerpt';
    excerpt.textContent = String(p.description);
    body.appendChild(excerpt);
  }

  if (p.specsHtml) {
    const specsWrap = document.createElement('div');
    specsWrap.className = 'card-specs';
    specsWrap.innerHTML = p.specsHtml;
    body.appendChild(specsWrap);
  }

  const metaExt = renderCardMeta(p);
  body.appendChild(metaExt);

  const footer = renderCardFooter(p);
  body.appendChild(footer);

  article.appendChild(body);
  return article;
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
  const categoryResetBtn = document.getElementById('bargain-category-reset-btn');

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
