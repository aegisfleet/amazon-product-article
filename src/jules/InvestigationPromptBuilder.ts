import type { Product } from '../types/Product';

export class InvestigationPromptBuilder {
  private readonly product: Product;
  private readonly today: string;

  private static readonly SAFETY_SENSITIVE_CATEGORIES = [
    '美容',
    'beauty',
    '健康',
    'health',
    'サプリメント',
    'supplements',
    '食品',
    'food',
    'ベビー',
    'baby',
    'スキンケア',
    'skincare',
    '医薬品',
    'medicine',
    'ペット用品',
    'pet',
    'コンタクト',
    'contact lens',
  ];

  constructor(product: Product) {
    this.product = product;
    // JSTで現在の日付を取得 (YYYY-MM-DD)
    this.today = new Date()
      .toLocaleDateString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replaceAll('/', '-');
  }

  public build(): string {
    const brandInfo = this.getBrandInfo();
    const parentAsinInfo = this.getParentAsinInfo();
    const rubric = this.getScoringRubric();
    const specs = this.getProductSpecs();

    return this.generatePrompt(brandInfo, parentAsinInfo, rubric, specs);
  }

  private isSafetySensitive(): boolean {
    return InvestigationPromptBuilder.SAFETY_SENSITIVE_CATEGORIES.some(
      (cat) => this.product.category.toLowerCase().includes(cat) || this.product.title.toLowerCase().includes(cat),
    );
  }

  private getBrandInfo(): string {
    return this.product.brand ? `- ブランド: ${this.product.brand}` : '';
  }

  private getParentAsinInfo(): string {
    return this.product.parentAsin ? `- 親ASIN: ${this.product.parentAsin}` : '';
  }

  private getProductSpecs(): string {
    return Object.entries(this.product.specifications)
      .map(([key, value]) => `  - ${key}: ${value}`)
      .join('\n');
  }

  private getScoringRubric(): string {
    if (this.isSafetySensitive()) {
      return `
2. **加減点カテゴリと配分幅 (美容・健康・食品用)**:
   - **安全性・信頼性 (-20 〜 +10点)**: 【最重要】成分、製造品質、ブランド信頼性、副作用リスク。不安要素がある場合は大きく減点。
   - **コストパフォーマンス (-10 〜 +10点)**: 安全性が確保された上での価格対効果。安くても怪しい商品は評価しない。
   - **性能・効果 (-10 〜 +10点)**: 期待される効果、スペック、実用性。
   - **品質・デザイン (-5 〜 +5点)**: パッケージ、質感、使いやすさ。
   - **ユーザー満足度 (-10 〜 +10点)**: レビュー、リピート率、サポート体制。
   - **独自の強み・先進性 (0 〜 +10点)**: 他にない成分、革新的な技術。`;
    } else {
      return `
2. **加減点カテゴリと配分幅**:
   - **性能・機能 (-10 〜 +10点)**: スペック、実用性、使い勝手
   - **コストパフォーマンス (-15 〜 +15点)**: 価格対性能、競合との価格差（最重視）
   - **品質・デザイン (-5 〜 +5点)**: ビルドクオリティ、質感、美しさ
   - **ユーザー満足度 (-10 〜 +10点)**: レビュー、信頼性、サポート体制
   - **独自の強み・先進性 (0 〜 +10点)**: 他にない革新的な機能、独自の価値`;
    }
  }

