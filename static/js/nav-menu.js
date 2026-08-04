document.addEventListener('DOMContentLoaded', () => {
  const toggleBtns = document.querySelectorAll('.nav-menu-toggle');
  const closeBtn = document.getElementById('nav-menu-close');
  const drawer = document.getElementById('site-nav-drawer');
  const overlay = document.getElementById('nav-drawer-overlay');

  if (toggleBtns.length === 0 || !drawer || !overlay) {
    return;
  }

  const focusableElementsSelector = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastActiveToggle = null;

  const openMenu = (triggerBtn) => {
    lastActiveToggle = triggerBtn || document.activeElement;
    drawer.classList.add('is-active');
    overlay.classList.add('is-active');
    toggleBtns.forEach((btn) => btn.setAttribute('aria-expanded', 'true'));
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');

    if (closeBtn) {
      closeBtn.focus();
    }
  };

  const closeMenu = () => {
    drawer.classList.remove('is-active');
    overlay.classList.remove('is-active');
    toggleBtns.forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');

    if (lastActiveToggle && typeof lastActiveToggle.focus === 'function') {
      lastActiveToggle.focus();
    }
  };

  const isMenuOpen = () => drawer.classList.contains('is-active');

  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isMenuOpen()) {
        closeMenu();
      } else {
        openMenu(btn);
      }
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeMenu);
  }

  overlay.addEventListener('click', closeMenu);

  // Escキー操作対応
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMenuOpen()) {
      closeMenu();
    }
  });

  // フォーカストラップ制御
  drawer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !isMenuOpen()) {
      return;
    }

    const focusables = Array.from(drawer.querySelectorAll(focusableElementsSelector));
    if (focusables.length === 0) {
      return;
    }

    const firstElement = focusables[0];
    const lastElement = focusables.at(-1);

    if (e.shiftKey && document.activeElement === firstElement) {
      lastElement.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      firstElement.focus();
      e.preventDefault();
    }
  });
});
