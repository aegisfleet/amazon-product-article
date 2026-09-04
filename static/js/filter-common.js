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
    return 2000 + Math.round(t * 8) * 1000;
  } else {
    const t = (v - 700) / 300;
    return 10000 + Math.round(t * 8) * 5000;
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
  if (score >= 70) return 'score-good';
  if (score >= 50) return 'score-fair';
  return 'score-caution';
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

  if (p.category || p.subcategory) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'card-tags-row';

    if (p.category) {
      const category = document.createElement('span');
      category.className = 'card-tag bargain-card-category';
      category.textContent = String(p.category || '');
      tagsRow.appendChild(category);
    }
    if (p.subcategory) {
      const subcat = document.createElement('span');
      subcat.className = 'card-tag-sub';
      subcat.textContent = String(p.subcategory);
      tagsRow.appendChild(subcat);
    }
    header.appendChild(tagsRow);
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

  const priceBlock = document.createElement('div');
  priceBlock.className = 'meta-price-block';

  if (p.price) {
    const price = document.createElement('span');
    price.className = 'card-price';
    price.innerHTML = `<span class="material-symbols-outlined icon-price" aria-hidden="true">payments</span> ${p.price}`;
    priceBlock.appendChild(price);
  }

  if (p.loyaltyPoints) {
    const points = document.createElement('span');
    points.className = 'card-points m3-badge m3-badge-points';
    points.innerHTML = `<span class="material-symbols-outlined icon-points" aria-hidden="true">card_giftcard</span> ${p.loyaltyPoints}pt`;
    priceBlock.appendChild(points);
  }

  if (priceBlock.children.length > 0) {
    mainRow.appendChild(priceBlock);
  }

  if (p.score) {
    const scoreBlock = document.createElement('div');
    scoreBlock.className = 'meta-score-block';
    const score = document.createElement('span');
    score.className = `card-score m3-badge m3-badge-score ${scoreClass(p.score)}`;
    score.innerHTML = `<span class="material-symbols-outlined icon-score" aria-hidden="true">trophy</span> ${p.score}点`;
    scoreBlock.appendChild(score);
    mainRow.appendChild(scoreBlock);
  }

  metaExt.appendChild(mainRow);

  const detailsRow = document.createElement('div');
  detailsRow.className = 'meta-details-row';

  if (p.isAmazonDirect) {
    const direct = document.createElement('span');
    direct.className = 'badge-amazon-direct m3-badge m3-badge-primary';
    direct.textContent = 'Amazon直販';
    detailsRow.appendChild(direct);
  }

  if (p.isAmazonHaul) {
    const haul = document.createElement('span');
    haul.className = 'badge-amazon-haul m3-badge m3-badge-secondary';
    haul.textContent = 'Amazon Haul';
    detailsRow.appendChild(haul);
  }

  if (p.isFurusato) {
    const furusato = document.createElement('span');
    furusato.className = 'badge-furusato m3-badge m3-badge-furusato';
    furusato.textContent = 'ふるさと納税';
    detailsRow.appendChild(furusato);
  }

  if (p.dealBadge) {
    const deal = document.createElement('span');
    const isPrime = p.dealAccessType === 'PRIME_EXCLUSIVE' || p.dealAccessType === 'PRIME_EARLY_ACCESS';
    deal.className = `badge-deal m3-badge m3-badge-deal ${isPrime ? 'deal-prime' : 'deal-standard'}`;
    deal.textContent = p.dealBadge;
    detailsRow.appendChild(deal);
  }

  if (p.savingsPercentage) {
    const savings = document.createElement('span');
    savings.className = 'badge-savings m3-badge m3-badge-sale';
    savings.textContent = `${p.savingsPercentage}% OFF`;
    detailsRow.appendChild(savings);
  }

  if (p.pointsRate && p.pointsRate >= 10.0) {
    const pointsRateBadge = document.createElement('span');
    pointsRateBadge.className = 'badge-points-rate m3-badge m3-badge-points';
    pointsRateBadge.textContent = `ポイント還元率${Math.round(p.pointsRate)}%`;
    detailsRow.appendChild(pointsRateBadge);
  }

  if (p.availability) {
    const avail = document.createElement('span');
    avail.className = 'badge-availability m3-badge m3-badge-tertiary';
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

// --- Card Sub Row (Compare & Favorite Buttons) ---
function renderCardSubRow(p) {
  const row = document.createElement('div');
  row.className = 'card-footer-row card-footer-row-sub';

  const titlePrefix = p.title ? `${p.title}を` : '';

  // 1. Compare Button
  const compareBtn = document.createElement('button');
  compareBtn.type = 'button';
  compareBtn.className = 'btn-compare-card';
  compareBtn.dataset.compareBtn = '1';
  compareBtn.dataset.asin = p.asin || '';
  compareBtn.dataset.title = p.title || '';
  compareBtn.dataset.url = p.url || '';
  compareBtn.dataset.affiliateUrl = p.affiliateUrl || '';
  compareBtn.dataset.image = p.image || '';
  compareBtn.dataset.price = p.price || '';
  compareBtn.dataset.score = String(p.score || 0);
  compareBtn.dataset.savings = String(p.savingsPercentage || 0);
  compareBtn.dataset.category = p.category || '';
  let specsValue = '';
  if (p.specsJson) {
    specsValue = p.specsJson;
  } else if (typeof p.specs === 'string') {
    specsValue = p.specs;
  } else if (p.specs) {
    specsValue = JSON.stringify(p.specs);
  }
  compareBtn.dataset.specs = specsValue;
  compareBtn.setAttribute('aria-pressed', 'false');

  const isCompared = globalThis.Compare && typeof globalThis.Compare.isCompared === 'function' && globalThis.Compare.isCompared(p.asin);
  if (isCompared) {
    compareBtn.classList.add('is-compared');
    compareBtn.setAttribute('aria-pressed', 'true');
    compareBtn.setAttribute('aria-label', `${titlePrefix}比較から削除`);
  } else {
    compareBtn.setAttribute('aria-label', `${titlePrefix}比較に追加`);
  }

  const compareIcon = document.createElement('span');
  compareIcon.className = 'material-symbols-outlined compare-icon';
  compareIcon.setAttribute('aria-hidden', 'true');
  compareIcon.textContent = isCompared ? 'check_circle' : 'balance';

  const compareLabel = document.createElement('span');
  compareLabel.className = 'compare-label';
  compareLabel.textContent = isCompared ? '比較中' : '比較';

  compareBtn.appendChild(compareIcon);
  compareBtn.appendChild(compareLabel);
  row.appendChild(compareBtn);

  // 2. Favorite Button
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

  const isFav = globalThis.Favorites && typeof globalThis.Favorites.isFavorite === 'function' && globalThis.Favorites.isFavorite(p.asin);
  if (isFav) {
    favBtn.classList.add('is-favorited');
    favBtn.setAttribute('aria-pressed', 'true');
    favBtn.setAttribute('aria-label', `${titlePrefix}お気に入りから削除`);
  } else {
    favBtn.setAttribute('aria-label', `${titlePrefix}お気に入りに追加`);
  }

  const favIcon = document.createElement('span');
  favIcon.className = 'material-symbols-outlined fav-icon';
  favIcon.setAttribute('aria-hidden', 'true');
  favIcon.textContent = isFav ? 'favorite' : 'favorite_border';

  const favLabel = document.createElement('span');
  favLabel.className = 'fav-label';
  favLabel.textContent = isFav ? '保存済み' : '保存';

  favBtn.appendChild(favIcon);
  favBtn.appendChild(favLabel);
  row.appendChild(favBtn);

  return row;
}

// --- Card Main Row (Meta date & Amazon/Read More Button) ---
function renderCardMainRow(p) {
  const row = document.createElement('div');
  row.className = 'card-footer-row card-footer-row-main';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'article-meta';

  const dateIcon = document.createElement('span');
  dateIcon.className = 'material-symbols-outlined icon-date';
  dateIcon.setAttribute('aria-hidden', 'true');
  dateIcon.textContent = 'calendar_today';

  dateSpan.appendChild(dateIcon);
  dateSpan.appendChild(document.createTextNode(` ${formatInvestigatedDate(p.lastInvestigated)}`));
  row.appendChild(dateSpan);

  if (p.affiliateUrl) {
    const actionBtn = document.createElement('a');
    actionBtn.href = safeUrl(p.affiliateUrl);
    actionBtn.className = 'btn-amazon-small';
    actionBtn.target = '_blank';
    actionBtn.rel = 'noopener noreferrer';
    actionBtn.dataset.trackProduct = '1';
    actionBtn.dataset.asin = p.asin || '';
    actionBtn.dataset.category = p.category || '';
    actionBtn.dataset.priceBucket = getPriceBucket(p.priceRaw);
    actionBtn.dataset.price = p.price || '';
    actionBtn.dataset.score = String(p.score || 0);
    actionBtn.setAttribute('aria-label', `${p.title || ''}をAmazonで見る`);

    const cartIcon = document.createElement('span');
    cartIcon.className = 'material-symbols-outlined icon-cart';
    cartIcon.setAttribute('aria-hidden', 'true');
    cartIcon.textContent = 'shopping_cart';

    actionBtn.appendChild(cartIcon);
    actionBtn.appendChild(document.createTextNode(' Amazonで見る'));
    row.appendChild(actionBtn);
  } else {
    const readMoreLink = document.createElement('a');
    readMoreLink.href = safeUrl(p.url);
    readMoreLink.className = 'read-more';
    readMoreLink.textContent = 'レビューを読む →';
    row.appendChild(readMoreLink);
  }

  return row;
}

// --- Card Shops Row (Rakuten & Yahoo! 2-column) ---
function renderCardShopRow(p) {
  const row = document.createElement('div');
  row.className = 'card-footer-row card-footer-row-shops';

  const moshimoRakutenAId = '5756223';
  const moshimoYahooAId = '5756224';

  const query = p.ean || (p.brand && p.model ? `${p.brand} ${p.model}` : (p.model || p.title || ''));
  const encodedQuery = encodeURIComponent(query);

  const rakutenTarget = `https://search.rakuten.co.jp/search/mall/${encodedQuery}/`;
  const rakutenUrl = `https://af.moshimo.com/af/c/click?a_id=${moshimoRakutenAId}&p_id=54&pc_id=54&pl_id=27059&url=${encodeURIComponent(rakutenTarget)}`;

  const yahooTarget = `https://shopping.yahoo.co.jp/search?first=1&p=${encodedQuery}`;
  const yahooUrl = `https://af.moshimo.com/af/c/click?a_id=${moshimoYahooAId}&p_id=1225&pc_id=1925&pl_id=27061&url=${encodeURIComponent(yahooTarget)}`;

  const rakutenBtn = document.createElement('a');
  rakutenBtn.href = safeUrl(rakutenUrl);
  rakutenBtn.className = 'btn-shop btn-shop-rakuten btn-shop--card';
  rakutenBtn.target = '_blank';
  rakutenBtn.rel = 'noopener noreferrer';
  rakutenBtn.dataset.trackProduct = '1';
  rakutenBtn.dataset.asin = p.asin || '';
  rakutenBtn.dataset.mall = 'rakuten';
  rakutenBtn.dataset.category = p.category || '';
  rakutenBtn.dataset.priceBucket = getPriceBucket(p.priceRaw);
  rakutenBtn.dataset.price = p.price || '';
  rakutenBtn.dataset.score = String(p.score || 0);
  rakutenBtn.setAttribute('aria-label', `${p.title || ''}を楽天市場で見る`);

  const rIconWrapper = document.createElement('span');
  rIconWrapper.className = 'btn-shop-icon-wrapper';
  const rBadge = document.createElement('span');
  rBadge.className = 'btn-shop-badge-icon';
  rBadge.textContent = 'R';
  rIconWrapper.appendChild(rBadge);

  const rLabel = document.createElement('span');
  rLabel.className = 'btn-shop-label';
  rLabel.textContent = '楽天市場';

  rakutenBtn.appendChild(rIconWrapper);
  rakutenBtn.appendChild(rLabel);
  row.appendChild(rakutenBtn);

  const yahooBtn = document.createElement('a');
  yahooBtn.href = safeUrl(yahooUrl);
  yahooBtn.className = 'btn-shop btn-shop-yahoo btn-shop--card';
  yahooBtn.target = '_blank';
  yahooBtn.rel = 'noopener noreferrer';
  yahooBtn.dataset.trackProduct = '1';
  yahooBtn.dataset.asin = p.asin || '';
  yahooBtn.dataset.mall = 'yahoo';
  yahooBtn.dataset.category = p.category || '';
  yahooBtn.dataset.priceBucket = getPriceBucket(p.priceRaw);
  yahooBtn.dataset.price = p.price || '';
  yahooBtn.dataset.score = String(p.score || 0);
  yahooBtn.setAttribute('aria-label', `${p.title || ''}をYahoo!ショッピングで見る`);

  const yIconWrapper = document.createElement('span');
  yIconWrapper.className = 'btn-shop-icon-wrapper';
  const yBadge = document.createElement('span');
  yBadge.className = 'btn-shop-badge-icon';
  yBadge.textContent = 'Y!';
  yIconWrapper.appendChild(yBadge);

  const yLabel = document.createElement('span');
  yLabel.className = 'btn-shop-label';
  yLabel.textContent = 'Yahoo!';

  yahooBtn.appendChild(yIconWrapper);
  yahooBtn.appendChild(yLabel);
  row.appendChild(yahooBtn);

  return row;
}

// --- Card Footer ---
function renderCardFooter(p) {
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const subRow = renderCardSubRow(p);
  footer.appendChild(subRow);

  const mainRow = renderCardMainRow(p);
  footer.appendChild(mainRow);

  const shopRow = renderCardShopRow(p);
  footer.appendChild(shopRow);

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

/**
 * モバイル端末でのスライダーの誤操作（スクロール時の意図しない値変化）を防止する
 * @param {HTMLInputElement} slider 
 */
function setupSliderTouchPrevention(slider) {
  if (!slider) return;

  let startX = 0;
  let startY = 0;
  let startVal = slider.value;
  let isScrolling = false;
  let isSliding = false;
  let isTouchActive = false;
  let hasDispatched = false;

  slider.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startVal = slider.value;
    isScrolling = false;
    isSliding = false;
    isTouchActive = true;
    hasDispatched = false;
  }, { passive: true });

  slider.addEventListener('touchmove', (e) => {
    if (!isTouchActive) return;

    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!isScrolling && !isSliding) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        isScrolling = true;
      } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        isSliding = true;
        if (!hasDispatched) {
          hasDispatched = true;
          const customEvent = new CustomEvent('input', {
            bubbles: true,
            cancelable: true,
            detail: { sentBySystem: true }
          });
          slider.dispatchEvent(customEvent);
        }
      }
    }

    if (isScrolling) {
      slider.value = startVal;
    }
  }, { passive: true });

  slider.addEventListener('touchend', () => {
    isTouchActive = false;
    if (isScrolling) {
      slider.value = startVal;
    } else if (!isSliding && !isScrolling) {
      hasDispatched = true;
      const customEvent = new CustomEvent('input', {
        bubbles: true,
        cancelable: true,
        detail: { sentBySystem: true }
      });
      slider.dispatchEvent(customEvent);
    }
  }, { passive: true });

  slider.addEventListener('input', (e) => {
    if (e.detail?.sentBySystem) {
      return;
    }

    if (isTouchActive) {
      if (isScrolling || !isSliding) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }
  }, true);
}

