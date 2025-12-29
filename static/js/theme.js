document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('theme-toggle');

    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        let targetTheme = 'light';

        // If currently dark (explicit or system), go light
        if (currentTheme === 'dark') {
            targetTheme = 'light';
        } else if (currentTheme === 'light') {
            targetTheme = 'dark';
        } else {
            // No override. If system is dark, go light. If system is light, go dark.
            targetTheme = systemDark ? 'light' : 'dark';
        }

        document.documentElement.setAttribute('data-theme', targetTheme);
        localStorage.setItem('theme', targetTheme);
    });
});
