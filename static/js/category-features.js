document.addEventListener('DOMContentLoaded', function () {
    const sortSelect = document.getElementById('sort-select');
    const productGrid = document.getElementById('product-grid');

    if (!sortSelect || !productGrid) return;

    /**
     * Sort cards based on the given sort value
     * @param {string} sortValue - The sort criteria
     */
    function sortCards(sortValue) {
        const cards = Array.from(productGrid.querySelectorAll('.card'));

        const sortedCards = cards.sort((a, b) => {
            let valA, valB;

            switch (sortValue) {
                case 'price-asc':
                    valA = parseInt(a.dataset.price) || 0;
                    valB = parseInt(b.dataset.price) || 0;
                    return valA - valB;
                case 'price-desc':
                    valA = parseInt(a.dataset.price) || 0;
                    valB = parseInt(b.dataset.price) || 0;
                    return valB - valA;
                case 'score-desc':
                    valA = parseFloat(a.dataset.score) || 0;
                    valB = parseFloat(b.dataset.score) || 0;
                    return valB - valA;
                case 'date-desc':
                default:
                    valA = parseInt(a.dataset.date) || 0;
                    valB = parseInt(b.dataset.date) || 0;
                    return valB - valA;
            }
        });

        // Re-append sorted cards
        productGrid.innerHTML = '';
        sortedCards.forEach(card => productGrid.appendChild(card));
    }

    // Handle sort selection change
    sortSelect.addEventListener('change', function () {
        sortCards(this.value);
    });

    // Handle bfcache restoration: re-apply sort when page is restored from back/forward cache
    // The browser preserves form values but restores the original DOM order
    // Note: We check on every pageshow (not just persisted) because some browsers
    // may not set persisted=true even when restoring state
    window.addEventListener('pageshow', function (event) {
        const currentValue = sortSelect.value;
        if (currentValue && currentValue !== 'date-desc') {
            // Re-apply the sort to match the preserved select value
            sortCards(currentValue);
        }
    });
});
