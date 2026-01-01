/**
 * Category Dropdown - Hierarchical category navigation for mobile
 * Uses event delegation for reliable behavior after bfcache restoration
 */
(function () {
    // Category group mapping - Parent groups to child categories
    const categoryGroups = {
        // --- IT & デバイス ---
        'PC・周辺機器': [
            '4K モニター', 'PC用マイク', 'USBケーブル', 'ゲーミングモニター',
            'スタンダードモニター', 'セキュリティロック', 'ディスプレイ', 'ドッキングステーション',
            'ノートPC、ディスプレイ・モニター', 'マウス', 'マウスパッド',
            'メディアドライブ', 'リストレスト', '家電・PC・周辺機器', '標準型ノートパソコン'
        ],
        'スマートフォン': [
            'AC式充電器', 'iPhoneケース / フィルム', 'IPhoneケース / フィルム', 'スタンド', 'スマートウォッチ', 'スマートフォン関連製品',
            'スマホケース・カバー', 'スマホ本体', 'タブレット', '携帯電話ホルダー', '交換用ベルト'
        ],
        'オーディオ': [
            'イヤホン', 'イヤホン・ヘッドホン', 'オープンイヤーヘッドホン',
            'オーバーイヤーヘッドホン', 'ゲーム用ヘッドセット', 'ゲーミングヘッドセット',
            'ステレオケーブル', 'ヘッドホン延長ケーブル'
        ],
        'ケーブル・ネットワーク': [
            'Wi-Fiルーター', 'ルーター・ネットワーク機器', '無線・有線LANルーター', '無線・有線LAN中継器', '電源タップ'
        ],

        // --- 生活 & 家電 ---
        '家電': [
            '4K対応テレビ', '季節・空調家電', '加湿器', '生活家電',
            'ホームプロジェクター', 'マッサージャーほか健康家電', 'ワンルーム用加湿器'
        ],
        'キッチン・食品': [
            'キッチン家電', 'キッチン ストア', 'コーヒーメーカー', 'コーヒー用品',
            '使い捨てコーヒーフィルター', 'タンブラーグラス', 'ドリンク', 'ホーム＆キッチン',
            '食品・飲料・お酒のみ'
        ],
        '収納・オフィス': [
            'オフィスワークテーブル', 'ケース', 'ケーブルオーガナイザーバッグ',
            'スチールラック本体', 'スリーブ'
        ],

        // --- 美容 & ファッション ---
        '美容・健康': [
            'おしゃれカラコン', 'スキンケア・ボディケア', 'パントリー スキンケア・ボディケア',
            'ビューティー', 'ファンデーション', 'ヘアケア', 'ヘアドライヤー',
            'ボディケア', '保湿ミスト・スプレー', '肌・髪のお悩み', '理美容・健康家電'
        ],
        'サプリメント': [
            'サプリメント・ビタミン', 'プロテイン', 'マルチビタミン', 'マルチ脂肪酸', 'ホエイプロテイン'
        ],
        'ファッション': [
            'ベスト', 'メンズシューズ'
        ],

        // --- レジャー & その他 ---
        'アウトドア・車': [
            'アウトドア ・キャンプ・旅行商材', 'スポーツ・アウトドア', '車・バイク', '車＆バイク'
        ],
        'その他': [
            'Nintendo Switch2/Switch', 'エアブローガン', 'ギターアクセサリ', 'ミニ', 'ワイヤレス'
        ]
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
                });
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
                filteredGroups['その他'] = [...filteredGroups['その他'], ...uncategorized];
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
            groups[selectedGroup].forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                subSelect.appendChild(option);
            });
            subSelect.disabled = false;
        }
    }

    function handleSubChange(e) {
        if (e.target.id !== 'category-sub-select') return;

        const selectedCategory = e.target.value;
        const urls = getCategoryUrls();

        if (selectedCategory && urls[selectedCategory]) {
            window.location.href = urls[selectedCategory];
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
            groupSection.className = 'category-group-section';

            const heading = document.createElement('h3');
            heading.className = 'category-group-heading';
            heading.textContent = groupName;
            groupSection.appendChild(heading);

            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'category-tags-container';

            categories.forEach(category => {
                const tag = document.createElement('a');
                tag.href = urls[category];
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
