function cloneTocContent(originalTocContent) {
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
}

function setupTocModal() {
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
    tocModal.classList.add('is-open');

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

  function setupTocFabScroll() {
    if (!tocFab) return;

    let lastScrollY = window.pageYOffset || window.scrollY || 0;
    let scrollTimeout = null;
    let ticking = false;

    function updateFab() {
      const currentScrollY = window.pageYOffset || window.scrollY || 0;

      // 300pxスクロール後に表示
      if (currentScrollY > 300) {
        tocFab.classList.add('visible');
      } else {
        tocFab.classList.remove('visible');
        tocFab.classList.remove('is-scrolling-down');
      }

      // 下スクロール時は半透明化、上スクロール時は復帰
      const isModalOpen = tocModal?.classList.contains('is-open');
      if (!isModalOpen && currentScrollY > 350) {
        if (currentScrollY > lastScrollY + 6) {
          tocFab.classList.add('is-scrolling-down');
        } else if (currentScrollY < lastScrollY - 6) {
          tocFab.classList.remove('is-scrolling-down');
        }
      } else {
        tocFab.classList.remove('is-scrolling-down');
      }

      lastScrollY = currentScrollY;

      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        tocFab.classList.remove('is-scrolling-down');
      }, 500);

      ticking = false;
    }

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          window.requestAnimationFrame(updateFab);
          ticking = true;
        }
      },
      { passive: true }
    );

    updateFab();
  }

  setupTocFabScroll();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tocModal?.classList.contains('is-open')) {
      closeTocModal();
    }
  });

  return { closeTocModal };
}

function setupSmoothScroll(allTocLinks, closeTocModal) {
  for (const link of allTocLinks) {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href?.startsWith('#')) {
        const rawTargetId = href.substring(1);
        const decodedTargetId = decodeURIComponent(rawTargetId);
        const targetElement = document.getElementById(rawTargetId) || document.getElementById(decodedTargetId);
        if (targetElement) {
          e.preventDefault();
          const headerOffset = 90;
          const elementPosition = targetElement.getBoundingClientRect().top;
          const offsetPosition = elementPosition + (window.pageYOffset || window.scrollY || 0) - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          if (closeTocModal) {
            closeTocModal();
          }
        }
      }
    });
  }
}

function scrollActiveLinkIntoView(link) {
  if (!link) return;
  const container = link.closest('.toc-sidebar-body, .toc-modal-body');
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();

  if (linkRect.top < containerRect.top || linkRect.bottom > containerRect.bottom) {
    link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function getActiveHeadingId(activeHeadings) {
  const headerOffset = 130;
  const scrollY = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;

  if (scrollY + viewportHeight >= scrollHeight - 50 && activeHeadings.length > 0) {
    return activeHeadings[activeHeadings.length - 1].id;
  }

  for (let i = activeHeadings.length - 1; i >= 0; i--) {
    const heading = activeHeadings[i];
    const rect = heading.getBoundingClientRect();
    if (rect.top <= headerOffset) {
      return heading.id;
    }
  }

  if (activeHeadings.length > 0) {
    const firstRect = activeHeadings[0].getBoundingClientRect();
    if (firstRect.top <= viewportHeight * 0.6) {
      return activeHeadings[0].id;
    }
  }

  return '';
}

function setupScrollSpy(allTocLinks) {
  const tocTargetIds = new Set();
  for (const link of allTocLinks) {
    const href = link.getAttribute('href');
    if (href?.startsWith('#')) {
      const rawId = href.substring(1);
      tocTargetIds.add(rawId);
      try {
        tocTargetIds.add(decodeURIComponent(rawId));
      } catch (e) {
        // Ignore decode error
      }
    }
  }

  const allHeadings = Array.from(document.querySelectorAll('.content h2[id], .content h3[id], .content h4[id]'));
  const headings = allHeadings.filter((h) => tocTargetIds.has(h.id));
  const activeHeadings = headings.length > 0 ? headings : allHeadings;

  if (activeHeadings.length === 0) return;

  let ticking = false;

  function updateActiveHeading() {
    const currentActiveId = getActiveHeadingId(activeHeadings);

    for (const l of allTocLinks) {
      const href = l.getAttribute('href') || '';
      let isActive = false;

      if (href.startsWith('#')) {
        const rawId = href.substring(1);
        const decodedId = decodeURIComponent(rawId);
        if (currentActiveId && (rawId === currentActiveId || decodedId === currentActiveId)) {
          isActive = true;
        }
      }

      if (isActive) {
        if (!l.classList.contains('is-active')) {
          l.classList.add('is-active');
          l.setAttribute('aria-current', 'true');
          scrollActiveLinkIntoView(l);
        }
      } else {
        l.classList.remove('is-active');
        l.removeAttribute('aria-current');
      }
    }

    ticking = false;
  }

  function onScrollOrResize() {
    if (!ticking) {
      window.requestAnimationFrame(updateActiveHeading);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });

  updateActiveHeading();
}

document.addEventListener('DOMContentLoaded', () => {
  const originalToc = document.getElementById('toc');
  if (!originalToc) return;

  const originalTocContent = originalToc.querySelector('#TableOfContents') || originalToc.querySelector('nav');
  if (!originalTocContent) return;

  cloneTocContent(originalTocContent);
  const { closeTocModal } = setupTocModal();

  const allTocLinks = document.querySelectorAll('.table-of-contents a, .toc-sidebar-body a, .toc-modal-body a');
  setupSmoothScroll(allTocLinks, closeTocModal);
  setupScrollSpy(allTocLinks);
});
