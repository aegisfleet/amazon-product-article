import type { Product } from '../types/Product';

export class InvestigationPromptBuilder {
  private readonly product: Product;
  private readonly today: string;

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
    return `
1. **スコアリングルール (重要)**:
   - **基本点は 70点 固定**、ここから以下の加減点を適用して最終スコアを算出する
   - 独自の判断で基本点を変更しない

2. **評価カテゴリの選定**:
   商品の特性（家電、食品、美容品、日用品等）に応じて、以下のいずれかのパターン、あるいはこれらを適切に組み合わせた基準で加減点を行う。

   **バリエーション商品（容量・サイズ違い）の評価基準の一貫性について（極めて重要）**:
   対象商品が同一製品のサイズ・容量違い（バリエーション）であったとしても、過去の評価データや他のバリエーションのスコアに引きずられて機械的にスコアを同期してはならない。個々の商品を独立して客観的に調査・評価すること。
   ただし、**評価の観点や基準にブレが生じないようにすること**。例えば、「成分」「味」「匂い」などの商品そのものの本質的な特徴については、どの容量のバリエーションであっても同じ基準で評価し、「大容量版だけ匂いを理由に減点する」「小容量版だけ成分を理由に加点する」といった一貫性のない評価を絶対に防ぐこと。容量・サイズ固有の評価（コスパや取り回し）と、商品の本質的な評価は明確に切り離して加減点を行うこと。

   **パターンA：一般商品 (性能・コスパ重視)**
   - 性能・機能 (-10 ～ +10点): スペック、実用性、使い勝手
   - コストパフォーマンス (-15 ～ +15点): 価格対性能、競合との価格差、容量あたりの単価（最重視）。※割引率が 80%〜90% 以上など異常に高い場合は、二重価格表示の疑いで大きく減点（最大-15点）する
   - 品質・デザイン (-5 ～ +5点): ビルドクオリティ、質感、美しさ
   - ユーザー満足度 (-10 ～ +10点): レビュー、信頼性、サポート体制
   - 独自の強み・先進性 (0 ～ +10点): 他にない革新的な機能、独自の価値

   **パターンB：安全性・信頼性重視商品 (美容・健康・食品・ベビー等)**
   - 安全性・信頼性 (-20 ～ +10点): 【最重要】成分、製造品質、ブランド信頼性、副作用リスク。不安要素がある場合は大きく減点
   - コストパフォーマンス (-10 ～ +10点): 安全性が確保された上での価格対効果。容量・サイズ違いによるコスパの変動もここで評価する。安くても怪しい商品や異常な割引率の商品は評価しない
   - 性能・効果 (-10 ～ +10点): 期待される効果、スペック、実用性
   - 品質・デザイン (-5 ～ +5点): パッケージ、質感、使いやすさ
   - ユーザー満足度 (-10 ～ +10点): レビュー、リピート率、サポート体制
   - 独自の強み・先進性 (0 ～ +10点): 他にない成分、革新的な技術

   **加減点の独立性**:
   1つの加点・減点の理由は必ず1つの要素に絞ること。例えば、「大容量でコスパが良く、栄養成分が豊富」のように複数の要素を混ぜて加点（例: +10点）してはならない。必ず「大容量によるコスパの良さ（+5点）」「豊富な栄養成分（+5点）」のように独立させて記述すること。`;
  }

  private generatePrompt(brandInfo: string, parentAsinInfo: string, rubric: string, specs: string): string {
    return `【基本ルール】
- 全ての出力は日本語で記述する
- 情報の正確性を最優先し、常に最新の情報を調査する
- 過去の調査データとの整合性よりも、現時点での最新情報（価格、在庫、評価等）を優先する。データが更新されることにより、既存のデータと結果が大きく乖離しても問題ない
- コミット対象は \`data/investigations/${this.product.asin}.json\` のみとする。

---

## 自律性に関する基本原則
- **自律的判断と完遂の義務**: あなたには提供されたツールを駆使してミッションを完遂する全責任がある。ツールのエラーや一時的な情報不足で作業を中断してはならない。
- **代替手段の模索**: Amazon API (\`creators_get_item.py\`) から十分な情報が得られない、あるいは403エラーが発生した場合でも、自律的に \`google_search\` や \`view_text_website\` を活用し、外部ソース（公式サイト、ニュースサイト、レビューサイト）から必要な情報を補完せよ。
- **自己レビューと自律的リトライ**: 調査対象の商品が不適切（サクラレビューの疑い、低品質、詐欺的など）であると自己レビューで判断した場合や、競合比較に十分なデータが揃わない場合は、立ち止まらずに自律的にキーワードを変えたり別のソースを探したりして、納得のいく結論が出るまで調査を継続せよ。絶対に「調査不能」で終わらせず、必要なら他のおすすめ商品への誘導を含めた代替案を作成してミッションを完遂せよ。
- **判断の継続**: 些細な判断（スコアリングの微調整や類似スペックの解釈など）でユーザーの確認を待つ必要はない。本日のルールに基づき、その時点で最善と思われる判断を下して調査を完遂せよ。

---

## 実行環境と調査ツール
このシステムは Amazon Creators API と連携している。以下のツールを積極的に活用して調査する。

| ツール | 用途 | コマンド例 |
|---|---|---|
| \`scripts/creators_get_item.py\` | 詳細な商品情報の取得 | \`uv run python scripts/creators_get_item.py ASIN\` |
| \`scripts/creators_search_items.py\` | 競合商品の検索 | \`uv run python scripts/creators_search_items.py "キーワード" --search-index Index名\` |
| \`scripts/validate_artifact.py\` | JSON内の全品質・リンクチェック | \`uv run python scripts/validate_artifact.py data/investigations/ASIN.json\` |

---

## 調査の進め方と検証義務
1. **情報収集**: \`uv run python scripts/creators_get_item.py\` で対象商品の公式データを、\`uv run python scripts/creators_search_items.py\` で競合他社のデータを収集する。
2. **成果物の作成と徹底検証**: JSONファイル作成後、直ちに以下の検証を行う。
  - \`uv run python scripts/validate_artifact.py data/investigations/${this.product.asin}.json\` を実行する。
  - **修正義務**: 警告やエラー（リンク切れ、非メートル法単位の混入、必須項目の不足等）が出た場合は、必ずその場で内容を修正し、再度チェックをパスさせる。
  - 特に競合製品との価格比較やスペックの正確性を再確認する。
  - \`lastInvestigated\` を本日の日付（${this.today}）に必ず更新する。
3. **外部調査と継続性**: Amazon 403エラー等でもGoogle検索等で調査を継続し、絶対に「調査不能」で終わらせない。情報が不足している場合は、自律的に検索キーワードを工夫して必要なエビデンスを揃える。
4. **推測ではなく根拠**: 商品仕様からの論理的推論は許容するが、架空のエピソード創作（ハルシネーション）は厳禁である。
5. **網羅的なスペックの記載**: 調査で判明した商品仕様は、\`technicalSpecs\` セクションに漏れなく網羅する。
6. **サイズ表記の統一**: サイズはメートル法（m, cm, mm等）のみを使用し、インチ表記は原則不要とする。元データがインチのみの場合はメートル法に変換して記載する。
  - **範囲表記の統一**: 数値の範囲（「10〜20g」など）を記述する際は、半角のチルダ \`~\` ではなく、全角の波ダッシュ \`～\` またはハイフン \`-\` を使用する。

---

## 安全性とコンプライアンス指針
- **法的制約の遵守**: 美容、健康、食品、ベビー用品などのカテゴリでは、薬機法等の法的制約に基づき「治る」「必ず効果がある」といった誇張表現や医学的根拠のない主張を厳禁とする。
- **客観性の維持**: 主観的な感想ではなく、スペックや検証されたユーザーレビューに基づいた客観的な事実のみを記載せよ。

---

## 【最重要】信頼性とソースのガイドライン
- **URL検証**: 採用する全URLに対し、必ず \`curl\`、\`google_search\`、または \`view_text_website\` ツールを用いて対象のWebページを取得する。
  - **必須チェック手順**: \`curl\` で取得したHTML全体を対象に \`grep -i "対象商品名"\` 等を行い、本当にその商品について言及されているか確認する。\`head -n 20\` 等で冒頭だけを見るのは不十分である。
  - タイトルや本文に「確実に対象商品の名前が含まれているか」を直接チェックする。
  - 404エラーだけでなく、無関係な商品ページ（例: 別の製品の価格.comページ等、ハルシネーション）のURLを採用することは絶対に許されない。
- **価格.comの調査ルール**:
  - 価格.comのURLや商品ID（\`K...\` や \`J...\` など）を推測（ハルシネーション）することは厳禁である。
  - 必ず \`google_search\`（例: \`site:kakaku.com <商品名>\`）を用いて正確なURLを取得する。
  - 取得したURLのページタイトル（\`<title>\`）やメイン見出し（\`<h1>\`）が対象商品と完全に一致することを必ず確認し、関連商品や別の商品のページを誤って採用しない。
- **ハルシネーション禁止**: 存在しないURLや、実データに基づかないユーザーストーリーの創作を禁止する。
- **出典の明示**: 主張やストーリーは、必ず \`sources\` の \`id\` を \`supportingSourceIds\` に含めて紐付ける。
- **クロスチェック**: 重要な品質・比較優位の主張は、2系統以上の独立ソースで一致確認を行う。

---

## 調査・分析項目
- **ユーザーストーリー**: 実体験に基づく具体的エピソード（3行以上）。
  - 使い勝手、触り心地、設置のしやすさ、実際の利用シーンで感じたメリット・デメリットなどの「使用感」を具体的に含める。
  - **削除ルール**:
    - 過去に記載されていたストーリーであっても、今回の調査で根拠となるデータが確認できない場合は必ず削除する。
    - 情報元となるエビデンス（レビュー、ニュース、セール情報など）が確認できるもののみを残す。
    - ユーザーに不利益を与える可能性のある、根拠の薄い「おすすめポイント」は排除する。
    - 根拠のないストーリーは不要である。
- **競合比較分析**: 主要競合6～8点のASIN特定と比較。調査を尽くしても6つに満たない場合は、ユーザーに確認を取らずそのまま作業を進めて良い。以下のフォーマットを厳守する：
  ---
  比較ポイント:
  共通点：[共通する特徴や仕様]
  相違点：[明確に異なる性能・価格・品質]
  選び方のポイント:
  [対象商品名]の利点：[競合と比較して選ぶべき具体的な理由]
  [競合商品名]の利点：[競合の方が適している具体的なケース]
  ---
- **購買推奨度**: 推奨ユーザー、注意点、算出されたスコアと根拠。
  ${rubric}
  - **\`scoreRationale\` の記述形式 (厳守)**:
    以下のフォーマットで、計算過程を一行ずつ記述する。
    \`\`\`
    [基本点: 70] (固定)
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
\`data/investigations/${this.product.asin}.json\` として保存する。
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
        "experience": "使い勝手、触り心地、設置のしやすさ、実際の利用シーンで感じたメリット・デメリットなどの「使用感」を具体的に含める（※重要：今回の調査で根拠が確認できない場合は、過去に存在したストーリーであっても必ず削除する）",
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
        "tier": "high | medium | low (※重要: primary ではなく、必ずこの3つのいずれかから選択)",
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
        "priceComparison": "対象商品との価格差からの分析（価格は変動するので記載は不要。差額の表示は別途行っているので説明不要。対象商品より高い場合はその価値があるか、安い場合は品質・性能に懸念がないかを記述）",
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
      "// 注意": "調査で判明した仕様情報をここに網羅的に記載する（サイズはメートル法のみ、インチ不要）",
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
