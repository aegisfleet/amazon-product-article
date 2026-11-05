document.addEventListener('DOMContentLoaded', () => {
  const stickyBar = document.getElementById('sticky-cta-bar');
  if (!stickyBar) return;

  const scrollToTopBtn = document.getElementById('scroll-to-top');
  const tocFab = document.getElementById('toc-fab');

  function syncFloatingButtons() {
    const gap = window.innerWidth <= 640 ? 8 : 12;
    const compareTray = document.getElementById('compare-tray');
    const badgeBtn = document.getElementById('compare-tray-badge');
    const floatingSearchFab = document.getElementById('floating-search-fab');
    let maxBarHeight = 0;

    if (stickyBar?.classList.contains('is-active')) {
      maxBarHeight = Math.max(maxBarHeight, stickyBar.offsetHeight);
    }
    if (compareTray?.classList.contains('is-active') && !compareTray.classList.contains('is-minimized')) {
      maxBarHeight = Math.max(maxBarHeight, compareTray.offsetHeight);
    }

    const floatingButtons = [scrollToTopBtn, tocFab, floatingSearchFab, badgeBtn].filter(Boolean);

    if (maxBarHeight > 0) {
      const bottomOffset = `${maxBarHeight + gap}px`;
      floatingButtons.forEach((btn) => btn.style.setProperty('bottom', bottomOffset));
    } else {
      floatingButtons.forEach((btn) => btn.style.removeProperty('bottom'));
    }
  }

  const targetElement =
    document.querySelector('.product-hero-card') ||
    document.querySelector('.hero-actions');
  if (!targetElement) return;

  if (!('IntersectionObserver' in window)) {
    return;
  }

  const finalActionElement = document.querySelector('.final-recommendation-action');
  let isHeroPassed = false;
  let isFinalVisible = false;

  function updateStickyVisibility() {
    const shouldShow = isHeroPassed && !isFinalVisible;
    if (shouldShow) {
      stickyBar.classList.add('is-active');
      stickyBar.setAttribute('aria-hidden', 'false');
      if (globalThis.Compare && typeof globalThis.Compare.autoMinimize === 'function') {
        globalThis.Compare.autoMinimize(true);
      }
    } else {
      stickyBar.classList.remove('is-active');
      stickyBar.setAttribute('aria-hidden', 'true');
      if (globalThis.Compare && typeof globalThis.Compare.autoMinimize === 'function') {
        globalThis.Compare.autoMinimize(false);
      }
    }
    syncFloatingButtons();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === targetElement) {
          isHeroPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        } else if (entry.target === finalActionElement) {
          isFinalVisible = entry.isIntersecting;
        }
      }
      updateStickyVisibility();
    },
    {
      threshold: 0,
    }
  );

  observer.observe(targetElement);
  if (finalActionElement) {
    observer.observe(finalActionElement);
  }

  if ('MutationObserver' in window) {
    const mutObserver = new MutationObserver(syncFloatingButtons);
    mutObserver.observe(stickyBar, { attributes: true, attributeFilter: ['class'] });
  }

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(syncFloatingButtons);
    resizeObserver.observe(stickyBar);
  }

  window.addEventListener('resize', syncFloatingButtons, { passive: true });
  window.addEventListener('apa-compare-tray-change', syncFloatingButtons);
});

