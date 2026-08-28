import fs from 'node:fs';
import path from 'node:path';
import type { SaleCandidatesFile } from '../scripts/extract-sale-candidates';

/**
 * RecommendationPromptBuilder - 本日の注目商品を調査するためのプロンプトを構築
 */

export class RecommendationPromptBuilder {
  private readonly today: string;
  private readonly candidatesPath: string;
  private readonly maxProducts: number;

  constructor(candidatesPath?: string, maxProducts = 10) {
    // JSTで現在の日付を取得 (YYYY-MM-DD)
    this.today = new Date()
      .toLocaleDateString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replaceAll('/', '-');

    this.candidatesPath = candidatesPath || path.join(process.cwd(), 'tmp/sale_candidates.json');
    this.maxProducts = maxProducts;
  }

  private loadSaleCandidatesPromptSection(): string {
    if (!fs.existsSync(this.candidatesPath)) {
      return '';
    }

    try {
      const raw = fs.readFileSync(this.candidatesPath, 'utf-8');
      const data = JSON.parse(raw) as SaleCandidatesFile;

      if (!data.candidates || data.candidates.length === 0) {
        return '';
      }

      const candidateLines = data.candidates.slice(0, 30).map((item, index) => {
        const limitedLabel = item.isLimitedTimeSale ? '🔥【限定セール】' : '';
        const badge = item.dealBadge ? ` [${item.dealBadge}]` : '';
        const discount = item.savingsPercentage ? ` (${item.savingsPercentage}% OFF)` : '';
        const scoreLabel = item.articleScore ? ` 【検証スコア: ${item.articleScore}点】` : '';
        const brandLabel = item.brand ? ` 【ブランド: ${item.brand}】` : '';
        return `${index + 1}. ${limitedLabel}ASIN: ${item.asin} | ${item.title} | カテゴリ: ${item.category}${scoreLabel}${brandLabel} | 価格: ${item.price.formatted}${badge}${discount}`;
      });

      return `
---

## 【事前抽出された高品質・高スコア候補商品リスト】
以下の商品は、サイト内の詳細検証記事（スコア75点以上）および信頼できるブランドから抽出された、確かな品質と実績を持つ厳選候補である。

⚠️ **【最重要ルール：リアルタイムAPI検証の義務】** ⚠️
- ここに記載されたセールバッジや価格は「過去のキャッシュ情報」に過ぎない。セールが既に終了している可能性があるため、**選定・調査する際は必ず事前に \`uv run python scripts/creators_get_item.py <ASIN>\` を実行し、現在の最新のセールバッジ (\`dealBadge\`) や価格情報をリアルタイム取得せよ**。
- APIで最新情報を取得した結果、現在セールが終了している（dealBadgeが消滅、通常価格に戻っている）商品は『セール品』ではなく『定番・高評価品』として扱うか、現在もセールが継続している他の候補を優先せよ。
- API取得結果で現在もセールが継続していることが確認できた商品は、最新の価格・セール名（「特選タイムセール」「プライム限定」等）を用いて本日の10選に活用せよ。

${candidateLines.join('\n')}
`;
    } catch {
      return '';
    }
  }

