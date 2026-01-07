/**
 * Product Image Carousel Controller
 * Handles swipe/scroll synchronization and navigation buttons/dots
 */
document.addEventListener('DOMContentLoaded', () => {
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
            return;
        }

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
