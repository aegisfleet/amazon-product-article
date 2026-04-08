(function () {
    function sendHeroEntryEvent(entryType) {
        if (!entryType) return;

        if (typeof globalThis.gtag === 'function') {
            globalThis.gtag('event', 'home_entry_click', {
                entry_type: entryType,
                page_type: 'home',
                location: 'hero'
            });
            return;
        }

        globalThis.dataLayer = globalThis.dataLayer || [];
        globalThis.dataLayer.push({
            event: 'home_entry_click',
            entry_type: entryType,
            page_type: 'home',
            location: 'hero'
        });
    }

    document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const trigger = target.closest('[data-hero-entry]');
        if (!(trigger instanceof HTMLElement)) return;

        sendHeroEntryEvent(trigger.dataset.heroEntry || 'unknown');
    });
})();
