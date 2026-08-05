document.addEventListener('DOMContentLoaded', () => {
  const originalToc = document.getElementById('toc');
  if (!originalToc) return;

  const originalTocContent = originalToc.querySelector('#TableOfContents') || originalToc.querySelector('nav');
  if (!originalTocContent) return;

  // Clone TOC content for Sidebar and Mobile Modal
  const sidebarContainer = document.getElementById('toc-sidebar-body');
  const modalContainer = document.getElementById('toc-modal-body');

  if (sidebarContainer) {
    const sidebarTocClone = originalTocContent.cloneNode(true);
    sidebarTocClone.id = 'TableOfContents-sidebar';
    sidebarContainer.appendChild(sidebarTocClone);
  }

  if (modalContainer) {
    const modalTocClone = originalTocContent.cloneNode(true);
    modalTocClone.id = 'TableOfContents-modal';
    modalContainer.appendChild(modalTocClone);
  }

  // Mobile Modal Elements & Controls
  const tocFab = document.getElementById('toc-fab');
  const tocModal = document.getElementById('toc-modal');
  const tocModalOverlay = document.getElementById('toc-modal-overlay');
  const tocModalClose = document.getElementById('toc-modal-close');

  let closeTimeout;

  function openTocModal() {
    if (!tocModal) return;
    if (closeTimeout) clearTimeout(closeTimeout);

    if (typeof tocModal.showModal === 'function' && !tocModal.open) {
      tocModal.showModal();
    }
    requestAnimationFrame(() => {
      tocModal.classList.add('is-open');
    });

    if (tocFab) tocFab.setAttribute('aria-expanded', 'true');
    document.body.classList.add('toc-modal-open');
  }

  function closeTocModal() {
    if (!tocModal) return;
    tocModal.classList.remove('is-open');
    if (tocFab) tocFab.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('toc-modal-open');

    closeTimeout = setTimeout(() => {
      if (typeof tocModal.close === 'function' && tocModal.open) {
        tocModal.close();
      }
    }, 300);
  }

  if (tocModal) {
    tocModal.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeTocModal();
    });
  }

  if (tocFab) {
    tocFab.addEventListener('click', () => {
      if (tocModal?.classList.contains('is-open')) {
        closeTocModal();
      } else {
        openTocModal();
      }
    });
  }

  if (tocModalOverlay) {
    tocModalOverlay.addEventListener('click', closeTocModal);
  }

  if (tocModalClose) {
    tocModalClose.addEventListener('click', closeTocModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tocModal?.classList.contains('is-open')) {
      closeTocModal();
    }
  });

  // Handle TOC smooth scrolling & close modal on click
  const allTocLinks = document.querySelectorAll('.table-of-contents a, .toc-sidebar a, .toc-modal a');
  for (const link of allTocLinks) {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href?.startsWith('#')) {
        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          e.preventDefault();
          const headerOffset = 90;
          const elementPosition = targetElement.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          if (tocModal?.classList.contains('is-open')) {
            closeTocModal();
          }
        }
      }
    });
  }

  // Active Link (ScrollSpy) Functionality
  const headings = Array.from(document.querySelectorAll('.content h2[id], .content h3[id]'));
  if (headings.length > 0) {
    let ticking = false;

    function updateActiveHeading() {
      const scrollPosition = window.pageYOffset + 120;
      let currentActiveId = '';

      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i];
        if (heading.offsetTop <= scrollPosition) {
          currentActiveId = heading.id;
          break;
        }
      }

      if (!currentActiveId && headings.length > 0) {
        currentActiveId = headings[0].id;
      }

      for (const l of allTocLinks) {
        const href = l.getAttribute('href');
        if (href === `#${currentActiveId}`) {
          l.classList.add('is-active');
        } else {
          l.classList.remove('is-active');
        }
      }

      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(updateActiveHeading);
        ticking = true;
      }
    }, { passive: true });

    // Initial check
    updateActiveHeading();
  }

  // Sticky CTA Bar position Sync for TOC FAB
  // 固定値ではなく実際のバー高さをCSS変数で渡し、Androidのジェスチャーナビ等に対応する
  const stickyBar = document.getElementById('sticky-cta-bar');
  if (stickyBar && tocFab && 'MutationObserver' in window) {
    const GAP = 12; // FABとバーの間のマージン(px)

    function syncTocFabBottom() {
      if (stickyBar.classList.contains('is-active')) {
        const barHeight = stickyBar.offsetHeight;
        tocFab.style.setProperty('bottom', `${barHeight + GAP}px`);
      } else {
        tocFab.style.removeProperty('bottom');
      }
    }

    const observer = new MutationObserver(syncTocFabBottom);
    observer.observe(stickyBar, { attributes: true, attributeFilter: ['class'] });

    // バーのリサイズ（セーフエリア変動など）にも追従する
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(syncTocFabBottom);
      resizeObserver.observe(stickyBar);
    }
  }
});
