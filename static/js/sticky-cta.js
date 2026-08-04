document.addEventListener('DOMContentLoaded', () => {
  const stickyBar = document.getElementById('sticky-cta-bar');
  if (!stickyBar) return;

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
      }
    },
    {
      threshold: 0,
    }
  );

  observer.observe(targetElement);
});
