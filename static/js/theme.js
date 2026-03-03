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
        updateThemeColor(targetTheme);
    });

    function updateThemeColor(theme) {
        const themeColorMeta = document.getElementById('pwa-theme-color');
        const systemDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;

        let color = '#F9FAFB'; // Light mode fallback

        if (theme === 'dark' || (theme === null && systemDark)) {
            color = '#111827'; // Dark mode background
        }

        if (themeColorMeta) {
            themeColorMeta.setAttribute('content', color);
        }
    }

    // 初期読み込み時にも適用（必要に応じて）
    const initialTheme = document.documentElement.dataset.theme;
    if (initialTheme) {
        updateThemeColor(initialTheme);
    }

    // Scroll to Top functionality
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
        });

        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});
