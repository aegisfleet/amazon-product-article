document.addEventListener('DOMContentLoaded', () => {
  const stickyBar = document.getElementById('sticky-cta-bar');
  if (!stickyBar) return;

  const scrollToTopBtn = document.getElementById('scroll-to-top');
  const tocFab = document.getElementById('toc-fab');
  const GAP = 12; // バーとフローティングボタンの間のマージン(px)

  function syncFloatingButtons() {
    const compareTray = document.getElementById('compare-tray');
    const floatingSearchFab = document.getElementById('floating-search-fab');
    let maxBarHeight = 0;

    if (stickyBar?.classList.contains('is-active')) {
      maxBarHeight = Math.max(maxBarHeight, stickyBar.offsetHeight);
    }
    if (compareTray?.classList.contains('is-active')) {
      maxBarHeight = Math.max(maxBarHeight, compareTray.offsetHeight);
    }

    const floatingButtons = [scrollToTopBtn, tocFab, floatingSearchFab].filter(Boolean);

    if (maxBarHeight > 0) {
      const bottomOffset = `${maxBarHeight + GAP}px`;
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

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // ターゲットが画面上部にスクロールアウトした際にStickyバーを表示
        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
          stickyBar.classList.add('is-active');
          stickyBar.setAttribute('aria-hidden', 'false');
        } else {
          stickyBar.classList.remove('is-active');
          stickyBar.setAttribute('aria-hidden', 'true');
        }
        syncFloatingButtons();
      }
    },
    {
      threshold: 0,
    }
  );

  observer.observe(targetElement);

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

