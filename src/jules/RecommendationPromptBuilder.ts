import fs from 'node:fs';
import path from 'node:path';
import type { SaleCandidatesFile } from '../scripts/extract-sale-candidates';

/**
 * RecommendationPromptBuilder - 本日の注目商品10選を調査するためのプロンプトを構築
 */

export class RecommendationPromptBuilder {
  private readonly today: string;
  private readonly candidatesPath: string;

  constructor(candidatesPath?: string) {
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

      const candidateLines = data.candidates.slice(0, 25).map((item, index) => {
        const limitedLabel = item.isLimitedTimeSale ? '🔥【限定セール】' : '';
        const badge = item.dealBadge ? ` [${item.dealBadge}]` : '';
        const discount = item.savingsPercentage ? ` (${item.savingsPercentage}% OFF)` : '';
        return `${index + 1}. ${limitedLabel}ASIN: ${item.asin} | ${item.title} | カテゴリ: ${item.category} | 価格: ${item.price.formatted}${badge}${discount}`;
      });

      return `
---

## 【事前抽出されたタイムセール・値引き候補商品 (paapi-product-cacheより)】
以下の商品は、過去のキャッシュから抽出されたタイムセール中または割引率が高いおすすめ商品候補である。

⚠️ **【最重要ルール：リアルタイムAPI検証の強制義務】** ⚠️
- ここに記載されたセールバッジや価格は「過去のキャッシュ情報」に過ぎない。セールが既に終了している可能性があるため、**選定・調査する際は必ず事前に \`uv run python scripts/creators_get_item.py <ASIN>\` を実行し、現在の最新のセールバッジ (\`dealBadge\`) や価格情報をリアルタイム取得せよ**。
- APIで最新情報を取得した結果、**現在セールが終了している（dealBadgeが消滅、通常価格に戻っている）商品は『セール品』として選定・掲載してはならない**。
- API取得結果で現在もセールが継続していることが確認できた商品のみ、最新の価格・セール名（「特選タイムセール」「プライム限定」等）を用いて本日の10選に活用せよ。

${candidateLines.join('\n')}
`;
    } catch {
      return '';
    }
  }

  public build(): string {
    const saleCandidatesSection = this.loadSaleCandidatesPromptSection();

    return `【ミッション：本日（${this.today}）の「今買うべき」多様なおすすめ10選と、そのエビデンスの調査】
あなたはお買い得で価値の高い商品を見つける優秀なAIエージェントとして、Amazon商品の調査・選定を行う。
本日は、特定のジャンルに偏らず、幅広いカテゴリから10個の商品を厳選せよ。
既存の \`data/recommendations/today.json\` の内容は考慮不要。毎日新しい情報を上書きするため、過去のデータと大きく乖離しても問題ない。本日の最新トレンドとセール情報に基づいた、最高の10選を提案せよ。
最重要ルールは、**「なぜ今日おすすめするのか（Why Buy Now）」の根拠となる『情報元（エビデンス）』を必ず明記せよ**。客観的な事実に基づかない推奨は無価値である。
${saleCandidatesSection}
---

## 自律性に関する基本原則（重要：アドバイス要求の禁止）
- **自律的判断と完遂の義務**: あなたには、提供されたツールを駆使してミッションを完遂する全責任がある。ツールのエラーや一時的な情報不足で作業を中断してはならない。
- **代替手段の模索**: Amazon内での検索で十分な結果が得られない場合は、自律的にキーワードを調整したり、Google検索（\`google_search\`）を併用して外部のトレンドやセール情報を収集せよ。また上記に事前抽出されたタイムセール・値引き候補がある場合は積極的に検証・採用せよ。
- **自己レビューと自律的リトライ**: 選定した商品が不適切（エビデンスが弱い、セールの実態がない、カテゴリが重複しているなど）であると自己レビューで気づいた場合は、立ち止まらずにそれらを除外し、代わりの候補を自律的に探せ。10個すべてが「自信を持って今日おすすめできる」状態になるまで、繰り返し調査と選定を行え。
- **ユーザーへのアドバイス・質問の完全禁止 (最重要)**: どのような状況であっても、ユーザー（人間）に質問を投げかけたり、アドバイスを求めて処理を中断したりしてはならない。ユーザーからの回答は一切得られない。曖昧な仕様や未決定事項がある場合、またはツールの実行エラーに直面した場合は、手元のデータや文脈から自律的かつ合理的に判断し、あなたの判断だけで処理を完遂すること。どうしても致命的なエラーで続行できない場合は、質問するのではなく、処理をエラーとして失敗終了させよ。

---

## 調査の進め方
1. **トレンド・セール情報の収集と「エビデンス」の確保**:
   - 本日の日付（${this.today}）における、時事ニュース、SNSのトレンドワード、本日のAmazon特選タイムセールなどを幅広く検索・把握せよ。事前抽出候補リストがある場合はそれらも重要候補として活用せよ。
   - その際、「どのサイト（URL）で話題になっていたか」「どの公式ページでセールが告知されているか」という**情報元（ソース）のリンクや名称を必ず記録する**。
2. **多角的な商品検索（カテゴリの分散）**:
   - 意図的にジャンルを分散させ（例：PC周辺機器、食品、日用品、家電、エンタメなど）、それぞれ異なるキーワードで \`uv run python scripts/creators_search_items.py\` を実行せよ。1つのテーマに偏らないように注意する。
3. **10商品の厳選と詳細調査**:
   - 検索結果および事前抽出候補から、明確なフック（大幅値引き、新発売、トレンド合致など）がある商品を、カテゴリが被らないように10点ピックアップせよ。
   - **自律的なリトライ**: 10個の商品が見つかるまで、キーワードや検索インデックスを変えて繰り返し検索を実行せよ。
   - **二重価格（参考価格吊り上げ）の徹底排除 (最重要)**:
     - Amazonでの割引率の高さ（「40% OFF」「50% OFF」等の表示）を鵜呑みにしないこと。参考価格を不当に高く設定して常時割引に見せかける二重価格商品（特にノーブランドの家電・日用品等）が非常に多い。
     - 商品がお得かどうかの判定は、**必ず「他競合ECサイト（楽天市場、Yahoo!ショッピング、ヨドバシ.comなど）の価格と比較して実際に安いか」**（例: \`google_search\` ツールで \`site:rakuten.co.jp <型番・商品名>\` のように検索）で厳格に検証せよ。他サイトの実勢価格と同等または高いものは選定対象から直ちに除外せよ。
   - **異常割引率の除外**: 異常割引率（例: 80%～90%）や常時高割引率のノーブランド品は二重価格の可能性が高いため評価・選定対象から除外すること。
   - **実在するASINと最新API状態の絶対保証 (最重要)**: リストに追加する商品は、必ず事前に \`uv run python scripts/creators_get_item.py ASIN\` を実行し、詳細なスペック、**現在の最新価格、および現在の最新セールバッジ (\`dealBadge\`)** を取得せよ。事前抽出リストに記載があった場合でも、APIの最新レスポンスでセールが終了している（dealBadgeが消滅、価格が通常価格に戻っている）商品は『セール品』として選定・掲載してはならない。必ずAPIで「現時点でセール中である」と検証された商品のみを掲載せよ。APIから取得していない架空のASINは絶対に生成・追加してはならない。
   - **既存記事のスコア確認と未調査商品の積極的選定**:
     - リポジトリ内の詳細レビュー記事（\`content/articles/{ASIN}.md\`）が存在するか確認し、存在する場合は Front Matter の \`score\`（商品評価スコア）を読み取ること。
     - **既にお問い合わせ・詳細レビュー記事が存在し、スコアが60点未満であることが確認された商品のみ**、品質維持のため選定対象から除外せよ。
     - **重要**: レビュー記事が存在しない**「まだスコアが算出されていない未調査商品」も当然、選定・掲載対象である（むしろ \`today.json\` に採用されることで後続フローにて新規に調査・記事作成が行われるため、未調査の魅力的なセール品も積極的に選定せよ）**。
   - 選定基準におけるこの商品の順位・掲載理由（例: \`他ECサイトより大幅に安い\`, \`高スコア\`, \`未調査の注目新製品\`, \`トレンド合致\` など）を簡潔に分析し、\`rankReason\` に設定せよ。

---

## 成果物の作成と検証
- 調査結果を \`data/recommendations/today.json\` に保存せよ。
- **重要**: 今回の調査において、\`data/recommendations/today.json\` 以外のファイル（収集した一時データスクリプトや \`tmp/\` 以下のファイルなど）は**絶対にコミット（Git Commit）しない**。リポジトリに変更を含めるのは \`today.json\` のみとする。
- **検証の強制とエラーハンドリング (最重要)**: 成果物を生成した後、必ず \`uv run python scripts/validate_artifact.py data/recommendations/today.json\` を実行し、構造の正当性やリンク切れ（404エラーなど）がないか確認せよ。もし1件でもエラーが検出された場合は、絶対にそのままコミットやPR作成を完了してはならない。エラーが出た商品を除外し、自律的に新しい実在する商品を検索・調査（\`creators_search_items.py\` や \`creators_get_item.py\` を使用）して、リストを再構築し、再度検証スクリプトを実行せよ。すべての検証（エラー件数0）をパスするまで、この「調査・修正・検証」の自律ループを繰り返すこと。
- **ハルシネーションの厳禁**: ハルシネーション（存在しない商品、架空のセール、実在しないニュースやURLの創作）は厳禁である。必ず実在するエビデンスへのリンクを記載し、APIから取得した実在するASINのみを使用すること。どうしても実在するおすすめ商品が10個に満たない場合は、架空の商品をでっち上げて10個にするのではなく、実在する商品のみで構成したリスト（例: 8個や9個など）で最終出力を作成せよ。ただし、キーワードや検索インデックスを工夫して10個の実在する商品を揃えるための努力を限界まで行うこと。

---

## 出力形式 (JSON)
\`data/recommendations/today.json\` の構造：
\`\`\`json
{
  "date": "${this.today}",
  "headline": "本日の厳選ピックアップ：確かな理由がある注目商品10選",
  "recommendations": [
    {
      "asin": "ASIN",
      "title": "検索タグやSEOキーワードを除いた簡潔な商品名",
      "price": "価格",
      "category": "カテゴリ（10個すべて異なるようにする）",
      "reason": "この商品自体の魅力や優れている点（2〜3文）",
      "whyBuyNow": "なぜ『今日』買うべきなのか（例：本日限定で過去最安値、昨日TVで紹介され品薄必至、など）",
      "rankReason": "選定基準におけるこの商品の掲載・順位理由（例: 他ECサイトより大幅に安い、高スコア、実用性重視、トレンド合致など。20文字以内で簡潔に）",
      "scoreDisclaimer": "低スコア商品に対する注意ラベル。例: 「品質スコアは低め」「実用性重視」など。問題ない、あるいはレビュー記事がない場合は null または空文字",
      "source": {
        "name": "情報元の名称（例：Amazon特選タイムセール、〇〇ニュース、Xトレンド等）",
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

それでは、幅広いカテゴリを対象に情報収集を開始し、明確なエビデンスを持った魅力的な10個の商品を見つけ出す。`;
  }
}
