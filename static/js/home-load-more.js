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
        const parsed = new URL(str, window.location.origin);
        const protocol = parsed.protocol.toLowerCase();
        // Allow only http and https URLs
        if (protocol === 'http:' || protocol === 'https:') {
            return parsed.toString();
        }
    } catch (e) {
        // If URL construction fails, treat as invalid
        return null;
    }
    return null;
}

// High Score Pickup Shuffle Feature
document.addEventListener('DOMContentLoaded', function () {
    const shuffleBtn = document.getElementById('shuffle-pickup');
    const pickupGrid = document.getElementById('pickup-grid');
    const pickupDataElement = document.getElementById('pickup-data');

    if (!shuffleBtn || !pickupGrid || !pickupDataElement) return;

    let allPickupData;
    try {
        allPickupData = JSON.parse(pickupDataElement.textContent);
    } catch (e) {
        console.error('Failed to parse pickup data:', e);
        return;
    }

    if (!allPickupData || allPickupData.length === 0) return;

    shuffleBtn.addEventListener('click', function () {
        // Fisher-Yates shuffle
        const shuffled = [...allPickupData];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const selected = shuffled.slice(0, 5);

        // Regenerate HTML using safe DOM APIs
        // Clear existing content
        pickupGrid.innerHTML = '';

        selected.forEach(item => {
            // Create anchor card
            const cardLink = document.createElement('a');
            const safeUrl = sanitizeUrl(item.url);
            cardLink.href = safeUrl || '#';
            cardLink.className = 'pickup-card';
            if (item.score !== undefined && item.score !== null) {
                cardLink.setAttribute('data-score', String(item.score));
            }
            if (item.price) {
                cardLink.setAttribute('data-price', String(item.price));
            }

            // Image container
            const imageContainer = document.createElement('div');
            imageContainer.className = 'pickup-card-image';
            if (item.image) {
                const img = document.createElement('img');
                img.src = item.image;
                img.alt = item.title != null ? String(item.title) : '';
                img.loading = 'lazy';
                imageContainer.appendChild(img);
            } else {
                const noImageDiv = document.createElement('div');
                noImageDiv.className = 'pickup-card-noimage';
                noImageDiv.textContent = '画像なし';
                imageContainer.appendChild(noImageDiv);
            }

            // Content container
            const contentContainer = document.createElement('div');
            contentContainer.className = 'pickup-card-content';

            const titleP = document.createElement('p');
            titleP.className = 'pickup-card-title';
            if (item.title != null) {
                titleP.textContent = String(item.title);
            }
            contentContainer.appendChild(titleP);

            const metaDiv = document.createElement('div');
            metaDiv.className = 'pickup-card-meta';

            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'pickup-card-score';
            if (item.score !== undefined && item.score !== null) {
                scoreSpan.textContent = `🏆 ${item.score}点`;
            }
            metaDiv.appendChild(scoreSpan);

            if (item.price) {
                const priceSpan = document.createElement('span');
                priceSpan.className = 'pickup-card-price';
                priceSpan.textContent = String(item.price);
                metaDiv.appendChild(priceSpan);
            }

            contentContainer.appendChild(metaDiv);

            // Assemble card
            cardLink.appendChild(imageContainer);
            cardLink.appendChild(contentContainer);

            pickupGrid.appendChild(cardLink);
        });

        // Animation for button
        shuffleBtn.classList.add('shuffle-animation');
        setTimeout(() => shuffleBtn.classList.remove('shuffle-animation'), 300);
    });
});
