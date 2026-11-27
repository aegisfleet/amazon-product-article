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
        return date.toLocaleString('ja-JP', {
            month: 'long',
            day: 'numeric',
            timeZone: 'Asia/Tokyo',
        });
    }

    function formatDateJa(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return isoString;
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Asia/Tokyo',
        });
    }

    function isSafeHttpUrl(url) {
        if (typeof url !== 'string') return false;
        return url.startsWith('https://') || url.startsWith('http://');
    }

    function buildMoshimoUrl(aId, pId, pcId, plId, targetUrl) {
        return `https://af.moshimo.com/af/c/click?a_id=${encodeURIComponent(aId)}&p_id=${encodeURIComponent(pId)}&pc_id=${encodeURIComponent(pcId)}&pl_id=${encodeURIComponent(plId)}&url=${encodeURIComponent(targetUrl)}`;
    }

    function buildRequestFormUrl(dataset, asin) {
        const formUrl = dataset.requestFormUrl || '';
        const entryId = dataset.requestEntryId || '';
        if (!isSafeHttpUrl(formUrl) || !entryId || !ASIN_REGEX.test(asin)) return '';
        const targetAmazonUrl = `https://www.amazon.co.jp/dp/${asin.toUpperCase()}`;
        return `${formUrl}?usp=pp_url&${encodeURIComponent(entryId)}=${encodeURIComponent(targetAmazonUrl)}`;
    }

    function showMessage(loadingEl, messageEl, title, desc, requestUrl = '') {
        if (loadingEl) loadingEl.style.display = 'none';
        if (!messageEl) return;
        const titleEl = document.getElementById('catalog-message-title');
        const descEl = document.getElementById('catalog-message-desc');
        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = desc;

        const reqLinkEl = document.getElementById('catalog-message-request-link');
        if (reqLinkEl) {
            if (requestUrl) {
                reqLinkEl.href = requestUrl;
                reqLinkEl.style.display = 'inline-flex';
            } else {
                reqLinkEl.style.display = 'none';
            }
        }
        messageEl.style.display = 'block';
    }

    function renderMainPrice(price) {
        const priceEl = document.getElementById('catalog-price');
        const taxEl = document.getElementById('catalog-price-tax');
        if (!priceEl) return;

        const hasValidPrice = typeof price === 'number' && price > 0;
        priceEl.textContent = hasValidPrice ? `¥${price.toLocaleString('ja-JP')}` : '価格データなし';
        if (taxEl) {
            taxEl.style.display = hasValidPrice ? 'inline' : 'none';
        }
    }

    function renderPreviousPrice(previousPrice, priceChangedAt) {
        const prevRowEl = document.getElementById('catalog-previous-price-row');
        const prevTextEl = document.getElementById('catalog-previous-price-text');
        if (!prevRowEl || !prevTextEl) return;
        if (typeof previousPrice !== 'number' || previousPrice <= 0) return;

        const changedDate = formatMonthDayJa(priceChangedAt);
        const changedSuffix = changedDate ? `（${changedDate}に変動）` : '';
        prevTextEl.textContent = `前回価格 ${previousPrice.toLocaleString('ja-JP')}円${changedSuffix}`;
        prevRowEl.style.display = 'flex';
    }

    function renderPriceBlock(record) {
        renderMainPrice(record.price);
        renderPreviousPrice(record.previous_price, record.price_changed_at);

        const asOfEl = document.getElementById('catalog-price-as-of-note');
        if (asOfEl) {
            asOfEl.textContent = `価格は ${formatDateTimeJa(record.price_as_of)} 時点の参考値です。最新の価格は Amazon でご確認ください`;
        }
    }

    function renderImage(imageUrl, title) {
        const imageEl = document.getElementById('catalog-image');
        const noImageEl = document.getElementById('catalog-no-image');
        if (imageEl && isSafeHttpUrl(imageUrl)) {
            imageEl.src = imageUrl;
            imageEl.alt = title;
            imageEl.style.display = 'block';
            return;
        }
        if (noImageEl) {
            noImageEl.style.display = 'flex';
        }
    }

    function renderBrand(brand) {
        if (!brand) return;
        const brandBadgeEl = document.getElementById('catalog-brand-badge');
        if (brandBadgeEl) {
            brandBadgeEl.textContent = brand;
            brandBadgeEl.style.display = 'inline-flex';
        }
        renderOptionalDetailRow('catalog-brand-row', 'catalog-brand', brand);
    }

    function renderOptionalDetailRow(rowId, valueId, value) {
        if (!value) return;
        const rowEl = document.getElementById(rowId);
        const valEl = document.getElementById(valueId);
        if (rowEl && valEl) {
            valEl.textContent = value;
            rowEl.style.display = 'flex';
        }
    }

    function renderShopLinks(record, dataset) {
        const title = record.title || record.asin;
        const searchQuery = record.title || record.asin;

        const amazonLinkEl = document.getElementById('catalog-amazon-link');
        if (amazonLinkEl) {
            amazonLinkEl.href = isSafeHttpUrl(record.detail_page_url)
                ? record.detail_page_url
                : `https://www.amazon.co.jp/dp/${encodeURIComponent(record.asin)}`;
            amazonLinkEl.setAttribute('aria-label', `${title}をAmazonで見る`);
        }

        const rakutenLinkEl = document.getElementById('catalog-rakuten-link');
        if (rakutenLinkEl) {
            const rakutenTargetUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(searchQuery)}/`;
            rakutenLinkEl.href = buildMoshimoUrl(
                dataset.rakutenAId || '5756223',
                dataset.rakutenPId || '54',
                dataset.rakutenPcId || '54',
                dataset.rakutenPlId || '27059',
                rakutenTargetUrl,
            );
            rakutenLinkEl.setAttribute('aria-label', `${title}を楽天市場で見る`);
        }

        const yahooLinkEl = document.getElementById('catalog-yahoo-link');
        if (yahooLinkEl) {
            const yahooTargetUrl = `https://shopping.yahoo.co.jp/search?first=1&p=${encodeURIComponent(searchQuery)}`;
            yahooLinkEl.href = buildMoshimoUrl(
                dataset.yahooAId || '5756224',
                dataset.yahooPId || '1225',
                dataset.yahooPcId || '1925',
                dataset.yahooPlId || '27061',
                yahooTargetUrl,
            );
            yahooLinkEl.setAttribute('aria-label', `${title}をYahoo!ショッピングで見る`);
        }
    }

    function renderSecondaryActions(record, homeUrl, dataset) {
        const requestLinkEl = document.getElementById('catalog-request-link');
        const requestUrl = buildRequestFormUrl(dataset, record.asin);
        if (requestLinkEl && requestUrl) {
            requestLinkEl.href = requestUrl;
            requestLinkEl.setAttribute('aria-label', `${record.title || record.asin}の調査リクエストを送信（新しいタブで開く）`);
            requestLinkEl.style.display = 'inline-flex';
        }

        const searchLinkEl = document.getElementById('catalog-search-link');
        if (!searchLinkEl) return;

        const searchQuery = record.brand || record.amazon_category || '';
        if (!searchQuery) {
            searchLinkEl.href = homeUrl;
            return;
        }

        searchLinkEl.href = `${homeUrl}?q=${encodeURIComponent(searchQuery)}`;
        const searchLabelEl = document.getElementById('catalog-search-link-label');
        if (searchLabelEl) {
            searchLabelEl.textContent = `「${searchQuery}」の調査済み商品を検索`;
        }
    }

    function renderProduct(record, homeUrl, siteTitle, dataset) {
        const loadingEl = document.getElementById('catalog-loading');
        const productEl = document.getElementById('catalog-product');
        const title = record.title || record.asin;

        const titleEl = document.getElementById('catalog-title');
        if (titleEl) titleEl.textContent = title;
        if (siteTitle) document.title = `${title}（未調査） | ${siteTitle}`;

        renderImage(record.image, title);
        renderBrand(record.brand);

        const dealBadgeEl = document.getElementById('catalog-deal-badge');
        if (dealBadgeEl && record.deal_badge) {
            dealBadgeEl.textContent = record.deal_badge;
            dealBadgeEl.style.display = 'inline-flex';
        }

        const savingsBadgeEl = document.getElementById('catalog-savings-badge');
        if (savingsBadgeEl && typeof record.savings_percentage === 'number' && record.savings_percentage > 0) {
            savingsBadgeEl.textContent = `${record.savings_percentage}% OFF`;
            savingsBadgeEl.style.display = 'inline-flex';
        }

        const availBadgeEl = document.getElementById('catalog-availability-badge');
        if (availBadgeEl && record.availability) {
            availBadgeEl.textContent = record.availability;
            availBadgeEl.style.display = 'inline-flex';
        }

        renderPriceBlock(record);
        renderOptionalDetailRow('catalog-category-row', 'catalog-category', record.amazon_category);
        renderOptionalDetailRow(
            'catalog-release-row',
            'catalog-release-date',
            record.release_date ? formatDateJa(record.release_date) : '',
        );

        const asinEl = document.getElementById('catalog-asin');
        if (asinEl) asinEl.textContent = record.asin;

        renderShopLinks(record, dataset);
        renderSecondaryActions(record, homeUrl, dataset);

        if (loadingEl) loadingEl.style.display = 'none';
        if (productEl) productEl.style.display = 'block';
    }

    async function tryRedirectIfArticleExists(articleUrl) {
        try {
            const headRes = await fetch(articleUrl, { method: 'HEAD' });
            if (headRes.ok) {
                globalThis.location.replace(articleUrl);
                return true;
            }
        } catch {
            // ignore network error and fall through to not-found message
        }
        return false;
    }

    async function initCatalogPage() {
        const container = document.querySelector('.catalog-page-container');
        if (!container) return;

        const dataset = container.dataset;
        const catalogBaseUrl = dataset.catalogBaseUrl || '/catalog-data/';
        const homeUrl = dataset.homeUrl || '/';
        const siteTitle = dataset.siteTitle || '';
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
        const articleUrl = `${homeUrl}${asin.toLowerCase()}/`;
        const requestUrl = buildRequestFormUrl(dataset, asin);

        try {
            const response = await fetch(`${catalogBaseUrl}${shardKey}.json`);
            const shardData = response.ok ? await response.json() : null;
            const record = shardData?.[asin];
            if (!record) {
                if (await tryRedirectIfArticleExists(articleUrl)) return;
                showMessage(
                    loadingEl,
                    messageEl,
                    'この商品のデータはありません（未調査・取り扱いなし）',
                    `指定された ASIN（${asin}）の商品情報は見つかりませんでした。`,
                    requestUrl,
                );
                return;
            }

            if (record.investigated === true) {
                globalThis.location.replace(articleUrl);
                return;
            }

            renderProduct(record, homeUrl, siteTitle, dataset);
        } catch {
            if (await tryRedirectIfArticleExists(articleUrl)) return;
            showMessage(
                loadingEl,
                messageEl,
                'この商品のデータはありません（未調査・取り扱いなし）',
                `指定された ASIN（${asin}）のデータ読み込みに失敗しました。`,
                requestUrl,
            );
        }
    }

    document.addEventListener('DOMContentLoaded', initCatalogPage);
})();
