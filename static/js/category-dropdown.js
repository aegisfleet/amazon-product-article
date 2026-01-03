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
            '4K モニター', 'PC用マイク', 'クリエイティブ・メディア', 'ゲーミングモニター', 'スタンダードモニター',
            'スリーブ', 'セキュリティロック', 'ディスプレイ', 'トラックボール',
            'ドッキングステーション', 'パソコン', '標準型ノートパソコン', 'マウス', 'マウスパッド',
            'ミニ', 'メディアドライブ', 'リストレスト'
        ],
        'スマートフォン': [
            'AC式充電器', 'Androidタブレット', 'IPhoneケース / フィルム', 'iPhoneケース / フィルム',
            'ケース', 'スタンド', 'スマホケース・カバー', 'スマホ本体',
            'スマートウォッチ', 'スマートフォン関連製品', 'タブレット', '交換用ベルト',
            '携帯電話ホルダー'
        ],
        'オーディオ': [
            'イヤホン', 'イヤホン・ヘッドホン', 'オーバーイヤーヘッドホン',
            'オープンイヤーヘッドホン', 'ゲーミングヘッドセット', 'ゲーム用ヘッドセット',
            'ステレオケーブル', 'ヘッドホン延長ケーブル'
        ],
        'ケーブル・ネットワーク': [
            'USBケーブル', 'Wi-Fiルーター', 'ケーブルオーガナイザーバッグ',
            'ルーター・ネットワーク機器', '無線・有線LANルーター', '無線・有線LAN中継器', '電源タップ'
        ],

        // --- 生活 & 家電 ---
        '家電': [
            '4K対応テレビ', 'HEPA空気清浄機', '一酸化炭素検知器', 'エアブローガン',
            '大型家電', '加湿器', '加湿器用フィルタ', '季節・空調家電', '空気清浄機用アクセサリ',
            '空気清浄機用フィルタ', '据付脚', 'スティッククリーナー', '静電式空気清浄機', '洗濯機',
            '洗濯機・乾燥機', '生活家電', 'ヒーター・加湿器', 'ホームプロジェクター',
            'ワンルーム用加湿器'
        ],
        'ホーム・キッチン・食品': [
            'エコバッグ・買い物バッグ', 'お弁当箱・水筒', '置き型', 'キッチン ストア', 'キッチンクリーナー剤',
            'キッチン家電', 'キッチン用品', 'グラス・マグ', 'コーヒーメーカー',
            'コーヒー用品', '食器・ボトル・カトラリー', '使い捨てコーヒーフィルター', 'タオル',
            'タンブラーグラス', 'ちりとり', '調理小物', 'トイレットペーパー',
            'ドリンク', '電子レンジ調理用品', '鍋・フライパン', '保存容器・調味料入れ',
            '保存用バッグ・ポリ袋', '仏前ろうそく', 'ペーパー・キッチン用品', '弁当箱',
            'ホーム＆キッチン', 'ホーム・日用品', 'リビング'
        ],
        '収納・オフィス': [
            'オフィスワークテーブル', 'オープンシェルフ・ラック', 'キッチンワゴン・収納カート',
            'スチールラック本体', 'デスクチェア'
        ],

        // --- 美容 & ファッション ---
        '美容・健康': [
            'おしゃれカラコン', 'クレンジング', 'クレンジングオイル', 'スキンケア',
            'スキンケア・ボディケア', 'スキンケア・基礎化粧品', 'スペシャルケア',
            'スポーツケア用品', 'テカリ対策', 'パントリー スキンケア・ボディケア',
            'ビューティー', 'ファンデーション', 'フットマッサージャー', 'ヘアケア',
            'ヘアストレートナー', 'ヘアドライヤー', 'ベースメイク', 'ボディケア',
            'メイク', 'マッサージ・ツボ押しグッズ', 'メイクアップ', 'ヨガ・ストレッチ・骨盤矯正',
            '保湿ミスト・スプレー', '理美容・健康家電', '理美容家電',
            '磁気・チタン・ゲルマニウムアクセサリー', '鍼・灸'
        ],
        'サプリメント': [
            'サプリメント・ビタミン', 'ビタミンC', 'ビタミン・サプリメント', 'プロテイン',
            'ホエイプロテイン', 'マルチビタミン', 'マルチミネラル', 'マルチ脂肪酸', '亜鉛'
        ],
        'ファッション': [
            'インソール', 'トートバッグ', 'パジャマ・ルームウェアボトムス', 'ベスト', 'ベビーおむつ',
            'ベビー・マタニティ', 'ボーイズ', 'メンズシューズ'
        ],

        // --- ゲーム & エンタメ ---
        'ゲーム・おもちゃ': [
            'Nintendo Switch2/Switch', 'ゲーム機本体', 'ゲームソフト', 'ハンドル・ジョイスティック', '知育・学習玩具'
        ],
        '音楽・エンタメ': [
            '初心者楽器', 'ビクターエンタテインメント', 'ミュージックCD・レコード', 'ユニバーサルミュージック', 'ワーナーミュージック・ジャパン'
        ],

        // --- レジャー & その他 ---
        'アウトドア・車': [
            'アウトドア ・キャンプ・旅行商材', '車・バイク', '収納・ホルダー',
            'スポーツ・アウトドア', '燃料', 'ライト・ランタン'
        ],
        'その他': [
            'ギターアクセサリ', 'ペットトイレ用品', 'ワイヤレス'
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
