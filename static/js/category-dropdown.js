/**
 * Category Dropdown - Hierarchical category navigation for mobile
 * Uses event delegation for reliable behavior after bfcache restoration
 */
(function () {
    // Category group mapping - Parent groups to child categories
    const categoryGroups = {
        'PC・周辺機器': [
            'マウス', 'マウスパッド', 'ディスプレイ', 'ゲーミングモニター',
            'ドッキングステーション', 'PC用マイク', 'メディアドライブ',
            'セキュリティロック', 'リストレスト', 'ノートPC、ディスプレイ・モニター',
            '家電・PC・周辺機器'
        ],
        'スマートフォン': [
            'スマホケース・カバー', 'iPhoneケース / フィルム', 'スマートフォン関連製品',
            '携帯電話ホルダー', '交換用ベルト', 'スマートウォッチ', 'タブレット'
        ],
        'オーディオ': [
            'イヤホン', 'オープンイヤーヘッドホン', 'ゲーム用ヘッドセット',
            'ヘッドホン延長ケーブル', 'ステレオケーブル'
        ],
        'ケーブル・ネットワーク': [
            'USBケーブル', 'Wi-Fiルーター', '無線・有線LANルーター',
            '無線・有線LAN中継器', '電源タップ'
        ],
        '家電': [
            '生活家電', '季節・空調家電', '加湿器', 'ワンルーム用加湿器',
            'ホームプロジェクター', '4K対応テレビ', 'マッサージャーほか健康家電'
        ],
        '美容・健康': [
            'ビューティー', 'ヘアケア', 'ヘアドライヤー', 'ファンデーション',
            'ボディケア', '保湿ミスト・スプレー', '理美容・健康家電',
            'パントリー スキンケア・ボディケア', 'おしゃれカラコン'
        ],
        'サプリメント': [
            'プロテイン', 'ホエイプロテイン', 'サプリメント・ビタミン',
            'マルチビタミン', 'マルチ脂肪酸'
        ],
        'キッチン': [
            'キッチン家電', 'キッチン ストア', 'コーヒーメーカー', 'コーヒー用品',
            '使い捨てコーヒーフィルター', 'タンブラーグラス', 'ホーム＆キッチン'
        ],
        '収納・オフィス': [
            'スチールラック本体', 'オフィスワークテーブル', 'ケーブルオーガナイザーバッグ',
            'ケース', 'スリーブ'
        ],
        'ファッション': [
            'メンズシューズ', 'ベスト'
        ],
        'その他': [
            'ドリンク', '車＆バイク', 'Nintendo Switch2/Switch', 'ギターアクセサリ',
            'スポーツ・アウトドア', '出産祝い', 'エアブローガン', 'あわせ買い',
            'ワイヤレス', 'ミニ'
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
            for (const [group, categories] of Object.entries(categoryGroups)) {
                const available = categories.filter(cat => availableCategories.includes(cat));
                if (available.length > 0) {
                    filteredGroups[group] = available;
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

    function init() {
        populateGroupSelect();
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
