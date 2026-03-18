/**
 * RecommendationPromptBuilder - 本日のおすすめ商品を調査するためのプロンプトを構築
 */

export class RecommendationPromptBuilder {
  private readonly today: string;

  constructor() {
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
    return `【ミッション：本日のおすすめ商品調査】
あなたは Amazon 商品調査のエキスパートです。本日のトレンド、季節、または注目されている商品を自律的に探索し、ユーザーに推奨する JSON レポートを作成してください。

---

## 調査の進め方
1. **探索テーマの決定**: 本日の日付（${this.today}）に基づき、現在注目されているカテゴリやキーワード（例：季節家電、新生活応援グッズ、最新ガジェット、タイムセール中の注目品など）を数種類選定してください。
2. **商品検索**: \`python scripts/creators_search_items.py "キーワード" --search-index Index名\` を実行して、各テーマから候補商品をリストアップしてください。
3. **優良商品の選定**: 検索結果から、特に魅力的な（評価が高い、価格競争力がある、新製品である等）商品を合計 3〜5 点選んでください。
4. **詳細調査**: 選定した各商品について \`python scripts/creators_get_item.py ASIN\` を実行し、詳細なスペック、特徴、価格情報を取得してください。
5. **推奨理由の整理**: なぜその商品が「今日」おすすめなのか、具体的な理由（季節性、トレンド、コスパ等）を整理してください。

---

## 成果物の作成と検証
- 調査結果を \`data/recommendations/today.json\` に保存してください。
- ファイル作成後、\`python scripts/validate_artifact.py\` (もし利用可能であれば) でのチェックを検討してください。
- **注意**: 既存の調査プロセスと同様、ハルシネーション（存在しない商品情報やURLの創作）は厳禁です。

---

## 出力形式 (JSON)
\`data/recommendations/today.json\` の構造：
\`\`\`json
{
  "date": "${this.today}",
  "headline": "本日の注目商品セレクション：[テーマ名]",
  "recommendations": [
    {
      "asin": "ASIN",
      "title": "商品名",
      "price": "価格",
      "category": "カテゴリ",
      "reason": "今日おすすめする具体的な理由（2-3文）",
      "highlights": ["特徴1", "特徴2"],
      "url": "https://www.amazon.co.jp/dp/ASIN/",
      "imageUrl": "画像のURL (存在する場合)"
    }
  ],
  "searchContext": {
    "themes": ["選定したテーマ1", "テーマ2"],
    "keywords": ["使用したキーワード1", "キーワード2"]
  }
}
\`\`\`

調査を開始してください。`;
  }
}
