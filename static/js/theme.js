document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('theme-toggle');

    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.dataset.theme;
        const systemDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;

        let targetTheme;

        // If currently dark (explicit or system), go light
        if (currentTheme === 'dark') {
            targetTheme = 'light';
        } else if (currentTheme === 'light') {
            targetTheme = 'dark';
        } else {
            // No override. If system is dark, go light. If system is light, go dark.
            targetTheme = systemDark ? 'light' : 'dark';
        }

        document.documentElement.dataset.theme = targetTheme;
        localStorage.setItem('theme', targetTheme);
    });

    // Floating controls & Scroll to Top functionality
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    let lastScrollY = window.pageYOffset || window.scrollY || 0;
    let scrollStopTimeout = null;
    let isScrollingTicking = false;

    function handleGlobalScroll() {
        const currentScrollY = window.pageYOffset || window.scrollY || 0;

        // Scroll to top visibility
        if (scrollToTopBtn) {
            if (currentScrollY > 300) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
        }

        // Downward scroll dimming for floating controls
        if (currentScrollY > 350) {
            if (currentScrollY > lastScrollY + 6) {
                document.body.classList.add('is-scrolling-down');
            } else if (currentScrollY < lastScrollY - 6) {
                document.body.classList.remove('is-scrolling-down');
            }
        } else {
            document.body.classList.remove('is-scrolling-down');
        }

        lastScrollY = currentScrollY;

        if (scrollStopTimeout) clearTimeout(scrollStopTimeout);
        scrollStopTimeout = setTimeout(() => {
            document.body.classList.remove('is-scrolling-down');
        }, 500);

        isScrollingTicking = false;
    }

    window.addEventListener('scroll', () => {
        if (!isScrollingTicking) {
            window.requestAnimationFrame(handleGlobalScroll);
            isScrollingTicking = true;
        }
    }, { passive: true });

    if (scrollToTopBtn) {
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});