  public build(): string {
    const saleCandidatesSection = this.loadSaleCandidatesPromptSection();
    const n = this.maxProducts;

    return `【ミッション：本日（${this.today}）の「今買うべき」多様なおすすめ${n}選と、そのエビデンスの調査】
あなたはお買い得で価値の高い商品を見つける優秀なAIエージェントとして、Amazon商品の調査・選定を行う。
本日は、特定のジャンルに偏らず、幅広いカテゴリから確かな品質と信頼性を持つ${n}個の商品を厳選せよ。
既存の \`data/recommendations/today.json\` の内容は考慮不要。毎日新しい情報を上書きするため、過去のデータと大きく乖離しても問題ない。本日の最新トレンドとセール情報に基づいた、最高の${n}選を提案せよ。
最重要ルールは、**「なぜ今日おすすめするのか（Why Buy Now）」の根拠となる『情報元（エビデンス）』を必ず明記せよ**。客観的な事実に基づかない推奨は無価値である。
${saleCandidatesSection}
---

## 自律性に関する基本原則（重要：アドバイス要求の禁止）
- **自律的判断と完遂の義務**: あなたには、提供されたツールを駆使してミッションを完遂する全責任がある。ツールのエラーや一時的な情報不足で作業を中断してはならない。
- **事前抽出候補の最優先活用**: 上記の事前抽出リストに記載された高品質・高スコアな候補商品を最優先で採用し、客観的で魅力的な「Why Buy Now」および解説文を作成せよ。
- **自己レビューと自律的リトライ**: 選定した商品が不適切（エビデンスが弱い、セールの実態がない、カテゴリが重複しているなど）であると自己レビューで気づいた場合は、立ち止まらずにそれらを除外し、代わりの候補を自律的に選べ。10個すべてが「自信を持って今日おすすめできる」状態になるまで、繰り返し調査と選定を行え。
- **ユーザーへのアドバイス・質問の完全禁止 (最重要)**: どのような状況であっても、ユーザー（人間）に質問を投げかけたり、アドバイスを求めて処理を中断したりしてはならない。ユーザーからの回答は一切得られない。曖昧な仕様や未決定事項がある場合、またはツールの実行エラーに直面した場合は、手元のデータや文脈から自律的かつ合理的に判断し、あなたの判断だけで処理を完遂すること。

---

## 調査・選定の進め方
1. **品質と信頼性の絶対厳守 (最重要方針)**:
   - **ノーブランド・無名業者の粗悪品（耳かきカメラ、怪しいマッサージ器、ノーブランド充電器等）の混入を絶対に禁止する**。
   - 割引率の高さ（「50% OFF」「60% OFF」等の表示）だけで商品を選んではならない。参考価格を吊り上げた二重価格商品を徹底的に排除せよ。
   - 事前抽出候補リスト（スコア75点以上の検証済み商品）から優先して10品を構成せよ。
   - もし外部から新規商品を採用する場合でも、必ず \`data/brandgroups.json\` に登録されている信頼できる有名ブランド（Anker, Apple, Sony, Panasonic, 伊藤園, アイラップ, バッファロー等）かつレビュー評価4.0以上・レビュー件数100件以上の商品に限定せよ。
2. **多角的な商品選定（カテゴリの分散）**:
   - 意図的にジャンルを分散させ（例：PC周辺機器、食品、飲料、日用品、家電、オーディオなど）、1つのテーマに偏らないようにせよ（同一カテゴリは最大1〜2品まで）。
3. **${n}商品の構成と詳細調査**:
   - 【特選セール枠（3〜4品）】：高スコアかつ本日リアルタイムで特選タイムセール中の商品
   - 【高スコア定番・殿堂入り枠（3〜4品）】：スコア80点以上の確実におすすめできる人気定番商品
   - 【実用・トレンド枠（2〜3品）】：季節需要や高評価のお買い得商品
   - **実在するASINと最新API状態の絶対保証**: リストに追加する商品は、必ず事前に \`uv run python scripts/creators_get_item.py ASIN\` を実行し、詳細なスペック、**現在の最新価格、および現在の最新セールバッジ (\`dealBadge\`)** を取得せよ。APIから取得していない架空のASINは絶対に生成・追加してはならない。
4. **選定理由の明記**:
   - 選定基準におけるこの商品の順位・掲載理由（例: \`特選タイムセール中\`, \`高スコア殿堂入り\`, \`実用性・高コスパ\`, \`季節トレンド\` など）を簡潔に分析し、\`rankReason\` に設定せよ。

---

## 成果物の作成と検証
- 調査結果を \`data/recommendations/today.json\` に保存せよ。
- **重要**: 今回の調査において、\`data/recommendations/today.json\` 以外のファイル（収集した一時データスクリプトや \`tmp/\` 以下のファイルなど）は**絶対にコミット（Git Commit）しない**。リポジトリに変更を含めるのは \`today.json\` のみとする。
- **検証の強制とエラーハンドリング (最重要)**: 成果物を生成した後、必ず \`uv run python scripts/validate_artifact.py data/recommendations/today.json\` を実行し、構造の正当性やリンク切れ（404エラーなど）がないか確認せよ。もし1件でもエラーが検出された場合は、絶対にそのままコミットやPR作成を完了してはならない。エラーが出た商品を除外し、自律的に新しい実在する商品を検索・調査して、リストを再構築し、再度検証スクリプトを実行せよ。すべての検証（エラー件数0）をパスするまで、この「調査・修正・検証」の自律ループを繰り返すこと。
- **ハルシネーションの厳禁**: ハルシネーション（存在しない商品、架空のセール、実在しないニュースやURLの創作）は厳禁である。必ず実在するエビデンスへのリンクを記載し、APIから取得した実在するASINのみを使用すること。

---

## 出力形式 (JSON)
\`data/recommendations/today.json\` の構造：
\`\`\`json
{
  "date": "${this.today}",
  "headline": "本日の厳選ピックアップ：確かな理由がある注目商品${n}選",
  "recommendations": [
    {
      "asin": "ASIN",
      "title": "検索タグやSEOキーワードを除いた簡潔な商品名",
      "price": 1980,
      "category": "カテゴリ（${n}個すべて異なるか、最大1〜2品まで）",
      "reason": "この商品自体の魅力や優れている点（2〜3文）",
      "whyBuyNow": "なぜ『今日』買うべきなのか（例：特選タイムセール中、毎日の生活必需品で高評価、など）",
      "rankReason": "選定基準におけるこの商品の掲載・順位理由（例: 特選タイムセール中、高スコア定番、実用性重視など。20文字以内で簡潔に）",
      "scoreDisclaimer": null,
      "source": {
        "name": "情報元の名称（例：Amazon特選タイムセール、Amazon公式等）",
        "url": "エビデンスとなる基の情報のURL（※存在する場合は必ず記載。無い場合は null または空文字）"
      },
      "highlights": ["特徴1（各項目30文字以内で簡潔に）", "特徴2（各項目30文字以内で簡潔に）", "3〜5個程度"],
      "url": "https://www.amazon.co.jp/dp/ASIN/",
      "imageUrl": "画像のURL (存在する場合)"
    }
  ],
  "searchContext": {
    "todayOverview": "本日の商品選定の全体的な背景（市場のトレンドやセール状況など）",
    "searchedCategories": ["探索したカテゴリ1", "カテゴリ2", "カテゴリ3", "..."]
  }
}
\`\`\`

それでは、高品質な候補商品を中心に選定を開始し、客観的なエビデンスを持った魅力的な${n}個の厳選リストを作成する。`;
  }
}
