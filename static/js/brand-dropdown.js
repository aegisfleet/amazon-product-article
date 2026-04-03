/**
 * Brand Dropdown - Navigation for mobile
 * Handles basic navigation for the brand select box on the home page.
 */
(function () {
    /**
     * Handle change event on brand select
     */
    function handleBrandChange(e) {
        if (e.target.id !== 'brand-select') return;

        const selectedUrl = e.target.value;
        if (selectedUrl) {
            // Validation: Ensure it's a same-origin URL
            try {
                const targetUrl = new URL(selectedUrl, window.location.origin);
                if (targetUrl.origin === window.location.origin) {
                    window.location.href = targetUrl.toString();
                }
            } catch (error) {
                console.error('Invalid navigation URL:', selectedUrl);
            }
        }
    }

    /**
     * Reset dropdown state (e.g. after back button)
     */
    function resetBrandDropdown() {
        const brandSelect = document.getElementById('brand-select');
        if (brandSelect) {
            brandSelect.selectedIndex = 0;
        }
    }

    // Initialize event listeners
    document.addEventListener('change', handleBrandChange);

    // Handle bfcache restoration - ensure dropdown doesn't stay on a selection
    window.addEventListener('pageshow', function (event) {
        resetBrandDropdown();
    });
})();
