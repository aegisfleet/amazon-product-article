document.addEventListener('DOMContentLoaded', function () {
    const loadMoreButton = document.getElementById('load-more-button');
    const loadMoreContainer = document.getElementById('load-more-container');
    const itemsPerBatch = 15;

    if (!loadMoreButton) return;

    loadMoreButton.addEventListener('click', function () {
        const hiddenCards = document.querySelectorAll('.card-wrapper.card-hidden');

        // Show the next batch of cards
        for (let i = 0; i < itemsPerBatch && i < hiddenCards.length; i++) {
            hiddenCards[i].classList.remove('card-hidden');
        }

        // If no more hidden cards, hide the button
        if (document.querySelectorAll('.card-wrapper.card-hidden').length === 0) {
            loadMoreContainer.style.display = 'none';
        }
    });
});

// Helper to sanitize URLs for use in href attributes
function sanitizeUrl(url) {
    if (url == null) return null;
    const str = String(url).trim();
    if (!str) return null;
    try {
        const parsed = new URL(str, globalThis.location.origin);
        const protocol = parsed.protocol.toLowerCase();
        // Allow only http and https URLs
        if (protocol === 'http:' || protocol === 'https:') {
            return parsed.toString();
        }
    } catch (e) {
        // If URL construction fails, treat as invalid
        console.warn('URL sanitization failed:', e);
        return null;
    }
    return null;
}

function getScoreClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    return 'score-fair';
}

function renderPickupItems(items, pickupGrid) {
    // Clear existing content
    pickupGrid.textContent = '';

    items.forEach(function (item) {
        const safeHref = sanitizeUrl(item.url);
        if (!safeHref) return;

        const title = typeof item.title === 'string' ? item.title : '';
        const shortTitle = title.length > 30 ? `${title.slice(0, 30)}...` : title;
        const score = Number(item.score || 0);
        const scoreClass = getScoreClass(score);
        const price = typeof item.price === 'string' ? item.price : '';
        const image = typeof item.image === 'string' ? item.image.trim() : '';
        const safeImageSrc = image ? sanitizeUrl(image) : '';
        const asin = typeof item.asin === 'string' ? item.asin : '';
        const category = typeof item.category === 'string' ? item.category : 'unknown';
        const priceBucket = typeof item.priceBucket === 'string' ? item.priceBucket : 'unknown';

        // Root card link
        const cardLink = document.createElement('a');
        cardLink.href = safeHref;
        cardLink.className = 'pickup-card';
        cardLink.dataset.score = String(score);
        cardLink.dataset.price = price;
        cardLink.dataset.trackProduct = '1';
        cardLink.dataset.asin = asin;
        cardLink.dataset.category = category;
        cardLink.dataset.priceBucket = priceBucket;

        // Image container
        const imageContainer = document.createElement('div');
        imageContainer.className = 'pickup-card-image';

        if (safeImageSrc) {
            const img = document.createElement('img');
            img.src = safeImageSrc;
            img.alt = shortTitle;
            img.loading = 'lazy';
            img.decoding = 'async';
            imageContainer.appendChild(img);
        } else {
            const noImage = document.createElement('div');
            noImage.className = 'pickup-card-noimage';
            noImage.textContent = '画像なし';
            imageContainer.appendChild(noImage);
        }

        // Content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'pickup-card-content';

        const titleElement = document.createElement('p');
        titleElement.className = 'pickup-card-title';
        titleElement.textContent = shortTitle;

        const metaContainer = document.createElement('div');
        metaContainer.className = 'pickup-card-meta';

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'pickup-card-score ' + scoreClass;
        scoreSpan.textContent = '🏆 ' + score + '点';

        metaContainer.appendChild(scoreSpan);

        if (price) {
            const priceSpan = document.createElement('span');
            priceSpan.className = 'pickup-card-price';
            priceSpan.textContent = price;
            metaContainer.appendChild(priceSpan);
        }

        contentContainer.appendChild(titleElement);
        contentContainer.appendChild(metaContainer);

        cardLink.appendChild(imageContainer);
        cardLink.appendChild(contentContainer);

        pickupGrid.appendChild(cardLink);
    });
}

function createSeededRandom(seed) {
    let state = seed >>> 0;
    return function () {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function shuffleWithSeed(items, seed) {
    const random = createSeededRandom(seed);
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// High Score Pickup Personalization/Shuffle Feature
document.addEventListener('DOMContentLoaded', function () {
    const pickupGrid = document.getElementById('pickup-grid');
    const pickupDataElement = document.getElementById('pickup-data');

    if (!pickupGrid || !pickupDataElement) return;

    let pickupItems = [];
    try {
        const parsed = JSON.parse(pickupDataElement.textContent || '[]');
        if (Array.isArray(parsed)) {
            pickupItems = parsed;
        }
    } catch {
        pickupItems = [];
    }

    if (!pickupItems.length) return;

    const hasPersonalization =
        typeof globalThis.ProductPersonalization === 'object' &&
        typeof globalThis.ProductPersonalization.rankItems === 'function' &&
        typeof globalThis.ProductPersonalization.getPreferences === 'function';

    const preferences = hasPersonalization ? globalThis.ProductPersonalization.getPreferences() : { events: [] };
    const initialItems = preferences?.events?.length
        ? globalThis.ProductPersonalization.rankItems(pickupItems).slice(0, 6)
        : shuffleWithSeed(pickupItems, Date.now()).slice(0, 6);

    renderPickupItems(initialItems, pickupGrid);

    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const resetBtn = target.closest('[data-reset-history="1"]');
        if (!resetBtn) return;

        const randomized = shuffleWithSeed(pickupItems, Date.now()).slice(0, 6);
        renderPickupItems(randomized, pickupGrid);
    });
});
