/**
 * Product Image Carousel Controller
 * Handles swipe/scroll synchronization, navigation buttons/dots, and image modal (lightbox) with zoom/pan
 */
document.addEventListener('DOMContentLoaded', () => {
    // Modal state and elements
    let currentImages = [];
    let currentIndex = 0;

    // Zoom and pan state
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialPinchDistance = null;
    let initialScale = 1;
    let lastTapTime = 0;

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
        <div class="image-modal-zoom-controls">
            <button class="image-modal-zoom-btn zoom-in" title="拡大" aria-label="拡大">＋</button>
            <button class="image-modal-zoom-btn zoom-out" title="縮小" aria-label="縮小">－</button>
            <button class="image-modal-zoom-btn zoom-reset" title="リセット" aria-label="リセット">↺</button>
        </div>
        <div class="image-modal-counter"></div>
    `;
    document.body.appendChild(modal);

    const modalContent = modal.querySelector('.image-modal-content');
    const modalImg = modal.querySelector('.image-modal-img');
    const modalClose = modal.querySelector('.image-modal-close');
    const modalPrev = modal.querySelector('.image-modal-nav.prev');
    const modalNext = modal.querySelector('.image-modal-nav.next');
    const modalCounter = modal.querySelector('.image-modal-counter');
    const zoomInBtn = modal.querySelector('.image-modal-zoom-btn.zoom-in');
    const zoomOutBtn = modal.querySelector('.image-modal-zoom-btn.zoom-out');
    const zoomResetBtn = modal.querySelector('.image-modal-zoom-btn.zoom-reset');

    let mouseDownX = 0;
    let mouseDownY = 0;

    function applyTransform(transition = false) {
        if (scale <= 1) {
            scale = 1;
            translateX = 0;
            translateY = 0;
            modalImg.style.cursor = 'zoom-in';
        } else {
            modalImg.style.cursor = isDragging ? 'grabbing' : 'zoom-out';
        }

        if (transition) {
            modalImg.style.transition = 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)';
            setTimeout(() => {
                modalImg.style.transition = '';
            }, 200);
        } else {
            modalImg.style.transition = '';
        }

        modalImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    function resetZoom(transition = true) {
        scale = 1;
        translateX = 0;
        translateY = 0;
        applyTransform(transition);
    }

    function zoomTo(targetScale, centerX = null, centerY = null) {
        const oldScale = scale;
        const newScale = Math.min(Math.max(1, targetScale), 5);
        if (newScale === oldScale) return;

        if (newScale === 1) {
            resetZoom(true);
            return;
        }

        if (centerX !== null && centerY !== null) {
            const rect = modalImg.getBoundingClientRect();
            const offsetX = centerX - (rect.left + rect.width / 2);
            const offsetY = centerY - (rect.top + rect.height / 2);
            translateX -= (offsetX / oldScale) * (newScale - oldScale);
            translateY -= (offsetY / oldScale) * (newScale - oldScale);
        }

        scale = newScale;
        applyTransform(true);
    }

    function updateModalImage() {
        if (currentImages.length === 0) return;
        resetZoom(false);
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
        resetZoom(false);
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
        if (e.target === modal || e.target === modalContent) closeModal();
    });

    // Zoom Buttons
    zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomTo(scale + 0.5);
    });

    zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomTo(scale - 0.5);
    });

    zoomResetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetZoom(true);
    });

    // Mouse Wheel Zooming
    modalContent.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        zoomTo(scale + delta, e.clientX, e.clientY);
    }, { passive: false });

    // Single click / Double click to toggle zoom
    modalImg.addEventListener('click', (e) => {
        e.stopPropagation();
        const dragDist = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
        if (dragDist > 5) return;

        if (scale <= 1) {
            zoomTo(2.5, e.clientX, e.clientY);
        } else {
            resetZoom(true);
        }
    });

    // Mouse Dragging (Panning when zoomed)
    modalImg.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;

        if (scale > 1) {
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            modalImg.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || scale <= 1) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        applyTransform(false);
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            applyTransform(false);
        }
    });

    // Keyboard Navigation & Escape
    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;
        if (e.key === 'Escape') closeModal();
        else if (e.key === 'ArrowLeft' && scale === 1) showPrev();
        else if (e.key === 'ArrowRight' && scale === 1) showNext();
        else if (e.key === '+' || e.key === '=') zoomTo(scale + 0.5);
        else if (e.key === '-') zoomTo(scale - 0.5);
        else if (e.key === '0') resetZoom(true);
    });

    // Touch Interaction (Pinch Zoom, Pan, Double-tap & Swipe)
    let touchStartX = 0;
    let isTouchPanning = false;

    modalContent.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom start
            initialPinchDistance = getTouchDistance(e.touches);
            initialScale = scale;
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];
            touchStartX = touch.clientX;

            if (scale > 1) {
                isTouchPanning = true;
                startX = touch.clientX - translateX;
                startY = touch.clientY - translateY;
            }

            // Double tap detection
            const now = Date.now();
            if (now - lastTapTime < 300) {
                e.preventDefault();
                if (scale > 1) {
                    resetZoom(true);
                } else {
                    zoomTo(2.5, touch.clientX, touch.clientY);
                }
            }
            lastTapTime = now;
        }
    }, { passive: false });

    modalContent.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance) {
            e.preventDefault();
            const currentDistance = getTouchDistance(e.touches);
            const factor = currentDistance / initialPinchDistance;
            const centerMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            zoomTo(initialScale * factor, centerMidX, centerMidY);
        } else if (e.touches.length === 1 && isTouchPanning && scale > 1) {
            e.preventDefault();
            const touch = e.touches[0];
            translateX = touch.clientX - startX;
            translateY = touch.clientY - startY;
            applyTransform(false);
        }
    }, { passive: false });

    modalContent.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialPinchDistance = null;
        }
        if (e.touches.length === 0) {
            if (isTouchPanning) {
                isTouchPanning = false;
            } else if (scale === 1 && touchStartX) {
                const touchEndX = e.changedTouches[0].clientX;
                const swipeDistance = touchEndX - touchStartX;
                const minSwipeDistance = 50;

                if (Math.abs(swipeDistance) > minSwipeDistance) {
                    if (swipeDistance > 0) showPrev();
                    else showNext();
                }
            }
            touchStartX = 0;
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
                dot.setAttribute('role', 'button');
                dot.setAttribute('tabindex', '0');
                dot.setAttribute('aria-label', `${i + 1}枚目の画像を表示`);
                if (i === 0) dot.classList.add('active');
                const goToSlide = () => {
                    track.scrollTo({ left: track.offsetWidth * i, behavior: 'smooth' });
                };
                dot.addEventListener('click', goToSlide);
                dot.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goToSlide();
                    }
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

/**
 * Utility: Calculate distance between two touch points for pinch zoom
 * @param {TouchList} touches
 * @returns {number}
 */
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}


