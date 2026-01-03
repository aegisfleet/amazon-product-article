/**
 * Category Dropdown - Hierarchical category navigation for mobile
 * Uses event delegation for reliable behavior after bfcache restoration
 */
(function () {
    // Category group mapping - Parent groups to child categories
    // ⚠️ 重要: このリストを更新する際は data/categorygroups.json も同時に更新してください
    // 両ファイルは同一の内容を維持する必要があります（詳細は AGENTS.md を参照）
    const categoryGroups = {
        // --- IT & デバイス ---
        'PC・周辺機器': [
            'PC用マイク', 'ウェブカメラ', 'ゲーミングモニター', 'スタンダードモニター',
            'スリーブ', 'セキュリティロック', 'ディスプレイ', 'トラックボール',
            'ドッキングステーション', 'パソコン', 'パソコン用キーボード', '標準型ノートパソコン', 'マウス', 'マウスパッド',
            'ミニ', 'メディアドライブ', 'リストレスト', '外付サウンドカード'
        ],
        'スマートフォン': [
            'AC式充電器', 'Androidタブレット',
            'ケース', 'スタンド', 'スマホ本体',
            'スマートウォッチ', 'スマートフォン関連製品', 'タブレット', 'モバイルバッテリー', '交換用ベルト',
            '携帯電話ホルダー'
        ],
        'オーディオ': [
            'イヤホン', 'オーバーイヤーヘッドホン',
            'オープンイヤーヘッドホン', 'ゲーミングヘッドセット', 'ゲーム用ヘッドセット',
            'ステレオケーブル', 'ヘッドホン延長ケーブル'
        ],
        'ケーブル・ネットワーク': [
            'USBケーブル', 'ケーブルオーガナイザーバッグ', '電源タップ'
        ],

        // --- 生活 & 家電 ---
        '家電': [
            '4K対応テレビ', 'HEPA空気清浄機', '一酸化炭素検知器', 'エアブローガン',
            'スチーム方式', 'スティッククリーナー', '大型家電', '加湿器', '加湿器用フィルタ', '空気清浄機用アクセサリ',
            '空気清浄機用フィルタ', '据付脚', '静電式空気清浄機', '洗濯機', '洗濯乾燥機',
            '生活家電', '足温器', 'ホームプロジェクター', '冷蔵庫',
            'ワンルーム用加湿器'
        ],
        'ホーム・キッチン・食品': [
            '置き型', 'キッチンクリーナー剤',
            'キッチン家電', 'キッチン用品', 'コーヒーメーカー', 'コーヒー用品', 'タオル', 'タンブラーグラス',
            'ちりとり', '使い捨てコーヒーフィルター', '時短キッチングッズ', '食品', '真空断熱タンブラー', '調理小物', '電子レンジ調理用品',
            'トイレットペーパー', 'ドリンク', '鍋', '仏前ろうそく', '弁当箱', '保存容器', 'リビング'
        ],
        '収納・オフィス': [
            'オフィスワークテーブル', 'ジュエリー収納', 'スチールラック本体', 'デスクチェア', '屋内防犯カメラ'
        ],

        // --- 美容 & ファッション ---
        '美容・健康': [
            'おしゃれカラコン', 'クレンジング', 'クレンジングオイル', 'サポーター',
            '磁気・チタン・ゲルマニウムアクセサリー', 'スキンケア',
            'スペシャルケア',
            'スポーツケア用品', 'テカリ対策', 'ビューティー',
            'ファンデーション', 'フィットネス', 'フェイスケア', 'フットマッサージャー', 'ヘアケア',
            'ヘアストレートナー', 'ヘアドライヤー', 'ベースメイク',
            'ボディケア', '保湿ミスト・スプレー',
            'メイクアップ', '理美容家電'
        ],
        'サプリメント': [
            'ビタミンC', 'プロテイン',
            'ホエイプロテイン', 'マルチビタミン', 'マルチビタミン&ミネラル', 'マルチミネラル', 'マルチ脂肪酸', '亜鉛'
        ],
        'ファッション': [
            'アスレティックウェア', 'インソール', 'エコバッグ', 'チャイルドシート', 'トートバッグ', 'ベスト', 'ベビーおむつ',
            'ベビー家具', 'ボーイズ', 'マット', 'メンズシューズ', 'ルームウェア'
        ],

        // --- ゲーム & エンタメ ---
        'ゲーム・おもちゃ': [
            'ゲーム機本体', 'ゲームソフト'
        ],
        '音楽・エンタメ': [
            'ギターアクセサリ', '初心者楽器', 'ビクターエンタテインメント', 'ユニバーサルミュージック'
        ],

        // --- レジャー & その他 ---
        'アウトドア・車': [
            'LEDランタン', 'アウトドア用エアーマット', '釣り', '燃料', 'ドライブ便利アイテム', '乗用車スノーチェーン', 'ライト・ランタン'
        ],
        'その他': [
            'エレコム', '研究開発用品', 'ペットトイレ用品', 'ワイヤレス'
        ]
    };

    // Parent category URL slugs mapping
    const parentCategoryUrls = {
        'PC・周辺機器': 'pc-peripherals',
        'スマートフォン': 'smartphone',
        'オーディオ': 'audio',
        'ケーブル・ネットワーク': 'cable-network',
        '家電': 'home-appliances',
        'ホーム・キッチン・食品': 'home-kitchen-food',
        '収納・オフィス': 'storage-office',
        '美容・健康': 'beauty-health',
        'サプリメント': 'supplements',
        'ファッション': 'fashion',
        'ゲーム・おもちゃ': 'games-toys',
        '音楽・エンタメ': 'music-entertainment',
        'アウトドア・車': 'outdoor-car',
        'その他': 'others'
    };

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
            const availableCategories = Object.keys(urls);
            const categorizedItems = new Set();

            // First pass: categorize items into defined groups
            for (const [group, categories] of Object.entries(categoryGroups)) {
                const available = categories.filter(cat => {
                    if (availableCategories.includes(cat)) {
                        categorizedItems.add(cat);
                        return true;
                    }
                    return false;
                }).sort((a, b) => a.localeCompare('ja'));
                if (available.length > 0) {
                    filteredGroups[group] = available;
                }
            }

            // Second pass: add uncategorized items to 'その他'
            const uncategorized = availableCategories.filter(cat => !categorizedItems.has(cat));
            if (uncategorized.length > 0) {
                if (!filteredGroups['その他']) {
                    filteredGroups['その他'] = [];
                }
                filteredGroups['その他'] = [...filteredGroups['その他'], ...uncategorized].sort((a, b) => a.localeCompare('ja'));
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
                option.textContent = group;
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
                viewAllOption.textContent = `📁 ${selectedGroup}のすべてを見る`;
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
                option.textContent = category;
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
            heading.textContent = groupName;

            headingWrapper.appendChild(toggleIcon);
            headingWrapper.appendChild(heading);
            groupSection.appendChild(headingWrapper);

            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'category-tags-container';

            // Add "View All" link at the top of child categories
            if (parentUrl) {
                const viewAllTag = document.createElement('a');
                viewAllTag.href = parentUrl;
                viewAllTag.className = 'category-tag-link category-view-all';
                viewAllTag.textContent = `📁 ${groupName}のすべてを見る`;
                tagsContainer.appendChild(viewAllTag);
            }

            categories.forEach(category => {
                const tag = document.createElement('a');
                tag.href = safeCategoryUrl(urls[category]);
                tag.className = 'category-tag-link';
                tag.textContent = category;
                tagsContainer.appendChild(tag);
            });

            groupSection.appendChild(tagsContainer);
            groupedView.appendChild(groupSection);
        });
    }

    function init() {
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
