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
    let dataLoaded = false;

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
                        ? group.childrenWithCounts.filter(child => child.productCount > 0)
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

            const availableCategories = Object.keys(urls);
            const categorizedItems = new Set();

            // First pass: categorize items into defined groups
            for (const [group, categories] of Object.entries(categoryGroups)) {
                let groupProductCount = 0;
                const available = categories.filter(cat => {
                    if (availableCategories.includes(cat)) {
                        categorizedItems.add(cat);
                        if (categoryCounts[cat] !== undefined) {
                            groupProductCount += categoryCounts[cat];
                        }
                        return true;
                    }
                    return false;
                }).filter(Boolean);
                if (available.length > 0 || parentCategoryUrls[group]) {
                    filteredGroups[group] = available;
                    if (categoryCounts[group] === undefined) {
                        categoryCounts[group] = groupProductCount;
                    }
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
                    // 「その他／全般」カテゴリ自身は「その他／全般」グループに合算しない（重複防止）
                    if (cat !== 'その他／全般' && categoryCounts[cat] !== undefined) {
                        othersCount += categoryCounts[cat];
                    }
                });
                if (categoryCounts['その他／全般'] === undefined) {
                    categoryCounts['その他／全般'] = othersCount;
                } else {
                    categoryCounts['その他／全般'] += othersCount;
                }
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
                const parentCount = categoryCounts[selectedGroup];
                viewAllOption.textContent = parentCount !== undefined 
                    ? `📁 ${selectedGroup}のすべてを見る (${parentCount})`
                    : `📁 ${selectedGroup}のすべてを見る`;
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

    function populateGroupedView() {
        const groupedView = document.getElementById('category-grouped-view');
        if (!groupedView) return;

        const groups = getFilteredGroups();
        const urls = getCategoryUrls();

        groupedView.innerHTML = '';

        Object.entries(groups).forEach(([groupName, categories]) => {
            const groupSection = document.createElement('div');
            groupSection.className = 'category-group-section category-collapsed';

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
                const parentCount = categoryCounts[groupName];
                viewAllTag.textContent = parentCount !== undefined
                    ? `📁 ${groupName}のすべてを見る (${parentCount})`
                    : `📁 ${groupName}のすべてを見る`;
                groupSection.appendChild(viewAllTag);
            }

            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'category-tags-container';

            categories.forEach(category => {

                const tag = document.createElement('a');
                tag.href = safeCategoryUrl(urls[category]);
                tag.className = 'category-tag-link';

                // Append product count if available
                const count = categoryCounts[category];
                tag.textContent = count !== undefined ? `${category} (${count})` : category;

                tagsContainer.appendChild(tag);
            });

            groupSection.appendChild(tagsContainer);
            groupedView.appendChild(groupSection);
        });
    }

    async function init() {
        // Load category data from JSON before initializing UI
        const success = await loadCategoryData();
        if (!success) {
            console.error('Category dropdown initialization failed: could not load data');
            return;
        }

        populateGroupSelect();
        populateGroupedView();
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
