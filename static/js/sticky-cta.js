document.addEventListener('DOMContentLoaded', () => {
  const stickyBar = document.getElementById('sticky-cta-bar');
  if (!stickyBar) return;

  const scrollToTopBtn = document.getElementById('scroll-to-top');
  const tocFab = document.getElementById('toc-fab');
  const GAP = 12; // バーとフローティングボタンの間のマージン(px)

  function syncFloatingButtons() {
    if (stickyBar.classList.contains('is-active')) {
      const barHeight = stickyBar.offsetHeight;
      const bottomOffset = `${barHeight + GAP}px`;
      if (scrollToTopBtn) scrollToTopBtn.style.setProperty('bottom', bottomOffset);
      if (tocFab) tocFab.style.setProperty('bottom', bottomOffset);
    } else {
      if (scrollToTopBtn) scrollToTopBtn.style.removeProperty('bottom');
      if (tocFab) tocFab.style.removeProperty('bottom');
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
});

