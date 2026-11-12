/**
 * Category Dropdown - Hierarchical category navigation for mobile
 * Uses event delegation for reliable behavior after bfcache restoration
 * 
 * カテゴリデータは /data/categorygroups.json から動的に読み込まれます。
 * カテゴリの追加・変更はJSONファイルのみを編集してください。
 */
(function () {
    // Category data loaded from JSON - initialized asynchronously
    let categoryGroups = {};
    let parentCategoryUrls = {};
    let categoryIcons = {}; // NEW: Store icons for parent categories
    let categoryCounts = {}; // NEW: Store product counts for child categories
    let groupCounts = {}; // NEW: Store product counts for parent category groups
    let dataLoaded = false;

    const PRIMARY_LIMIT = 10;
    const MIN_PRIMARY_COUNT = 5;
    const POPULAR_TILE_LIMIT = 12;

    const SUBCATEGORY_ICON_MAP = {
        イヤホン: '🎧',
        タブレット: '📱',
        スマートフォン本体: '📱',
        ディスプレイ: '🖥️',
        シャンプー: '🧴',
        スマートウォッチ: '⌚',
        コンピュータモニターアーム: '🦾',
        モニターアーム: '🦾',
        モバイルバッテリー: '🔋',
        標準型ノートパソコン: '💻',
        ノートパソコン: '💻',
        スティッククリーナー: '🧹',
        ロボット型クリーナー: '🤖',
        キーボード: '⌨️',
        マウス: '🖱️',
        プロテイン: '💪',
        ホエイプロテインサプリメント: '💪',
        化粧水: '✨',
        ヘアドライヤー: '💨',
        電動歯ブラシ: '🪥',
        コーヒー豆: '☕',
        ミネラルウォーター: '💧',
        'Wi-Fiルーター': '📡',
        ヘッドホン: '🎧',
        スピーカー: '🔊',
        // 新タクソノミー（Gemini Decision 1）の子カテゴリ名
        完全ワイヤレスイヤホン: '🎧',
        'モニター・ディスプレイ': '🖥️',
        'モニターアーム・スタンド': '🦾',
        タブレット端末本体: '📱',
        スマートウォッチ本体: '⌚',
        '掃除機・クリーナー': '🧹',
        'マッサージ器・リラックス': '💆',
        '化粧水・美容液・乳液': '✨',
        'シャンプー・トリートメント': '🧴',
        'プロテイン・アミノ酸': '💪',
        '充電器・USBケーブル': '🔌',
        'ドライヤー・ヘアアイロン': '💨',
        'お茶・紅茶・健康茶': '🍵',
        'マウス・操作デバイス': '🖱️'
    };

    const SUBCATEGORY_SHORT_LABELS = {
        コンピュータモニターアーム: 'モニターアーム',
        標準型ノートパソコン: 'ノートPC',
        ホエイプロテインサプリメント: 'ホエイプロテイン',
        'モニターアーム・スタンド': 'モニターアーム',
        'マッサージ器・リラックス': 'マッサージ器',
        '化粧水・美容液・乳液': '化粧水・美容液',
        'シャンプー・トリートメント': 'シャンプー',
        'プロテイン・アミノ酸': 'プロテイン'
    };

    /**
     * Sort category groups by priority
     */
    function sortCategoriesByPriority(groups) {
        return [...groups].sort((a, b) => {
            const priorityA = a.priority !== undefined ? a.priority : 999;
            const priorityB = b.priority !== undefined ? b.priority : 999;
            return priorityA - priorityB;
        });
    }

    /**
     * Sort child category names by product count descending, then Japanese locale name
     */
    function sortChildCategoryNames(categories, countsMap) {
        return [...categories].sort((a, b) => {
            const countA = countsMap[a] || 0;
            const countB = countsMap[b] || 0;
            return countB - countA || a.localeCompare(b, 'ja');
        });
    }

    /**
     * Normalize search text (NFKC, lowercase, katakana -> hiragana)
     */
    function normalizeSearchText(str) {
        if (!str) return '';
        return str
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
            .trim();
    }

    /**
     * Filter visible categories based on visibility flag and product count
     */
    function filterVisibleCategories(groups) {
        return groups.filter(group => {
            if (group.visible === false) return false;
            // 0 products are hidden unless it's "その他／全般"
            if (group.name !== 'その他／全般' && group.productCount !== undefined && group.productCount === 0) return false;
            return true;
        });
    }

    /**
     * Load category data from JSON file
     * @returns {Promise<boolean>} Success status
     */
    async function loadCategoryData() {
        if (dataLoaded) return true;

        try {
            // Determine base path for the JSON file
            const basePathMatch = window.location.pathname.match(/^(\/[^/]+\/)?/);
            const basePath = basePathMatch ? basePathMatch[0] : '/';
            const jsonPath = `${basePath}data/categorygroups.json`;

            const response = await fetch(jsonPath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Transform JSON data into the required structures
            if (data && Array.isArray(data.categoryGroups)) {
                // New format: data.categoryGroups array
                const sortedGroups = sortCategoriesByPriority(data.categoryGroups);
                const visibleGroups = filterVisibleCategories(sortedGroups);

                for (const group of visibleGroups) {
                    const visibleChildren = group.childrenWithCounts
                        ? group.childrenWithCounts
                            .filter(child => child.productCount > 0)
                            .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name, 'ja'))
                        : [];

                    if (visibleChildren.length > 0 || group.name === 'その他／全般' || (group.productCount !== undefined && group.productCount > 0)) {
                        categoryGroups[group.name] = visibleChildren.map(child => child.name);
                        visibleChildren.forEach(child => {
                            categoryCounts[child.name] = child.productCount;
                        });
                        parentCategoryUrls[group.name] = group.slug;
                        if (group.icon) {
                            categoryIcons[group.name] = group.icon;
                        }
                        if (group.productCount !== undefined) {
                            categoryCounts[group.name] = group.productCount;
                        }
                    }
                }
            } else {
                // Legacy format (fallback)
                for (const [groupName, groupData] of Object.entries(data)) {
                    categoryGroups[groupName] = groupData.categories || [];
                    parentCategoryUrls[groupName] = groupData.slug;
                    if (groupData.icon) {
                        categoryIcons[groupName] = groupData.icon;
                    }
                }
            }

            dataLoaded = true;
            return true;
        } catch (error) {
            console.error('Failed to load category data:', error);
            return false;
        }
    }

    let categoryUrls = {};
    let filteredGroups = {};

    function getCategoryUrls() {
        if (Object.keys(categoryUrls).length === 0) {
            const urlDataScript = document.getElementById('category-url-data');
            if (urlDataScript) {
                categoryUrls = JSON.parse(urlDataScript.textContent || '{}');
            }
        }
        return categoryUrls;
    }

    function safeCategoryUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') {
            return '#';
        }
        try {
            var parsed = new URL(rawUrl, window.location.origin);
            // Allow only HTTP(S) URLs and enforce same-origin paths
            if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
                parsed.origin === window.location.origin) {
                return parsed.href;
            }
        } catch (e) {
            // fall through to safe default
        }
        return '#';
    }

    function getFilteredGroups() {
        if (Object.keys(filteredGroups).length === 0) {
            const urls = getCategoryUrls();
            
            // Inject counts from Hugo if available
            const countDataScript = document.getElementById('category-count-data');
            if (countDataScript) {
                const countsFromHugo = JSON.parse(countDataScript.textContent || '{}');
                for (const [cat, count] of Object.entries(countsFromHugo)) {
                    if (categoryCounts[cat] === undefined) {
                        categoryCounts[cat] = count;
                    }
                }
            }

            // Save snapshot of per-category counts BEFORE first pass overwrites
            // group-name keys (e.g. 'その他／全般' group total overwrites child count).
            // The second pass needs the original child-level counts, not the group totals.
            const childCounts = { ...categoryCounts };

            const availableCategories = Object.keys(urls);
            const categorizedItems = new Set();

            // First pass: categorize items into defined groups (case-insensitive)
            for (const [group, categories] of Object.entries(categoryGroups)) {
                let groupProductCount = 0;
                const available = [];
                for (const cat of categories) {
                    const lowerCat = cat.toLowerCase();
                    const matched = availableCategories.find(a => a.toLowerCase() === lowerCat);
                    if (matched) {
                        categorizedItems.add(matched);
                        if (childCounts[matched] !== undefined) {
                            groupProductCount += childCounts[matched];
                        } else if (childCounts[cat] !== undefined) {
                            groupProductCount += childCounts[cat];
                        }
                        // Use the matched availableCategory name to ensure correct URL resolution
                        available.push(matched);
                    }
                }
                if (available.length > 0 || parentCategoryUrls[group]) {
                    filteredGroups[group] = available;
                    groupCounts[group] = groupProductCount;
                }
            }

            // Second pass: add uncategorized items to 'その他／全般'
            const uncategorized = availableCategories.filter(cat => !categorizedItems.has(cat));
            if (uncategorized.length > 0) {
                if (!filteredGroups['その他／全般']) {
                    filteredGroups['その他／全般'] = [];
                }
                filteredGroups['その他／全般'] = [...filteredGroups['その他／全般'], ...uncategorized];

                let othersCount = 0;
                uncategorized.forEach(cat => {
                    if (childCounts[cat] !== undefined) {
                        othersCount += childCounts[cat];
                    }
                });
                groupCounts['その他／全般'] = (groupCounts['その他／全般'] || 0) + othersCount;
            }

            // Sort child categories within every parent group by product count descending
            for (const group of Object.keys(filteredGroups)) {
                filteredGroups[group] = sortChildCategoryNames(filteredGroups[group], childCounts);
            }
        }
        return filteredGroups;
    }

    function populateGroupSelect() {
        const groupSelect = document.getElementById('category-group-select');
        if (!groupSelect) return;

        // Only add options if not already populated
        if (groupSelect.options.length <= 1) {
            const groups = getFilteredGroups();
            Object.keys(groups).forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                const icon = categoryIcons[group];
                option.textContent = icon ? `${icon} ${group}` : group;
                groupSelect.appendChild(option);
            });
        }
    }

    function handleGroupChange(e) {
        if (e.target.id !== 'category-group-select') return;

        const subSelect = document.getElementById('category-sub-select');
        if (!subSelect) return;

        const selectedGroup = e.target.value;
        const groups = getFilteredGroups();

        // Reset sub-select
        subSelect.innerHTML = '<option value="">カテゴリを選択...</option>';
        subSelect.disabled = true;

        if (selectedGroup && groups[selectedGroup]) {
            // Add "View All" option at the top
            const slug = parentCategoryUrls[selectedGroup];
            if (slug) {
                const viewAllOption = document.createElement('option');
                viewAllOption.value = `__all__:${slug}`;
                const parentCount = groupCounts[selectedGroup];
                viewAllOption.textContent = parentCount !== undefined 
                    ? `📁 ${selectedGroup}のすべて (${parentCount})`
                    : `📁 ${selectedGroup}のすべて`;
                viewAllOption.style.fontWeight = 'bold';
                subSelect.appendChild(viewAllOption);
            }

            // Add separator
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '──────────';
            subSelect.appendChild(separator);

            // Add individual categories
            groups[selectedGroup].forEach(category => {
                const option = document.createElement('option');
                option.value = category;

                // Append product count if available
                const count = categoryCounts[category];
                option.textContent = count !== undefined ? `${category} (${count})` : category;

                subSelect.appendChild(option);
            });
            subSelect.disabled = false;
        }
    }

    function safeNavigate(url) {
        if (!url) return;
        try {
            const targetUrl = new URL(url, window.location.origin);
            if (targetUrl.origin === window.location.origin &&
                (targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:')) {
                window.location.href = targetUrl.toString();
            }
        } catch (e) {
            // Invalid URL; do not navigate
        }
    }

    function handleSubChange(e) {
        if (e.target.id !== 'category-sub-select') return;

        const selectedCategory = e.target.value;
        const urls = getCategoryUrls();

        // Check if "View All" option was selected
        if (selectedCategory && selectedCategory.startsWith('__all__:')) {
            const slug = selectedCategory.replace('__all__:', '');
            // Build parent category URL
            const basePathMatch = window.location.pathname.match(/^(\/[^/]+\/)?/);
            const basePath = basePathMatch ? basePathMatch[0] : '/';
            safeNavigate(`${basePath}parent-category/${slug}/`);
            return;
        }

        if (selectedCategory && urls[selectedCategory]) {
            safeNavigate(urls[selectedCategory]);
        }
    }

    function resetDropdowns() {
        const groupSelect = document.getElementById('category-group-select');
        const subSelect = document.getElementById('category-sub-select');

        if (groupSelect) {
            groupSelect.selectedIndex = 0;
        }
        if (subSelect) {
            subSelect.innerHTML = '<option value="">カテゴリを選択...</option>';
            subSelect.disabled = true;
        }
    }

    function createCategoryTag(category, url, isExtra) {
        const tag = document.createElement('a');
        tag.href = safeCategoryUrl(url);
        tag.className = isExtra
            ? 'category-tag-link category-tag-extra category-tag-extra-hidden'
            : 'category-tag-link';
        tag.dataset.categoryName = category;

        const count = categoryCounts[category];
        tag.textContent = count !== undefined ? `${category} (${count})` : category;
        return tag;
    }

    function createExtraToggleButton(extraCount, tagsContainer) {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'category-more-toggle-btn';
        moreBtn.dataset.extraCount = String(extraCount);
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.textContent = `＋ 他 ${extraCount} カテゴリを表示`;

        moreBtn.addEventListener('click', function () {
            const isExpanded = tagsContainer.classList.toggle('category-tags-expanded');
            const extraTags = tagsContainer.querySelectorAll('.category-tag-extra');
            extraTags.forEach(el => {
                el.classList.toggle('category-tag-extra-hidden', !isExpanded);
            });
            this.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            this.textContent = isExpanded
                ? '－ 折りたたむ'
                : `＋ 他 ${extraCount} カテゴリを表示`;
        });

        return moreBtn;
    }

    function populatePopularCategories() {
        const popularGrid = document.getElementById('popular-categories-grid');
        if (!popularGrid) return;

        const groups = getFilteredGroups();
        const urls = getCategoryUrls();

        // Map each child category to its parent group icon as fallback
        const childToGroupIcon = {};
        for (const [groupName, categories] of Object.entries(groups)) {
            if (groupName === 'その他／全般') continue;
            const gIcon = categoryIcons[groupName] || '🏷️';
            for (const cat of categories) {
                if (!childToGroupIcon[cat]) {
                    childToGroupIcon[cat] = gIcon;
                }
            }
        }

        const excludedNames = new Set(['その他／全般', 'その他', '一般']);
        const isOtherBucket = cat => cat.startsWith('その他') || cat.startsWith('未分類');
        const candidates = Object.keys(urls)
            .filter(cat => !excludedNames.has(cat) && !isOtherBucket(cat) && (categoryCounts[cat] || 0) > 0)
            .sort((a, b) => (categoryCounts[b] || 0) - (categoryCounts[a] || 0) || a.localeCompare(b, 'ja'))
            .slice(0, POPULAR_TILE_LIMIT);

        popularGrid.innerHTML = '';

        candidates.forEach(cat => {
            const tile = document.createElement('a');
            tile.href = safeCategoryUrl(urls[cat]);
            tile.className = 'popular-category-tile';
            tile.title = `${cat} (${categoryCounts[cat] || 0}件)`;

            const iconSpan = document.createElement('span');
            iconSpan.className = 'popular-category-tile-icon';
            iconSpan.setAttribute('aria-hidden', 'true');
            iconSpan.textContent = SUBCATEGORY_ICON_MAP[cat] || childToGroupIcon[cat] || '🏷️';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'popular-category-tile-name';
            nameSpan.textContent = SUBCATEGORY_SHORT_LABELS[cat] || cat;

            const countSpan = document.createElement('span');
            countSpan.className = 'popular-category-tile-count';
            countSpan.textContent = `(${categoryCounts[cat] || 0})`;

            tile.appendChild(iconSpan);
            tile.appendChild(nameSpan);
            tile.appendChild(countSpan);
            popularGrid.appendChild(tile);
        });
    }

    function populateGroupedView() {
        const groupedView = document.getElementById('category-grouped-view');
        if (!groupedView) return;

        const groups = getFilteredGroups();
        const urls = getCategoryUrls();

        groupedView.innerHTML = '';

        Object.entries(groups).forEach(([groupName, categories]) => {
            const groupSection = document.createElement('div');
            groupSection.className = 'category-group-section category-collapsed';
            groupSection.dataset.groupName = groupName;

            // Build parent category URL
            const slug = parentCategoryUrls[groupName];
            const basePathMatch = window.location.pathname.match(/^(\/[^/]+\/)?/);
            const basePath = basePathMatch ? basePathMatch[0] : '/';
            const parentUrl = slug ? `${basePath}parent-category/${slug}/` : null;

            // Create heading wrapper (clickable to toggle)
            const headingWrapper = document.createElement('div');
            headingWrapper.className = 'category-heading-wrapper';
            headingWrapper.style.cursor = 'pointer';
            headingWrapper.setAttribute('role', 'button');
            headingWrapper.setAttribute('aria-expanded', 'false');
            headingWrapper.setAttribute('aria-label', `${groupName}を展開`);
            headingWrapper.addEventListener('click', function () {
                const section = this.closest('.category-group-section');
                const isCollapsed = section.classList.contains('category-collapsed');
                section.classList.toggle('category-collapsed');
                this.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
                this.setAttribute('aria-label', isCollapsed ? `${groupName}を折り畳む` : `${groupName}を展開`);
            });

            // Create toggle icon
            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'category-toggle-icon';
            toggleIcon.textContent = '▶';

            // Create heading (display only, not a link)
            const heading = document.createElement('h3');
            heading.className = 'category-group-heading';
            const icon = categoryIcons[groupName];
            heading.textContent = icon ? `${icon} ${groupName}` : groupName;

            headingWrapper.appendChild(toggleIcon);
            headingWrapper.appendChild(heading);
            groupSection.appendChild(headingWrapper);

            // Add "View All" link at the top of child categories (Moved outside tagsContainer to be always visible)
            if (parentUrl) {
                const viewAllTag = document.createElement('a');
                viewAllTag.href = parentUrl;
                viewAllTag.className = 'category-tag-link category-view-all';
                const parentCount = groupCounts[groupName];
                viewAllTag.textContent = parentCount !== undefined
                    ? `📁 ${groupName}のすべて (${parentCount})`
                    : `📁 ${groupName}のすべて`;
                groupSection.appendChild(viewAllTag);
            }

            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'category-tags-container';

            const primaryChildren = categories.filter((cat, idx) => {
                const count = categoryCounts[cat] || 0;
                return idx < PRIMARY_LIMIT && (count >= MIN_PRIMARY_COUNT || idx < 5);
            });
            const extraChildren = categories.slice(primaryChildren.length);

            primaryChildren.forEach(category => {
                tagsContainer.appendChild(createCategoryTag(category, urls[category], false));
            });

            if (extraChildren.length > 0) {
                extraChildren.forEach(category => {
                    tagsContainer.appendChild(createCategoryTag(category, urls[category], true));
                });
                tagsContainer.appendChild(createExtraToggleButton(extraChildren.length, tagsContainer));
            }

            groupSection.appendChild(tagsContainer);
            groupedView.appendChild(groupSection);
        });
    }

    function applyGroupFilterState(section, normalizedQuery) {
        const groupName = section.dataset.groupName || '';
        const headingWrapper = section.querySelector('.category-heading-wrapper');
        const tagsContainer = section.querySelector('.category-tags-container');
        const childTags = tagsContainer ? Array.from(tagsContainer.querySelectorAll('.category-tag-link')) : [];
        const moreBtn = tagsContainer ? tagsContainer.querySelector('.category-more-toggle-btn') : null;

        if (!normalizedQuery) {
            section.hidden = false;
            section.classList.add('category-collapsed');
            if (headingWrapper) {
                headingWrapper.setAttribute('aria-expanded', 'false');
                headingWrapper.setAttribute('aria-label', `${groupName}を展開`);
            }
            const isExpanded = tagsContainer?.classList.contains('category-tags-expanded') || false;
            childTags.forEach(tag => {
                tag.classList.remove('category-tag-highlight', 'category-tag-filter-hidden');
                if (tag.classList.contains('category-tag-extra')) {
                    tag.classList.toggle('category-tag-extra-hidden', !isExpanded);
                }
            });
            if (moreBtn) {
                moreBtn.hidden = false;
            }
            return true;
        }

        const groupMatches = normalizeSearchText(groupName).includes(normalizedQuery);
        let matchingChildrenCount = 0;

        childTags.forEach(tag => {
            const catName = tag.dataset.categoryName || '';
            const isMatch = normalizeSearchText(catName).includes(normalizedQuery);
            tag.classList.toggle('category-tag-highlight', isMatch);
            if (isMatch) {
                matchingChildrenCount += 1;
                tag.classList.remove('category-tag-extra-hidden', 'category-tag-filter-hidden');
            } else if (groupMatches) {
                tag.classList.remove('category-tag-filter-hidden');
            } else {
                tag.classList.add('category-tag-filter-hidden');
            }
        });

        const hasMatch = groupMatches || matchingChildrenCount > 0;
        section.hidden = !hasMatch;

        if (hasMatch) {
            section.classList.remove('category-collapsed');
            if (headingWrapper) {
                headingWrapper.setAttribute('aria-expanded', 'true');
                headingWrapper.setAttribute('aria-label', `${groupName}を折り畳む`);
            }
            if (moreBtn) {
                moreBtn.hidden = !groupMatches;
            }
        }

        return hasMatch;
    }

    function initCategoryFilter() {
        const filterInput = document.getElementById('category-filter-input');
        const clearBtn = document.getElementById('category-filter-clear');
        const emptyMsg = document.getElementById('category-filter-empty');
        const groupedView = document.getElementById('category-grouped-view');

        if (!filterInput || !groupedView) return;

        function runFilter() {
            const rawQuery = filterInput.value || '';
            const normalizedQuery = normalizeSearchText(rawQuery);
            if (clearBtn) {
                clearBtn.hidden = normalizedQuery.length === 0;
            }

            const sections = groupedView.querySelectorAll('.category-group-section');
            let matchedSections = 0;
            sections.forEach(section => {
                if (applyGroupFilterState(section, normalizedQuery)) {
                    matchedSections += 1;
                }
            });

            if (emptyMsg) {
                emptyMsg.hidden = matchedSections > 0;
            }
        }

        filterInput.addEventListener('input', runFilter);

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                filterInput.value = '';
                runFilter();
                filterInput.focus();
            });
        }
    }

    async function init() {
        // Load category data from JSON before initializing UI
        const success = await loadCategoryData();
        if (!success) {
            console.error('Category dropdown initialization failed: could not load data');
            return;
        }

        populateGroupSelect();
        populatePopularCategories();
        populateGroupedView();
        initCategoryFilter();
    }

    // Use event delegation on document for reliable event handling
    document.addEventListener('change', handleGroupChange);
    document.addEventListener('change', handleSubChange);

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Handle bfcache restoration - always reset dropdowns when page is shown
    window.addEventListener('pageshow', function (event) {
        resetDropdowns();
    });
})();
