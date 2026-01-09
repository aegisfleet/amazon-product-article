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

        // Regenerate HTML
        pickupGrid.innerHTML = selected.map(item => `
            <a href="${item.url}" class="pickup-card" data-score="${item.score}" data-price="${item.price}">
                <div class="pickup-card-image">
                    ${item.image 
                        ? `<img src="${item.image}" alt="${item.title}" loading="lazy">`
                        : `<div class="pickup-card-noimage">画像なし</div>`
                    }
                </div>
                <div class="pickup-card-content">
                    <p class="pickup-card-title">${item.title}</p>
                    <div class="pickup-card-meta">
                        <span class="pickup-card-score">🏆 ${item.score}点</span>
                        ${item.price ? `<span class="pickup-card-price">${item.price}</span>` : ''}
                    </div>
                </div>
            </a>
        `).join('');

        // Animation for button
        shuffleBtn.classList.add('shuffle-animation');
        setTimeout(() => shuffleBtn.classList.remove('shuffle-animation'), 300);
    });
});
