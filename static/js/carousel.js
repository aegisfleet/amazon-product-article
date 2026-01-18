/**
 * Product Image Carousel Controller
 * Handles swipe/scroll synchronization, navigation buttons/dots, and image modal (lightbox)
 */
document.addEventListener('DOMContentLoaded', () => {
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

    let currentImages = [];
    let currentIndex = 0;

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

    function updateModalImage() {
        if (currentImages.length === 0) return;
        modalImg.src = currentImages[currentIndex].src;
        modalImg.alt = currentImages[currentIndex].alt || '';

        // Update counter
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
        if (e.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeModal();
        } else if (e.key === 'ArrowLeft') {
            showPrev();
        } else if (e.key === 'ArrowRight') {
            showNext();
        }
    });

    // Touch swipe support for modal
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    modal.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const swipeDistance = touchEndX - touchStartX;

        if (Math.abs(swipeDistance) > minSwipeDistance) {
            if (swipeDistance > 0) {
                showPrev(); // Swipe right -> previous image
            } else {
                showNext(); // Swipe left -> next image
            }
        }
    }, { passive: true });

    // Initialize carousels
    const carousels = document.querySelectorAll('.product-image-carousel');

    carousels.forEach(carousel => {
        const track = carousel.querySelector('.carousel-track');
        const prevBtn = carousel.querySelector('.carousel-button.prev');
        const nextBtn = carousel.querySelector('.carousel-button.next');
        const dotsContainer = carousel.querySelector('.carousel-dots');

        if (!track) return;

        const images = track.querySelectorAll('.carousel-image');
        if (images.length <= 1) {
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (dotsContainer) dotsContainer.style.display = 'none';
        }

        // Add click handler for modal on each image
        images.forEach((img, i) => {
            img.addEventListener('click', () => {
                openModal(Array.from(images), i);
            });
        });

        if (images.length <= 1) return;

        // Create dots if container exists
        if (dotsContainer) {
            images.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.classList.add('dot');
                if (i === 0) dot.classList.add('active');
                dot.addEventListener('click', () => {
                    track.scrollTo({
                        left: track.offsetWidth * i,
                        behavior: 'smooth'
                    });
                });
                dotsContainer.appendChild(dot);
            });
        }

        const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];

        // Update active dot and button visibility on scroll
        let scrollTimeout;
        track.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const index = Math.round(track.scrollLeft / track.offsetWidth);

                // Update dots
                dots.forEach((dot, i) => {
                    dot.classList.toggle('active', i === index);
                });

                // Update button states (optional: hide prev if at start, hide next if at end)
                if (prevBtn) prevBtn.style.opacity = index === 0 ? '0' : '';
                if (nextBtn) nextBtn.style.opacity = index === images.length - 1 ? '0' : '';
            }, 50);
        });

        // Button clicks
        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                track.scrollBy({ left: -track.offsetWidth, behavior: 'smooth' });
            });
            // Remove inline onclick if it was added by Generator
            prevBtn.removeAttribute('onclick');
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                track.scrollBy({ left: track.offsetWidth, behavior: 'smooth' });
            });
            // Remove inline onclick
            nextBtn.removeAttribute('onclick');
        }

        // Initial button state
        if (prevBtn) prevBtn.style.opacity = '0';
    });
});