// --- Render Skeleton Card ---
function renderSkeletonCard() {
  const article = document.createElement('article');
  article.className = 'card skeleton-card';

  const img = document.createElement('div');
  img.className = 'skeleton-element skeleton-image';
  article.appendChild(img);

  const body = document.createElement('div');
  body.className = 'skeleton-content';

  const header = document.createElement('div');
  header.className = 'skeleton-header';
  const badge = document.createElement('div');
  badge.className = 'skeleton-element skeleton-badge';
  header.appendChild(badge);
  body.appendChild(header);

  const title1 = document.createElement('div');
  title1.className = 'skeleton-element skeleton-title';
  body.appendChild(title1);

  const title2 = document.createElement('div');
  title2.className = 'skeleton-element skeleton-title-short';
  body.appendChild(title2);

  const text = document.createElement('div');
  text.className = 'skeleton-element skeleton-text';
  body.appendChild(text);

  const meta = document.createElement('div');
  meta.className = 'skeleton-meta';
  const price = document.createElement('div');
  price.className = 'skeleton-element skeleton-price';
  meta.appendChild(price);
  body.appendChild(meta);

  const btn = document.createElement('div');
  btn.className = 'skeleton-element skeleton-button';
  body.appendChild(btn);

  article.appendChild(body);
  return article;
}

