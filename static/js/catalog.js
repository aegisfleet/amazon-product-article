(() => {
    const ASIN_REGEX = /^[A-Z0-9]{10}$/i;

    function formatDateTimeJa(isoString) {
        if (!isoString) return '不明';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '不明';
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tokyo',
        });
    }

    function formatMonthDayJa(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '';
        return `${date.getMonth() + 1}月${date.getDate()}日`;
    }

    function formatDateJa(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return isoString;
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }

    function isSafeHttpUrl(url) {
        if (typeof url !== 'string') return false;
        return url.startsWith('https://') || url.startsWith('http://');
    }

    function showMessage(loadingEl, messageEl, title, desc) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (!messageEl) return;
        const titleEl = document.getElementById('catalog-message-title');
        const descEl = document.getElementById('catalog-message-desc');
        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = desc;
        messageEl.style.display = 'block';
    }

    function renderPriceBlock(record) {
        const priceEl = document.getElementById('catalog-price');
        const taxEl = document.getElementById('catalog-price-tax');
        if (priceEl) {
            if (typeof record.price === 'number' && record.price > 0) {
                priceEl.textContent = `¥${record.price.toLocaleString('ja-JP')}`;
                if (taxEl) taxEl.style.display = 'inline';
            } else {
                priceEl.textContent = '価格データなし';
                if (taxEl) taxEl.style.display = 'none';
            }
        }

        const prevRowEl = document.getElementById('catalog-previous-price-row');
        const prevTextEl = document.getElementById('catalog-previous-price-text');
        if (prevRowEl && prevTextEl && typeof record.previous_price === 'number' && record.previous_price > 0) {
            const changedDate = formatMonthDayJa(record.price_changed_at);
            const changedSuffix = changedDate ? `（${changedDate}に変動）` : '';
            prevTextEl.textContent = `前回価格 ${record.previous_price.toLocaleString('ja-JP')}円${changedSuffix}`;
            prevRowEl.style.display = 'flex';
        }

        const asOfEl = document.getElementById('catalog-price-as-of-note');
        if (asOfEl) {
            const asOfLabel = formatDateTimeJa(record.price_as_of);
            asOfEl.textContent = `価格は ${asOfLabel} 時点の参考値です。最新の価格は Amazon でご確認ください`;
        }
    }

    function renderProduct(record, homeUrl, siteTitle) {
        const loadingEl = document.getElementById('catalog-loading');
        const productEl = document.getElementById('catalog-product');

        const title = record.title || record.asin;
        const titleEl = document.getElementById('catalog-title');
        if (titleEl) titleEl.textContent = title;

        if (siteTitle) {
            document.title = `${title}（未調査） | ${siteTitle}`;
        }

        const imageEl = document.getElementById('catalog-image');
        const noImageEl = document.getElementById('catalog-no-image');
        if (imageEl && isSafeHttpUrl(record.image)) {
            imageEl.src = record.image;
            imageEl.alt = title;
            imageEl.style.display = 'block';
        } else if (noImageEl) {
            noImageEl.style.display = 'flex';
        }

        const brandBadgeEl = document.getElementById('catalog-brand-badge');
        const brandRowEl = document.getElementById('catalog-brand-row');
        const brandValEl = document.getElementById('catalog-brand');
        if (record.brand) {
            if (brandBadgeEl) {
                brandBadgeEl.textContent = record.brand;
                brandBadgeEl.style.display = 'inline-flex';
            }
            if (brandRowEl && brandValEl) {
                brandValEl.textContent = record.brand;
                brandRowEl.style.display = 'flex';
            }
        }

        const availBadgeEl = document.getElementById('catalog-availability-badge');
        if (availBadgeEl && record.availability) {
            availBadgeEl.textContent = record.availability;
            availBadgeEl.style.display = 'inline-flex';
        }

        renderPriceBlock(record);

        const categoryRowEl = document.getElementById('catalog-category-row');
        const categoryValEl = document.getElementById('catalog-category');
        if (categoryRowEl && categoryValEl && record.amazon_category) {
            categoryValEl.textContent = record.amazon_category;
            categoryRowEl.style.display = 'flex';
        }

        const releaseRowEl = document.getElementById('catalog-release-row');
        const releaseValEl = document.getElementById('catalog-release-date');
        if (releaseRowEl && releaseValEl && record.release_date) {
            releaseValEl.textContent = formatDateJa(record.release_date);
            releaseRowEl.style.display = 'flex';
        }

        const asinEl = document.getElementById('catalog-asin');
        if (asinEl) asinEl.textContent = record.asin;

        const amazonLinkEl = document.getElementById('catalog-amazon-link');
        if (amazonLinkEl) {
            const safeAmazonUrl = isSafeHttpUrl(record.detail_page_url)
                ? record.detail_page_url
                : `https://www.amazon.co.jp/dp/${encodeURIComponent(record.asin)}`;
            amazonLinkEl.href = safeAmazonUrl;
        }

        const searchLinkEl = document.getElementById('catalog-search-link');
        const searchLabelEl = document.getElementById('catalog-search-link-label');
        if (searchLinkEl) {
            const searchQuery = record.brand || record.amazon_category || '';
            if (searchQuery) {
                searchLinkEl.href = `${homeUrl}?q=${encodeURIComponent(searchQuery)}`;
                if (searchLabelEl) {
                    searchLabelEl.textContent = `「${searchQuery}」の調査済み商品を検索`;
                }
            } else {
                searchLinkEl.href = homeUrl;
            }
        }

        if (loadingEl) loadingEl.style.display = 'none';
        if (productEl) productEl.style.display = 'block';
    }

    async function initCatalogPage() {
        const container = document.querySelector('.catalog-page-container');
        if (!container) return;

        const catalogBaseUrl = container.dataset.catalogBaseUrl || '/catalog-data/';
        const homeUrl = container.dataset.homeUrl || '/';
        const siteTitle = container.dataset.siteTitle || '';
        const loadingEl = document.getElementById('catalog-loading');
        const messageEl = document.getElementById('catalog-message');

        const params = new URLSearchParams(globalThis.location.search);
        const rawAsin = (params.get('asin') || '').trim();
        if (!ASIN_REGEX.test(rawAsin)) {
            showMessage(
                loadingEl,
                messageEl,
                'ASIN の指定が正しくありません',
                'URL の ?asin= パラメータに 10 桁の英数字 ASIN を指定してください。',
            );
            return;
        }

        const asin = rawAsin.toUpperCase();
        const shardKey = asin.slice(-2);

        try {
            const response = await fetch(`${catalogBaseUrl}${shardKey}.json`);
            if (!response.ok) {
                showMessage(
                    loadingEl,
                    messageEl,
                    'この商品のデータはありません（未調査・取り扱いなし）',
                    `指定された ASIN（${asin}）の商品情報は見つかりませんでした。`,
                );
                return;
            }
            const shardData = await response.json();
            const record = shardData?.[asin];
            if (!record) {
                showMessage(
                    loadingEl,
                    messageEl,
                    'この商品のデータはありません（未調査・取り扱いなし）',
                    `指定された ASIN（${asin}）の商品情報は見つかりませんでした。`,
                );
                return;
            }

            if (record.investigated === true) {
                globalThis.location.replace(`${homeUrl}${asin.toLowerCase()}/`);
                return;
            }

            renderProduct(record, homeUrl, siteTitle);
        } catch {
            showMessage(
                loadingEl,
                messageEl,
                'この商品のデータはありません（未調査・取り扱いなし）',
                `指定された ASIN（${asin}）のデータ読み込みに失敗しました。`,
            );
        }
    }

    document.addEventListener('DOMContentLoaded', initCatalogPage);
})();
