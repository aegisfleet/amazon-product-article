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

// High Score Pickup Shuffle Feature
document.addEventListener('DOMContentLoaded', function () {
    const shuffleBtn = document.getElementById('shuffle-pickup');
    const pickupGrid = document.getElementById('pickup-grid');
    const pickupDataElement = document.getElementById('pickup-data');

    if (!shuffleBtn || !pickupGrid || !pickupDataElement) return;

    shuffleBtn.addEventListener('click', function () {
        if (typeof globalThis.shuffleAndRenderPickup === 'function') {
            globalThis.shuffleAndRenderPickup();
        }

        // Animation for button
        shuffleBtn.classList.add('shuffle-animation');
        setTimeout(() => shuffleBtn.classList.remove('shuffle-animation'), 300);
    });
});
