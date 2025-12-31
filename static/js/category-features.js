document.addEventListener('DOMContentLoaded', function () {
    const sortSelect = document.getElementById('sort-select');
    const productGrid = document.getElementById('product-grid');

    if (!sortSelect || !productGrid) return;

    sortSelect.addEventListener('change', function () {
        const sortValue = this.value;
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
        // Clear grid first (optional, appending also moves them)
        productGrid.innerHTML = '';
        sortedCards.forEach(card => productGrid.appendChild(card));
        
        // Add subtle animation or scroll to top if needed
        console.log(`Sorted by: ${sortValue}`);
    });
});
