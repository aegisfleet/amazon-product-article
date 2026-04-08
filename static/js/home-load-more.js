document.addEventListener('DOMContentLoaded', function () {
    const loadMoreButton = document.getElementById('load-more-button');

    const itemsPerBatch = 15;

    if (!loadMoreButton) return;

    // Check initial state
    const initialHiddenCards = document.querySelectorAll('.card-wrapper.card-hidden');
    if (initialHiddenCards.length === 0) {
        loadMoreButton.textContent = 'トップに戻る';
        loadMoreButton.classList.add('is-back-to-top');
    }

    loadMoreButton.addEventListener('click', function () {
        const hiddenCards = document.querySelectorAll('.card-wrapper.card-hidden');

        if (hiddenCards.length > 0) {
            // Show the next batch of cards
            for (let i = 0; i < itemsPerBatch && i < hiddenCards.length; i++) {
                hiddenCards[i].classList.remove('card-hidden');
            }

            // If no more hidden cards, change the button to "Back to top"
            if (document.querySelectorAll('.card-wrapper.card-hidden').length === 0) {
                loadMoreButton.textContent = 'トップに戻る';
                loadMoreButton.classList.add('is-back-to-top');
            }
        } else {
            // Scroll to the top of the page
            globalThis.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
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

function createPickupCardImage(safeImageSrc, shortTitle) {
    const container = document.createElement('div');
    container.className = 'pickup-card-image';

    if (safeImageSrc) {
        const img = document.createElement('img');
        img.src = safeImageSrc;
        img.alt = shortTitle;
        img.loading = 'lazy';
        img.decoding = 'async';
        container.appendChild(img);
    } else {
        const noImage = document.createElement('div');
        noImage.className = 'pickup-card-noimage';
        noImage.textContent = '画像なし';
        container.appendChild(noImage);
    }
    return container;
}

function createPickupCardSpecs(item) {
    const container = document.createElement('div');
    container.className = 'card-specs';

    if (!item.specs || typeof item.specs !== 'object') return container;
    const comparisonTags = normalizeComparisonTags(item.specs);
    comparisonTags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'card-spec-tag';
        span.textContent = tag;
        container.appendChild(span);
    });

    return container;
}

function normalizeComparisonTags(specs) {
    if (!specs || typeof specs !== 'object') return [];

    const tags = [];
    const allValues = Object.values(specs)
        .flatMap(value => Array.isArray(value) ? value : [value])
        .filter(value => value != null && typeof value !== 'object')
        .map(value => String(value).toLowerCase());
    const fullText = allValues.join(' ');

    const weightText = specs.weight ? String(specs.weight).toLowerCase() : '';
    const weightNumber = Number.parseFloat(weightText.replace(/[^\d.]/g, ''));
    if (weightText.includes('軽') || weightText.includes('light') || (Number.isFinite(weightNumber) && weightNumber > 0 && weightNumber <= 1000)) {
        tags.push('軽量');
    }

    if (['防水', 'ipx', 'ip6', 'ip5', 'waterproof'].some(keyword => fullText.includes(keyword))) {
        tags.push('防水');
    }

    const batteryText = specs.battery_capacity ? String(specs.battery_capacity).toLowerCase() : '';
    if (
        batteryText.includes('長') ||
        batteryText.includes('大') ||
        batteryText.includes('mah') ||
        ['長時間', 'ロング', '連続', '駆動'].some(keyword => fullText.includes(keyword))
    ) {
        tags.push('長時間バッテリー');
    }

    const displayText = specs.display_size ? String(specs.display_size).toLowerCase() : '';
    const displayNumber = Number.parseFloat(displayText.replace(/[^\d.]/g, ''));
    if (Number.isFinite(displayNumber) && displayNumber >= 6.5) {
        tags.push('大画面');
    }

    const storageText = specs.storage ? String(specs.storage).toLowerCase() : '';
    if (['1tb', '1000', '512', '256'].some(keyword => storageText.includes(keyword))) {
        tags.push('大容量ストレージ');
    }

    const cpuText = specs.processor || specs.cpu ? String(specs.processor || specs.cpu).toLowerCase() : '';
    if (['snapdragon 8', 'ryzen 7', 'ryzen 9', 'core i7', 'core i9', 'm1', 'm2', 'm3', 'm4'].some(keyword => cpuText.includes(keyword))) {
        tags.push('高性能CPU');
    }

    return [...new Set(tags)].slice(0, 3);
}

function createPickupCardMeta(score, scoreClass, price) {
    const container = document.createElement('div');
    container.className = 'pickup-card-meta';

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'pickup-card-score ' + scoreClass;
    scoreSpan.textContent = '🏆 ' + score + '点';
    container.appendChild(scoreSpan);

    if (price) {
        const priceSpan = document.createElement('span');
        priceSpan.className = 'pickup-card-price';
        priceSpan.textContent = price;
        container.appendChild(priceSpan);
    }

    return container;
}

function renderPickupItems(items, pickupGrid) {
    pickupGrid.textContent = '';

    items.forEach(function (item) {
        const safeHref = sanitizeUrl(item.url);
        if (!safeHref) return;

        const title = typeof item.title === 'string' ? item.title : '';
        const shortTitle = title.length > 24 ? `${title.slice(0, 24)}...` : title;
        const score = Number(item.score || 0);
        const scoreClass = getScoreClass(score);
        const price = typeof item.price === 'string' ? item.price : '';
        const image = typeof item.image === 'string' ? item.image.trim() : '';
        const safeImageSrc = image ? sanitizeUrl(image) : '';

        const cardLink = document.createElement('a');
        cardLink.href = safeHref;
        cardLink.className = 'pickup-card';
        cardLink.dataset.score = String(score);
        cardLink.dataset.price = price;
        cardLink.dataset.trackProduct = '1';
        cardLink.dataset.asin = typeof item.asin === 'string' ? item.asin : '';
        cardLink.dataset.category = typeof item.category === 'string' ? item.category : 'unknown';
        cardLink.dataset.priceBucket = typeof item.priceBucket === 'string' ? item.priceBucket : 'unknown';
        const comparisonTags = normalizeComparisonTags(item.specs);
        cardLink.dataset.hasComparisonTags = comparisonTags.length > 0 ? '1' : '0';

        const imageContainer = createPickupCardImage(safeImageSrc, shortTitle);
        const contentContainer = document.createElement('div');
        contentContainer.className = 'pickup-card-content';

        const titleElement = document.createElement('p');
        titleElement.className = 'pickup-card-title';
        titleElement.textContent = shortTitle;

        const specsContainer = createPickupCardSpecs(item);
        const metaContainer = createPickupCardMeta(score, scoreClass, price);

        contentContainer.appendChild(titleElement);
        contentContainer.appendChild(specsContainer);
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
document.addEventListener('DOMContentLoaded', async function () {
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

    // Load category mapping (category -> parent group)
    let categoryToGroup = {};
    try {
        const basePathMatch = /^(\/[^/]+\/)?/.exec(globalThis.location.pathname);
        const basePath = basePathMatch ? basePathMatch[0] : '/';
        const response = await fetch(`${basePath}data/categorygroups.json`);
        if (response.ok) {
            const data = await response.json();
            // Handle both Array format (new) and Object format (legacy)
            if (data?.categoryGroups && Array.isArray(data.categoryGroups)) {
                data.categoryGroups.forEach(group => {
                    if (group.children) {
                        group.children.forEach(cat => {
                            categoryToGroup[cat] = group.name;
                        });
                    }
                    categoryToGroup[group.name] = group.name;
                });
            } else if (data) {
                // Legacy format: Object where keys are group names
                Object.entries(data).forEach(([groupName, groupData]) => {
                    if (groupData.categories && Array.isArray(groupData.categories)) {
                        groupData.categories.forEach(cat => {
                            categoryToGroup[cat] = groupName;
                        });
                    }
                    categoryToGroup[groupName] = groupName;
                });
            }
            console.log('[Personalization] Loaded category mapping:', Object.keys(categoryToGroup).length, 'entries');
        }
    } catch (e) {
        console.warn('Failed to load category mapping for personalization:', e);
    }

    const hasPersonalization =
        typeof globalThis.ProductPersonalization === 'object' &&
        typeof globalThis.ProductPersonalization.rankItems === 'function' &&
        typeof globalThis.ProductPersonalization.getPreferences === 'function';

    const preferences = hasPersonalization ? globalThis.ProductPersonalization.getPreferences(30, categoryToGroup) : { events: [] };
    const initialItems = (preferences?.events?.length)
        ? globalThis.ProductPersonalization.rankItems(pickupItems, categoryToGroup).slice(0, 6)
        : shuffleWithSeed(pickupItems, Date.now()).slice(0, 6);

    renderPickupItems(initialItems, pickupGrid);
    pickupGrid.classList.remove('is-loading');

    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const resetBtn = target.closest('[data-reset-history="1"]');
        if (!resetBtn) return;

        const randomized = shuffleWithSeed(pickupItems, Date.now()).slice(0, 6);
        renderPickupItems(randomized, pickupGrid);
    });
});
