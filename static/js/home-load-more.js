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