  private generatePrompt(brandInfo: string, parentAsinInfo: string, rubric: string, specs: string): string {
    return `【基本ルール】
- 全ての出力は日本語で記述すること
- 情報の正確性を最優先し、常に最新の情報を調査すること
- コミット対象は \`data/investigations/${this.product.asin}.json\` のみ

---

## 実行環境と調査ツール
このシステムは Amazon Creators API と連携しています。以下のツールを積極的に活用して調査する。

| ツール | 用途 | コマンド例 |
|---|---|---|
| \`scripts/creators_get_item.py\` | 詳細な商品情報の取得 | \`python scripts/creators_get_item.py ASIN\` |
| \`scripts/creators_search_items.py\` | 競合商品の検索 | \`python scripts/creators_search_items.py "キーワード" --search-index Index名\` |
| \`scripts/validate_artifact.py\` | JSON内の全品質・リンクチェック | \`python scripts/validate_artifact.py data/investigations/ASIN.json\` |

---

## 調査の進め方と検証義務
1. **情報収集**: \`creators_get_item.py\` で対象商品の公式データを、\`creators_search_items.py\` で競合他社のデータを収集する。
2. **成果物の作成と徹底検証**: JSONファイル作成後、直ちに以下の検証を行うこと。
  - \`python scripts/validate_artifact.py data/investigations/${this.product.asin}.json\` を実行する。
  - **修正義務**: 警告やエラー（リンク切れ、非メートル法単位の混入、必須項目の不足等）が出た場合は、必ずその場で内容を修正し、再度チェックをパスさせること。
  - 特に競合製品との価格比較やスペックの正確性を再確認する。
  - \`lastInvestigated\` を本日の日付（${this.today}）に必ず更新する。
3. **外部調査**: Amazon 403エラー等でもGoogle検索等で調査を継続し、絶対に「調査不能」で終わらせない。
4. **推測ではなく根拠**: 商品仕様からの論理的推論は許容するが、架空のエピソード創作（ハルシネーション）は厳禁。
5. **網羅的なスペックの記載**: 調査で判明した商品仕様は、\`technicalSpecs\` セクションに漏れなく網羅すること。
6. **サイズ表記の統一**: サイズはメートル法（m, cm, mm等）のみを使用し、インチ表記は原則不要とする。元データがインチのみの場合はメートル法に変換して記載すること。

---

## 安全性とコンプライアンス指針
- **法的制約の遵守**: 美容、健康、食品、ベビー用品などのカテゴリでは、薬機法等の法的制約に基づき「治る」「必ず効果がある」といった誇張表現や医学的根拠のない主張を厳禁とする。
- **客観性の維持**: 主観的な感想ではなく、スペックや検証されたユーザーレビューに基づいた客観的な事実のみを記載すること。

---

## 【最重要】信頼性とソースのガイドライン
- **URL検証**: 採用する全URLに対し、必ず \`curl\`、\`google_search\`、または \`view_text_website\` ツールを用いて対象のWebページを取得する。
  - **必須チェック手順**: \`curl\` で取得したHTML全体を対象に \`grep -i "対象商品名"\` 等を行い、本当にその商品について言及されているか確認する。\`head -n 20\` 等で冒頭だけを見るのは不十分。
  - タイトルや本文に「確実に対象商品の名前が含まれているか」を直接チェックする。
  - 404エラーだけでなく、無関係な商品ページ（例: 別の製品の価格.comページ等、ハルシネーション）のURLを採用することは絶対に許されない。
- **ハルシネーション禁止**: 存在しないURLや、実データに基づかないユーザーストーリーの創作を禁止。
- **出典の明示**: 主張やストーリーは、必ず \`sources\` の \`id\` を \`supportingSourceIds\` に含めて紐付けること。
- **クロスチェック**: 重要な品質・比較優位の主張は、2系統以上の独立ソースで一致確認すること。

---

## 調査・分析項目
- **ユーザーストーリー**: 実体験に基づく具体的エピソード（3行以上）。
  - 使い勝手、触り心地、設置のしやすさ、実際の利用シーンで感じたメリット・デメリットなどの「使用感」を具体的に含めること。
  - 実際のデータ（レビューや記事）が存在しない場合は、推測やプレースホルダーを記載するのではなく、そのユーザーストーリー自体を完全に削除（除外）する。
- **競合比較分析**: 主要競合6-8点のASIN特定と比較。以下のフォーマットを厳守すること：
  ---
  比較ポイント:
  共通点：[共通する特徴や仕様]
  相違点：[明確に異なる性能・価格・品質]
  選び方のポイント:
  [対象商品名]の利点：[競合と比較して選ぶべき具体的な理由]
  [競合商品名]の利点：[競合の方が適している具体的なケース]
  ---
- **購買推奨度**: 推奨ユーザー、注意点、算出されたスコアと根拠。
  - **\`scoreRationale\` の記述形式 (厳守)**:
    以下のフォーマットで、計算過程を一行ずつ記述してください。
    \`\`\`
    [基本点: 70]
    [加点: +XX] (理由を簡潔に記述)
    [減点: -XX] (理由を簡潔に記述)
    ...
    [合計: XX] (最終的なスコア)
    \`\`\`

---

商品情報：
- ASIN: ${this.product.asin}
- 商品名: ${this.product.title}
${brandInfo}
${parentAsinInfo}
- カテゴリ: ${this.product.category}
- 価格: ${this.product.price.formatted}
- 仕様・詳細:
${specs}

---

## 出力形式 (JSON)
\`data/investigations/${this.product.asin}.json\` として保存してください：
\`\`\`json
{
  "analysis": {
    "productName": "検索タグやSEOキーワードを除いた簡潔な商品名",
    "parentAsin": "${this.product.parentAsin || this.product.asin}",
    "productDescription": "1-2文の概要",
    "productUsage": ["用途1", "用途2"],
    "positivePoints": ["具体的根拠に基づく良い点1", "良い点2"],
    "negativePoints": ["制約や改善要望1", "問題点2"],
    "useCases": ["使用シーン1", "使用シーン2"],
    "userStories": [
      {
        "userType": "属性",
        "scenario": "状況",
        "experience": "使い勝手、触り心地、利用シーンでの印象など、3行以上の具体的な実体験・使用感（データが存在しない場合はストーリー自体を削除すること）",
        "supportingSourceIds": ["source-id"],
        "sentiment": "positive | negative | mixed"
      }
    ],
    "userImpression": "調査データ（レビューや検証記事）から得られた、全体的な使用感や印象のまとめ",
    "sources": [
      {
        "id": "src-1",
        "name": "記事タイトル/サイト名",
        "url": "URL",
        "tier": "high | medium | low",
        "evidenceType": "primary | secondary",
        "publishedAt": "YYYY-MM-DD",
        "author": "執筆主体",
        "conflictOfInterest": "none | possible | disclosed | unknown",
        "notes": "具体的な情報抽出内容"
      }
    ],
    "claims": [
      {
        "claim": "主張内容",
        "category": "quality | durability | safety | comparativeAdvantage",
        "confidence": "high | medium | low",
        "supportingSourceIds": ["src-1"],
        "crossChecked": true,
        "notes": "確認内容"
      }
    ],
    "lastInvestigated": "${this.today}",
    "competitiveAnalysis": [
      {
        "name": "競合名",
        "asin": "ASIN(必須)",
        "priceComparison": "対象商品との価格差の分析（数値計算は不要。対象商品より高い場合はその価値があるか、安い場合は品質・性能に懸念がないかを記述）",
        "featureComparison": [
          "共通点：[テキスト可変]",
          "相違点：[テキスト可変]"
        ],
        "differentiators": [
          "[対象商品名]の利点：[テキスト可変]",
          "[競合商品名]の利点：[テキスト可変]"
        ]
      }
    ],
    "recommendation": {
      "targetUsers": ["推奨ユーザー"],
      "pros": ["メリット"],
      "cons": ["注意点"],
      "score": 0,
      "scoreRationale": "[基本点: 70]\\n[加点: +XX] (理由)\\n[減点: -XX] (理由)\\n[合計: XX]"
    },
    "technicalSpecs": {
      "// 注意": "調査で判明した仕様情報をここに網羅的に記載してください（サイズはメートル法のみ、インチ不要）",
      "// 例示1(家電)": "dimensions: W/H/D (mm/cm), weight: XXg, power: XXW, battery: XXh",
      "// 例示2(化粧品)": "capacity: XXml/XXg, ingredients: [主成分], skinType: [適応]",
      "// 例示3(食品)": "content: XXg, calories: XXkcal, shelfLife: XX日, allergens: [成分]",
      "dimensions": { "height": "XXmm", "width": "XXmm", "depth": "XXmm" },
      "weight": "XXg",
      "capacity": "XX",
      "material": "材質",
      "origin": "原産国",
      "other": ["他、重要なスペックを網羅"]
    }
  }
}
\`\`\`
`;
  }
}
