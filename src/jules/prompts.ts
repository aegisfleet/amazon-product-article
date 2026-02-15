import { Product } from '../types/Product';

/**
 * Jules Investigation Prompts
 *
 * Handles the generation of prompts for the Jules API investigation sessions.
 */

/**
 * 調査プロンプトを生成
 */
export function formatInvestigationPrompt(product: Product): string {
  // JSTで現在の日付を取得 (YYYY-MM-DD)
  const today = new Date().toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\//g, '-');

  // ブランド情報の取得
  const brand = product.brand;
  const brandInfo = brand ? `- ブランド: ${brand}` : '';
  const parentAsinInfo = product.parentAsin ? `- 親ASIN: ${product.parentAsin}` : '';

  // 安全性・信頼性が重要なカテゴリ判定
  const safetySensitiveCategories = [
    '美容', 'beauty',
    '健康', 'health',
    'サプリメント', 'supplements',
    '食品', 'food',
    'ベビー', 'baby',
    'スキンケア', 'skincare',
    '医薬品', 'medicine',
    'ペット用品', 'pet',
    'コンタクト', 'contact lens'
  ];

  const isSafetySensitive = safetySensitiveCategories.some(cat =>
    product.category.toLowerCase().includes(cat) ||
    product.title.toLowerCase().includes(cat)
  );

  let scoringRubric: string;

  if (isSafetySensitive) {
    scoringRubric = `
2. **加減点カテゴリと配分幅 (美容・健康・食品用)**:
   - **安全性・信頼性 (-20 〜 +10点)**: 【最重要】成分、製造品質、ブランド信頼性、副作用リスク。不安要素がある場合は大きく減点。
   - **コストパフォーマンス (-10 〜 +10点)**: 安全性が確保された上での価格対効果。安くても怪しい商品は評価しない。
   - **性能・効果 (-10 〜 +10点)**: 期待される効果、スペック、実用性。
   - **品質・デザイン (-5 〜 +5点)**: パッケージ、質感、使いやすさ。
   - **ユーザー満足度 (-10 〜 +10点)**: レビュー、リピート率、サポート体制。
   - **独自の強み・先進性 (0 〜 +10点)**: 他にない成分、革新的な技術。`;
  } else {
    scoringRubric = `
2. **加減点カテゴリと配分幅**:
   - **性能・機能 (-10 〜 +10点)**: スペック、実用性、使い勝手
   - **コストパフォーマンス (-15 〜 +15点)**: 価格対性能、競合との価格差（最重視）
   - **品質・デザイン (-5 〜 +5点)**: ビルドクオリティ、質感、美しさ
   - **ユーザー満足度 (-10 〜 +10点)**: レビュー、信頼性、サポート体制
   - **独自の強み・先進性 (0 〜 +10点)**: 他にない革新的な機能、独自の価値`;
  }

  const prompt = `【基本ルール】
- 全ての出力は日本語で記述すること
- 認証情報は絶対にログ・ファイル・コミット・PR説明文に含めないこと
- コミット対象は \`data/investigations/${product.asin}.json\` のみ

---

## 既存の調査データを確認
\`\`\`bash
cat data/investigations/${product.asin}.json 2>/dev/null || echo "新規調査"
\`\`\`
- ファイルが存在する場合: 既存データをベースに更新してください
- ファイルが存在しない場合: 新規調査を行ってください

2. **既存データがある場合の更新ルール**
   - 既存の「良い点」「悪い点」が現在も有効か検証し、維持または更新
   - 新しいレビューや競合商品の情報を追加
   - \`lastInvestigated\` フィールドを \`${today}\` に更新

---

【Creators API利用】
環境変数（AMAZON_CREATORS_APPLICATION_ID, AMAZON_CREATORS_CREDENTIAL_ID, AMAZON_CREATORS_CREDENTIAL_SECRET, AMAZON_PARTNER_TAG）で認証。
エンドポイント: https://webservices.amazon.co.jp/creators/v1/items（日本リージョン）

調査用スクリプト（**編集は絶対禁止・そのまま使用すること**）:
- 商品詳細: \`python scripts/creators_get_item.py <ASIN>\` → tmp/product_info.json
- 競合検索: \`python scripts/creators_search_items.py "キーワード" --search-index <カテゴリ>\` → tmp/search_results.json

※ --search-index オプションでカテゴリ指定可能:
   - Electronics (家電), HomeAndKitchen (キッチン/家具), Appliances (冷蔵庫等)
   - GroceryAndGourmetFood (食品/飲料/冷凍弁当), HealthPersonalCare (漢方/ドラッグストア)
   - Fashion (服), ToolsAndHomeImprovement (DIY/電動工具), Toys, Books, SportsAndOutdoors 等
   - 不明な場合は All を使用
※ tmp/ 内のファイルは .gitignore 対象のため、調査完了後のクリーンアップ不要

**調査対象**: 商品「${product.title}」
現在の日付: ${today}

【最優先事項：調査の継続と完了】
レビューや情報が見つからなくても**絶対に調査を中断しないこと**。Amazon 403エラー時もGoogle検索で継続。
禁止: 「調査不能」報告、カテゴリ一般論、「〇〇市場の分析」のようなタイトル
必須: 商品仕様・機能からの推測分析、競合比較による立ち位置分析、JSON形式での出力

----

以下の観点で調査・分析を行ってください：

0. **商品概要と使い方**（サイト上部に表示する最重要情報）
   - **productName**: 正式な商品名（検索タグやSEOキーワードを除いた簡潔な名前）
     例：「Syncwire 3.5mm 4極オーディオ延長ケーブル 1.2m (2本セット)」
     ※ Amazonの商品タイトルには「【2本セット】【マイク対応】延長ケーブル ヘッドホン...」のような検索用タグが含まれることがありますが、ここでは「商品本来の名前」を記載してください
   - **productDescription**: この商品は何か、1-2文で簡潔に説明（例：「〇〇は、△△用の□□です。」）
   - **productUsage**: 主な使い方・用途を3-5項目で箇条書き
   - これはサイトの最上部に表示される情報なので、ユーザーが商品を理解しやすい説明にしてください

1. ユーザーレビュー（"Voice of the Customer"）
   ⇒ Amazon以外のレビューサイト（価格.com、みんなのレビュー等）も積極的に調査
   - 具体的な使用体験と満足ポイント（単なる機能列挙ではなく、体験として記述）
   - 問題点と改善要望
   - 使用シーン：どのような場面で活用されているか

2. ユーザーストーリーと実体験
   - 購入背景・生活変化・具体的エピソード（成功・失敗両方）
   - 出典明記: 実レビュー→出典記載 / 推測→experienceに「（推測）」明記
   - **userStoriesに実体験記載＆「レビュー不在」記載は矛盾 → 絶対禁止**

3. 競合商品との比較
   - 同カテゴリの主要競合商品3-5点
   - 価格、機能、品質の比較
   - 差別化ポイントの特定
   - **【必須】各競合商品のASINを必ず特定してください**（アフィリエイトリンク生成に使用）
   - **Creators APIのSearchItemsエンドポイントを使用して競合商品を検索し、ASINを取得してください**
   - ASINが見つからない場合は "asin": null と記載

4. 購買推奨度
   - どのようなユーザーに適しているか
   - 購入時の注意点
   - コストパフォーマンス評価
   - スコア算出（後述の基準に従うこと）

5. 情報ソース
   - 具体的サイト名・記事タイトル・URL（「Category Analysis」等の抽象名は禁止）
   - 例：「価格.com: [商品名] クチコミ」「The Verge Review」など

商品情報：
- ASIN: ${product.asin}
- 商品名: ${product.title}
${brandInfo}
${parentAsinInfo}
- カテゴリ: ${product.category}
- 価格: ${product.price.formatted}
- 仕様・詳細:
${Object.entries(product.specifications).map(([key, value]) => `  - ${key}: ${value}`).join('\n')}

【スコア算出の標準化ガイドライン】
総合評価スコア（0-100点）は、以下の「標準化ルーブリック」に厳格に従って算出してください。個人の感覚ではなく、定量的・論理的な計算過程を \`scoreRationale\` に明記することが必須です。

1. **基本点: 70点**
   - 全ての商品は70点（「期待通りで、標準的に満足できるレベル」）から計算を開始します。

${scoringRubric}

3. **\`scoreRationale\` の記述形式 (厳守)**:
   以下のフォーマットで、計算過程を一行ずつ記述してください。
   \`\`\`
   [基本点: 70]
   [加点: +XX] (理由を簡潔に記述)
   [減点: -XX] (理由を簡潔に記述)
   ...
   [合計: XX] (最終的なスコア)
   \`\`\`

- 素晴らしい商品には95点以上、重大な欠陥がある商品には厳しく低い点数をつけてください。
- 加減点がないカテゴリは省略して構いませんが、合計点は必ず一致させてください。

    調査結果は以下のJSON形式で構造化して提供してください。
    なお、ファイル名は "data/investigations/${product.asin}.json" としてください：
    \`\`\`json
{
  "analysis": {
    "productName": "正式な商品名（検索タグを除いた簡潔な名前）",
    "parentAsin": "${product.parentAsin || product.asin}",
    "productDescription": "この商品が何かを1-2文で簡潔に説明",
    "productUsage": ["使い方1", "使い方2", "使い方3"],
    "positivePoints": ["具体的な良い点1", "具体的な良い点2"],
    "negativePoints": ["具体的な問題点1", "具体的な問題点2"],
    "useCases": ["使用シーン1", "使用シーン2"],
    "userStories": [
      {
        "userType": "ユーザー属性（例：30代会社員、主婦、学生）",
        "scenario": "使用シチュエーション",
        "experience": "具体的な体験談・ストーリー",
        "sentiment": "positive" | "negative" | "mixed"
      }
    ],
    "userImpression": "ユーザーの総評・全体的な感想のまとめ",
    "sources": [
      {
        "name": "具体的な記事タイトルまたはサイト名（例：The Verge Review）。抽象的な名称（Category Analysis等）は避けること。",
        "url": "https://...（可能な限り具体的なURLを記載。ない場合のみnull）",
        "credibility": "信頼性評価"
      }
    ],
    "lastInvestigated": "YYYY-MM-DD",
    "competitiveAnalysis": [
      {
        "name": "競合商品名",
        "asin": "B0XXXXXXXX または null（ASINが特定できる場合は必ず記載）",
        "priceComparison": "価格比較の説明",
        "featureComparison": ["機能比較1", "機能比較2"],
        "differentiators": ["差別化ポイント1", "差別化ポイント2"]
      }
    ],
    "recommendation": {
      "targetUsers": ["推奨ユーザー1", "推奨ユーザー2"],
      "pros": ["購入メリット1", "購入メリット2"],
      "cons": ["購入時の注意点1", "購入時の注意点2"],
      "score": 0,
      "scoreRationale": "ここになぜこのスコアにしたのか、加点・減点の理由を具体的に記述してください（例：機能は完璧だが価格が高すぎるため-10点、など）"
    }
  }
}
\`\`\`

**【technicalSpecs: 詳細スペック抽出】**
上記JSONの "recommendation" の後に "technicalSpecs" フィールドも追加してください。
商品カテゴリに応じて、以下のような詳細スペック情報を収集・構造化してください。
Creators APIの features テキストとWeb調査を組み合わせて情報を取得し、該当しない項目は null を設定してください。

出力例（スマートフォンの場合）:
\`\`\`json
"technicalSpecs": {
  "os": "Android 14",
  "cpu": "Snapdragon 8 Gen 3",
  "ram": "8GB",
  "storage": "256GB",
  "display": { "size": "6.7インチ", "resolution": "2796×1290", "type": "OLED" },
  "battery": { "capacity": "4600mAh", "charging": "25W急速充電" },
  "camera": { "main": "48MP", "ultrawide": "12MP" },
  "dimensions": { "height": "160.9mm", "width": "77.6mm", "depth": "8.25mm", "weight": "221g" },
  "connectivity": ["5G", "Wi-Fi 6E", "Bluetooth 5.3"],
  "other": ["防水IP68", "FeliCa"]
}
\`\`\`

カテゴリ別の収集項目:
- スマートフォン/タブレット: os, cpu, ram, storage, display, battery, camera, connectivity
- PC/ノートパソコン: cpu, ram, storage, display, battery, gpu
- イヤホン/ヘッドホン: driver, codec, battery, connectivity, noiseCancel
- 家電商品: dimensions, power, capacity, その他機能
`;

  return prompt;
}
