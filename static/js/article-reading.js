document.addEventListener('DOMContentLoaded', () => {
  // 1. Scroll Progress Bar
  const progressBar = document.getElementById('scroll-progress-bar');
  if (progressBar) {
    let ticking = false;

    const updateScrollProgress = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;

      const totalScrollable = documentHeight - windowHeight;
      const progress = totalScrollable > 0 ? (scrollTop / totalScrollable) * 100 : 0;

      const clampedProgress = Math.min(100, Math.max(0, progress));
      progressBar.style.width = `${clampedProgress}%`;
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollProgress);
        ticking = true;
      }
    }, { passive: true });

    // Initial calculation
    updateScrollProgress();
  }

  // 2. Font Size Switcher
  const fontBtns = document.querySelectorAll('.font-size-btn');
  const articleContent = document.querySelector('.article-content .content');
  const STORAGE_KEY = 'article-font-size';
  const VALID_SIZES = ['sm', 'md', 'lg'];

  if (fontBtns.length > 0 && articleContent) {
    const applyFontSize = (size) => {
      const targetSize = VALID_SIZES.includes(size) ? size : 'md';

      for (const s of VALID_SIZES) {
        articleContent.classList.remove(`font-size-${s}`);
      }
      articleContent.classList.add(`font-size-${targetSize}`);

      for (const btn of fontBtns) {
        const btnSize = btn.getAttribute('data-size');
        if (btnSize === targetSize) {
          btn.classList.add('is-active');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('is-active');
          btn.setAttribute('aria-pressed', 'false');
        }
      }
    };

    // Load saved font size preference
    const savedSize = localStorage.getItem(STORAGE_KEY);
    if (savedSize && VALID_SIZES.includes(savedSize)) {
      applyFontSize(savedSize);
    } else {
      applyFontSize('md');
    }

    // Add click event listeners
    for (const btn of fontBtns) {
      btn.addEventListener('click', () => {
        const size = btn.getAttribute('data-size');
        if (size && VALID_SIZES.includes(size)) {
          applyFontSize(size);
          try {
            localStorage.setItem(STORAGE_KEY, size);
          } catch (e) {
            console.warn('Unable to save font size to localStorage:', e);
          }
        }
      });
    }
  }
});
