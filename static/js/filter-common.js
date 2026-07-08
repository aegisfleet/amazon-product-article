/**
 * filter-common.js
 * 特設ページのフィルタリング処理における共通ヘルパー関数およびDOM描画ロジック。
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

// --- Price Bucket Helper ---
function getPriceBucket(priceRaw) {
  if (!priceRaw || priceRaw <= 0) return 'unknown';
  if (priceRaw < 3000) return 'under-3000';
  if (priceRaw < 7000) return '3000-6999';
  if (priceRaw < 15000) return '7000-14999';
  if (priceRaw < 30000) return '15000-29999';
  return '30000-plus';
}

// --- Normalize text for fuzzy search ---
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCodePoint(s.codePointAt(0) - 0xFEE0))
    .replace(/[\u30a1-\u30f6]/g, (s) => String.fromCodePoint(s.codePointAt(0) - 0x60))
    .replaceAll('　', ' ')
    .trim();
}

function matchesKeywords(p, keywords) {
  if (keywords.length === 0) return true;
  const specsText = p.specsHtml ? p.specsHtml.replace(/<[^>]{1,1024}>/g, ' ') : '';
  const searchableText = normalizeText(
    [p.title, p.category, p.subcategory, p.brand, p.description, specsText].filter(Boolean).join(' ')
  );
  return keywords.every(keyword => searchableText.includes(keyword));
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

// --- Card Footer ---
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

// --- Render Card (Wrapper) ---
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

// --- URL Params Helper ---
function setSliderFromParam(params, key, slider, transformFn, minVal = null, maxVal = null) {
  if (!params.has(key)) return;
  const v = Number.parseInt(params.get(key), 10);
  if (Number.isNaN(v)) return;
  let val = transformFn ? transformFn(v) : v;
  if (minVal !== null) val = Math.max(minVal, val);
  if (maxVal !== null) val = Math.min(maxVal, val);
  slider.value = String(val);
}

// --- Debounce Helper ---
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * キーワード検索の共通イベントセットアップ
 * @param {HTMLInputElement} keywordInput
 * @param {HTMLElement} keywordClearBtn
 * @param {Function} onSearchInput
 * @param {Function} onSearchClear
 */
function initKeywordSearch(keywordInput, keywordClearBtn, onSearchInput, onSearchClear) {
  if (!keywordInput) return;

  keywordInput.addEventListener('input', (e) => {
    if (keywordClearBtn) {
      keywordClearBtn.style.display = keywordInput.value ? 'block' : 'none';
    }
    if (e.isComposing) return;
    onSearchInput();
  });

  keywordInput.addEventListener('compositionend', () => {
    if (keywordClearBtn) {
      keywordClearBtn.style.display = keywordInput.value ? 'block' : 'none';
    }
    onSearchInput();
  });

  if (keywordClearBtn) {
    keywordClearBtn.addEventListener('click', () => {
      keywordInput.value = '';
      keywordClearBtn.style.display = 'none';
      keywordInput.focus();
      onSearchClear();
    });
  }
}


