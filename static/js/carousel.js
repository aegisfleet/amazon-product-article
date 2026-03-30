/**
 * Product Image Carousel Controller
 * Handles swipe/scroll synchronization, navigation buttons/dots, and image modal (lightbox)
 */
document.addEventListener('DOMContentLoaded', () => {
    // Modal state and elements
    let currentImages = [];
    let currentIndex = 0;

    // Create modal element once
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <button class="image-modal-close" aria-label="閉じる">✕</button>
        <button class="image-modal-nav prev" aria-label="前の画像">❮</button>
        <div class="image-modal-content">
            <img class="image-modal-img" src="" alt="">
        </div>
        <button class="image-modal-nav next" aria-label="次の画像">❯</button>
        <div class="image-modal-counter"></div>
    `;
    document.body.appendChild(modal);

    const modalImg = modal.querySelector('.image-modal-img');
    const modalClose = modal.querySelector('.image-modal-close');
    const modalPrev = modal.querySelector('.image-modal-nav.prev');
    const modalNext = modal.querySelector('.image-modal-nav.next');
    const modalCounter = modal.querySelector('.image-modal-counter');

    function updateModalImage() {
        if (currentImages.length === 0) return;
        modalImg.src = currentImages[currentIndex].src;
        modalImg.alt = currentImages[currentIndex].alt || '';

        // Update counter and nav visibility
        if (currentImages.length > 1) {
            modalCounter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
            modalCounter.style.display = 'block';
            modalPrev.style.display = 'flex';
            modalNext.style.display = 'flex';
        } else {
            modalCounter.style.display = 'none';
            modalPrev.style.display = 'none';
            modalNext.style.display = 'none';
        }
    }

    function openModal(images, index) {
        currentImages = images;
        currentIndex = index;
        updateModalImage();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function showPrev() {
        if (currentImages.length <= 1) return;
        currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
        updateModalImage();
    }

    function showNext() {
        if (currentImages.length <= 1) return;
        currentIndex = (currentIndex + 1) % currentImages.length;
        updateModalImage();
    }

    // Modal event listeners
    modalClose.addEventListener('click', closeModal);
    modalPrev.addEventListener('click', showPrev);
    modalNext.addEventListener('click', showNext);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;
        if (e.key === 'Escape') closeModal();
        else if (e.key === 'ArrowLeft') showPrev();
        else if (e.key === 'ArrowRight') showNext();
    });

    // Touch swipe support for modal
    let touchStartX = 0;
    modal.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const swipeDistance = touchEndX - touchStartX;
        const minSwipeDistance = 50;

        if (Math.abs(swipeDistance) > minSwipeDistance) {
            if (swipeDistance > 0) showPrev();
            else showNext();
        }
    }, { passive: true });

    // Individual Carousel Initialization (Level 2)
    function initCarousel(carousel) {
        const track = carousel.querySelector('.carousel-track');
        if (!track) return;

        const prevBtn = carousel.querySelector('.carousel-button.prev');
        const nextBtn = carousel.querySelector('.carousel-button.next');
        const dotsContainer = carousel.querySelector('.carousel-dots');
        const images = track.querySelectorAll('.carousel-image');

        // Hide controls if only one image
        if (images.length <= 1) {
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (dotsContainer) dotsContainer.style.display = 'none';
        }

        // Image click for modal
        images.forEach((img, i) => {
            img.addEventListener('click', () => openModal(Array.from(images), i));
        });

        if (images.length <= 1) return;

        // Create dots
        if (dotsContainer) {
            images.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.classList.add('dot');
                if (i === 0) dot.classList.add('active');
                dot.addEventListener('click', () => {
                    track.scrollTo({ left: track.offsetWidth * i, behavior: 'smooth' });
                });
                dotsContainer.appendChild(dot);
            });
        }

        const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];
        let scrollTimeout;

        // UI Update Function (Level 3 inside initCarousel)
        const updateCarouselUI = () => {
            const index = Math.round(track.scrollLeft / track.offsetWidth);
            // Update dots (Level 4)
            dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
            // Update buttons
            if (prevBtn) prevBtn.style.opacity = index === 0 ? '0' : '';
            if (nextBtn) nextBtn.style.opacity = index === images.length - 1 ? '0' : '';
        };

        track.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(updateCarouselUI, 50);
        });

        // Button clicks
        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                track.scrollBy({ left: -track.offsetWidth, behavior: 'smooth' });
            });
            prevBtn.removeAttribute('onclick');
            prevBtn.style.opacity = '0'; // Initial state
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                track.scrollBy({ left: track.offsetWidth, behavior: 'smooth' });
            });
            nextBtn.removeAttribute('onclick');
        }
    }

    // Initialize all carousels
    document.querySelectorAll('.product-image-carousel').forEach(initCarousel);
});