function renderSkeletonGrid(count = 6) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    fragment.appendChild(renderSkeletonCard());
  }
  return fragment;
}

/**
 * Material Design 3 アクティブフィルターチップ群を動的描画する共通関数
 * @param {HTMLElement} containerEl - チップを表示するコンテナ要素
 * @param {Array<{id: string, label: string, icon: string, onRemove: Function}>} chips - 適用中のフィルターチップ情報
 * @param {Function} [onClearAll] - すべての条件を解除するコールバック関数
 */
function renderActiveFilterChips(containerEl, chips, onClearAll) {
  if (!containerEl) return;

  if (!chips || chips.length === 0) {
    containerEl.innerHTML = '';
    containerEl.style.display = 'none';
    return;
  }

  containerEl.innerHTML = '';
  containerEl.style.display = 'flex';

  const labelEl = document.createElement('span');
  labelEl.className = 'm3-active-chips-label';
  labelEl.innerHTML = '<span class="material-symbols-outlined icon-chip-label" aria-hidden="true" style="font-size:1.1rem; vertical-align:middle;">tune</span> 適用中:';
  containerEl.appendChild(labelEl);

  const emojiToSymbol = {
    '🏆': 'trophy',
    '💰': 'payments',
    '📉': 'percent',
    '🏷️': 'sell',
    '📂': 'folder',
    '🔍': 'search',
    '⚙️': 'tune',
    '🏷': 'sell'
  };

  chips.forEach((chip) => {
    const chipEl = document.createElement('span');
    chipEl.className = 'm3-active-chip';

    if (chip.icon) {
      const iconEl = document.createElement('span');
      const symbolName = emojiToSymbol[chip.icon] || chip.icon;
      iconEl.className = 'material-symbols-outlined m3-active-chip-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = symbolName;
      chipEl.appendChild(iconEl);
    }

    const textEl = document.createElement('span');
    textEl.textContent = chip.label;
    chipEl.appendChild(textEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'm3-active-chip-close';
    closeBtn.title = `${chip.label}の条件を解除`;
    closeBtn.setAttribute('aria-label', `${chip.label}の条件を解除`);
    closeBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof chip.onRemove === 'function') {
        chip.onRemove();
      }
    });

    chipEl.appendChild(closeBtn);
    containerEl.appendChild(chipEl);
  });

  if (chips.length >= 2 && typeof onClearAll === 'function') {
    const clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = 'm3-active-chips-clear-all';
    clearAllBtn.innerHTML = 'すべて解除 <span class="material-symbols-outlined" aria-hidden="true" style="font-size:0.875rem; vertical-align:middle;">close</span>';
    clearAllBtn.title = 'すべてのフィルタ条件を解除';
    clearAllBtn.setAttribute('aria-label', 'すべてのフィルタ条件を解除');
    clearAllBtn.addEventListener('click', () => {
      onClearAll();
    });
    containerEl.appendChild(clearAllBtn);
  }
}

/**
 * 画面幅に応じて検索入力欄のプレースホルダーをレスポンシブに切り替える
 */
function setupResponsivePlaceholders() {
  if (typeof document === 'undefined') return;
  const inputs = document.querySelectorAll('input[data-placeholder-mobile]');
  if (!inputs || inputs.length === 0) return;

  const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
  function updatePlaceholders(e) {
    let isMobile = false;
    if (e && typeof e.matches === 'boolean') {
      isMobile = e.matches;
    } else if (mql) {
      isMobile = Boolean(mql.matches);
    }

    inputs.forEach((input) => {
      const fullText = input.dataset.placeholderFull || input.getAttribute('placeholder') || '';
      const mobileText = input.dataset.placeholderMobile || '';
      input.placeholder = isMobile ? mobileText : fullText;
    });
  }

  if (mql && typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', updatePlaceholders);
  }

  updatePlaceholders();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupResponsivePlaceholders);
  } else {
    setupResponsivePlaceholders();
  }
}
