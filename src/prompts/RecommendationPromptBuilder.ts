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

      const candidateLines = data.candidates.slice(0, 10).map((item, index) => {
        const limitedLabel = item.isLimitedTimeSale ? '🔥【限定セール】' : '';
        const badge = item.dealBadge ? ` [${item.dealBadge}]` : '';
        const discount = item.savingsPercentage ? ` (${item.savingsPercentage}% OFF)` : '';
        const drop =
          item.previousPrice && item.priceDropRate
            ? ` 【前回価格 ￥${item.previousPrice.toLocaleString('ja-JP')} → ${item.priceDropRate}%値下がり】`
            : '';
        const scoreLabel = item.articleScore ? ` 【検証スコア: ${item.articleScore}点】` : '';
        const brandLabel = item.brand ? ` 【ブランド: ${item.brand}】` : '';
        const imageUrlStr = item.imageUrl ? ` | 画像URL: ${item.imageUrl}` : '';
        return `${index + 1}. ${limitedLabel}ASIN: ${item.asin} | ${item.title} | カテゴリ: ${item.category}${scoreLabel}${brandLabel} | 価格: ${item.price.formatted}${badge}${discount}${drop}${imageUrlStr}`;
      });

      return `
---

## 【参考候補：キャッシュ上の実値下げ・セール候補（最大10件・deal枠の材料）】
以下はキャッシュ上の前回価格比の値下げ、およびセールバッジを基に決定論的に抽出した候補である（直近に掲載した商品は除外済み）。あくまで \`deal\` 枠（2〜3品）の参考リストであり、10品すべてをこのリストから選んではならない。

⚠️ **【リアルタイムAPI検証の義務】** ⚠️
- ここに記載されたセールバッジや価格は「過去のキャッシュ情報」に過ぎない。**採用する際は必ず事前に \`uv run python scripts/creators_get_item.py <ASIN>\` を実行し、現在の最新の \`dealBadge\` と価格を確認せよ**。
- 最新情報でセールが終了していた商品は \`deal\` 枠に使わず、他の候補を優先せよ（\`gem\` / \`seasonal\` 枠としては、割引表現を一切使わずに採用してよい）。
- 価格の安さの判断は、本リストの「前回価格」とAPIの最新情報のみを根拠とする。外部の価格推移グラフ等には依存しない。

${candidateLines.join('\n')}
`;
    } catch {
      return '';
    }
  }

  public build(): string {
    const saleCandidatesSection = this.loadSaleCandidatesPromptSection();
    const n = this.maxProducts;

    return `【ミッション：本日（${this.today}）の「知らなかった良品の再発見＋厳選セール」${n}選の編集】
あなたは読者に「へぇ、これ欲しい」と思わせる商品を見つける、目利きの編集者でもある優秀なAIエージェントとして、Amazon商品の調査・選定を行う。
本日は、特定のジャンルに偏らず、幅広いカテゴリから確かな品質と信頼性を持つ${n}個の商品を厳選せよ。
既存の \`data/recommendations/today.json\` の内容は考慮不要。毎日新しい情報を上書きするため、過去のデータと大きく乖離しても問題ない。本日の季節・生活シーンと最新のセール情報に基づいた、最高の${n}選を提案せよ。
最重要ルールは、**「なぜこの商品を今おすすめするのか」の根拠となる『情報元（エビデンス）』を必ず明記せよ**。客観的な事実に基づかない推奨は無価値である。
${saleCandidatesSection}
---

## 自律性に関する基本原則（最重要：確認・アドバイス要求の完全禁止と自律完遂）
- **自律的判断と完遂の義務**: あなたには、提供されたツールを駆使してミッションを完遂する全責任がある。ツールのエラーや一時的な情報不足で作業を中断してはならない。
- **完全自動・非同期バッチ実行環境（重要）**: 本システムは完全自動・非同期バッチ（無人環境）で実行されており、ユーザー（人間）からの回答や指示は物理的に一切得られない。質問や相談、確認メッセージを送信した時点でタスクは永久に停止し、完全に失敗・破棄となる。
- **変更確定前（Before finalize）の事前確認・アドバイス要求の完全禁止 (最重要)**:
  「Before I finalize these changes, do you have any additional advice or specific checks you would like me to perform...?」「この内容で確定（finalize）してよろしいでしょうか？」「追加のアドバイスやチェックすべき点はありますか？」といった、**成果物の確定（finalize）・コミット・PR作成前の最終確認やアドバイス要求は絶対に禁止**する。プロンプトに記載された全ルールはすでに確定した要件であり、人間の追加レビューを待つ必要は一切ない。
- **外部メディア起点＋未登録3〜5品の必須構成**: 参考候補（実値下げリスト）だけで10品を埋めることは禁止する（\`creators_search_items.py\` / \`creators_get_item.py\` が実行不可な環境へのフォールバック時のみ例外）。必ず外部メディアの直近記事・受賞・新発売情報から**サイト未登録の新規トレンド商品を最低3品・最大5品**発掘し、既存記事ありの商品（5〜7品）と組み合わせて計${n}品を構成せよ。
- **自己レビューと自律的リトライ**: 選定した商品が不適切（エビデンスが弱い、セールの実態がない、カテゴリが重複しているなど）であると自己レビューで気づいた場合は、立ち止まらずにそれらを除外し、代わりの候補を自律的に選べ。10個すべてが「自信を持って今日おすすめできる」状態になるまで、繰り返し調査と選定を行え。
- **手元データでの自律完遂**: 曖昧な仕様や未決定事項がある場合、またはツールの実行エラーに直面した場合は、手元のデータや文脈から自律的かつ合理的に判断し、あなたの判断だけで処理を完遂すること。

---

## 調査・選定の進め方
1. **品質と信頼性の絶対厳守 (最重要方針)**:
   - **ノーブランド・無名業者の粗悪品（耳かきカメラ、怪しいマッサージ器、ノーブランド充電器等）の混入を絶対に禁止する**。
   - **既存記事あり商品（5〜7品）とサイト未登録商品（必須：3〜5品）の配分**:
     - **未登録の新規トレンド商品（必須：3〜5品）**: 実行日（${this.today}）から直近7〜30日以内の国内主要メディア（ASCII.jp、家電Watch、AV Watch、価格.comマガジン、ITmedia、Gizmodo Japan、ROOMIE、MONOQLO、マイベスト等）やアワード発表（VGP、グッドデザイン賞、価格.comプロダクトアワード等）をWeb検索し、**今まさに話題・新発売・実機高評価・大幅値下げされている商品**から、当リポジトリに未登録（\`data/investigations/<ASIN>.json\` も \`content/articles/<asin>.md\` も存在しない）の商品を**最低3品・最大5品**必ず選定せよ。
     - **既存記事ありの商品（5〜7品）**: 参考候補（実値下げリスト）からの本気の目玉（2〜3品）に加え、外部メディアの直近記事で見つけた商品のうち当リポジトリに \`content/articles/<asin（小文字）>.md\` が存在する商品（スコア75点以上）を組み合わせて計${n}品を構成せよ。
     - **既存商品だけで10品を埋めることは禁止**（ただし認証エラー等で \`creators_search_items.py\` / \`creators_get_item.py\` が一切実行できない環境へのフォールバック時のみ例外とする）。
     - ノーブランド粗悪品・無名業者の製品・架空ASINの混入は厳禁とする。
   - 割引率の高さ（「50% OFF」「60% OFF」等の表示）だけで商品を選んではならない。参考価格を吊り上げた二重価格商品を徹底的に排除せよ。
2. **外部メディア起点の選定＆ASIN特定フロー**:
   - **ステップ1（直近の外部トレンド・記事リサーチ）**: 実行日（${this.today}）から直近7〜30日以内の国内主要メディアやアワード発表をWeb検索し、**「今まさに話題・高評価・新発売・大幅値下げされている商品」**を起点に候補を洗い出せ。
   - **ステップ2（\`creators_search_items.py\` によるASIN特定と \`creators_get_item.py\` による実在確定）**:
     1. 記事内の商品名・型番で \`uv run python scripts/creators_search_items.py "<商品名・型番>"\` を実行し、\`tmp/search_results.json\` から正確な10桁ASINを特定せよ（必要に応じ \`--search-index Electronics\` や \`-o tmp/search_out.json\` を使用）。
     2. 特定したASINに対し \`uv run python scripts/creators_get_item.py <ASIN>\` を実行し、実在・在庫あり・最新価格・\`dealBadge\`・画像URLを確認せよ。
     3. 取得できたASINについて \`data/investigations/<ASIN>.json\` および \`content/articles/<asin（小文字）>.md\` の有無を確認し、既存枠（5〜7品）か未登録枠（3〜5品）かを正確にカウントせよ。
3. **多角的な商品選定（カテゴリの分散）**:
   - 意図的にジャンルを分散させ、1つのテーマに偏らないようにせよ（同一カテゴリは最大2品まで）。
4. **4枠編集ミックス（\`pickType\`）**: 次の配分で${n}品を構成し、各商品に \`pickType\` を必ず設定せよ。
   - \`deal\`（本気の値下げ）**2〜3品**: 参考候補（実値下げリスト）または外部セール速報から。リアルタイムAPIで最新の \`dealBadge\` を確認でき、前回価格より実際に下がっている二重価格でない目玉のみ。
   - \`gem\`（話題・高評価名品）**2〜3品**: 外部メディアの高評価レビューやアワード受賞作。
   - \`seasonal\`（季節・最新トレンド）**2〜3品**: 実行日（${this.today}）の季節・気候・最新トレンドに刺さるもの。
   - \`niche\`（ニッチ・課題解決）**2品**: 自分では検索しないが「言われてみれば欲しい」一点突破型の便利・面白アイテム。
   - \`deal\` は最大でも5品以下を維持せよ。
5. **記事コンテンツの参照（既存記事あり・未登録の分岐）**:
   - \`content/articles/<asin（小文字）>.md\` が存在する商品 → 記事を読み込み、レビュー検証上の強み・解決する悩みを反映して執筆せよ。
   - 未登録の新規商品 → 取得した外部メディア記事の内容と \`creators_get_item.py\` の実データのみを根拠に執筆せよ（記事にない性能や評価を創作してはならない）。
6. **外部Webエビデンスの調査と引用・静的カタログ引用の禁止（必須）**:
   - 非セール枠（\`gem\` / \`seasonal\` / \`niche\`）として選定した各商品について、Web検索を行い**公開日・受賞年・セール情報などの時事性または第三者評価がある実在の外部記事URL**を必ず1件取得して \`source.name\` と \`source.url\` に設定せよ（\`amazon.co.jp\`・\`amzn.to\`・\`amzn.asia\`・\`amazon-hikaku.com\` は設定禁止）：
     - 専門メディア・比較メディアのレビュー／特価／特集記事（ASCII.jp、家電Watch、AV Watch、価格.comマガジン、ITmedia、Gizmodo Japan、ROOMIE、MONOQLO、マイベスト等）
     - 第三者の受賞歴・アワードページ（VGP、グッドデザイン賞、価格.comプロダクトアワード等）
     - 新発売・アップデートを報じる最新プレスリリース
     - 季節枠における公的・専門の季節／気象／生活トレンド記事
   - **メーカー公式の静的な製品紹介ページ（公式製品ページ・公式製品・成分ページ・公式オンラインショップ等）を \`whyBuyNow\` のエビデンスや \`source\` として使うことは禁止する**。仕様の裏取りにはなっても「今買い時である理由」にならないためである。
   - \`source.name\` に「サイト内」「当サイト」「amazon-hikaku」「公式製品ページ」「公式ショップ」等の表現を含めることは**厳禁**とする。
   - \`whyBuyNow\` の1文目には、必ず**「いつ・どこで・何が起きているか」**（例：「11月のASCII.jp記事で特価紹介」「2026年アワード受賞」「前回価格から25%値下げの限定セール中」「新モデル発売で注目」）を具体的に書き、「冬の〜に最適です」「年末年始に〜」だけの汎用トークで埋めないこと。
   - 外部URLが見つからない、またはアクセス不可（404/403等）で \`validate_artifact.py\` を通過できない商品は採用せず、別候補へ自律的に差し替えよ。推測・記憶によるURLの捏造は厳禁。
7. **並び順**: 読者が最初に「おっ」と思う順（意外性・今話題の時事性・満足度の高さ）に並べよ。セール枠を機械的に上位へ固めないこと。
   - **セール理由の捏造（ハルシネーション）の完全禁止**:
     - **セールバッジのない通常商品へのセール表現の完全禁止 (最重要)**:
       API（\`creators_get_item.py\`）で最新の \`dealBadge\` が確認できない商品に、メーカー参考価格からの通常値引き率を口実に「◯% OFF」「割引対象」「セール」等の表記を \`rankReason\` / \`whyBuyNow\` / \`source.name\` に付与することは**厳禁**とする。
     - **「クーポン適用」「クーポン対象」等のクーポン表現の完全禁止 (最重要)**:
        事前抽出リストやCreators APIには「商品ページで適用するクーポン」の情報は含まれず、判定も保証も不可能である。「クーポン」という語は一切使用してはならない。割引の記載は本体価格自体の割引事実のみを客観的に記述せよ。
   - **実在するASINと最新API状態の絶対保証**: \`uv run python scripts/creators_get_item.py ASIN\` で現在の最新価格と \`dealBadge\` を取得せよ。架空のASINは絶対に生成・追加してはならない。
   - **API実行不可時の自律フォールバック**: 認証エラー等で \`creators_get_item.py\` / \`creators_search_items.py\` が実行できない場合も作業を中断せず、参考候補リストの ASIN・商品名・カテゴリ・価格・画像URLを活用して構成せよ。この場合、未登録商品の採用およびセール表現・\`deal\` 枠の作成は行わないこと。
8. **選定理由の明記と多様化**:
   - 同じ文言を安易にコピペしてはならない。\`rankReason\` には枠に応じた具体的な掲載理由（例: \`VGP2026受賞\`、\`ASCIIレビュー高評価\`、\`冬の乾燥対策\`、\`前回比15%値下げ\` など、20文字以内）を設定せよ。
9. **文章品質ルール（厳守）**:
   - \`catchphrase\`: 25〜45文字。読者が1秒で興味を持てる結論・フック。
   - \`reason\`: 2文・120文字以内（目安80〜100文字）。スペックの羅列は禁止。「どんな不便をどう解決するか／何が面白いのか」を体験ベースで書く。数値仕様は \`highlights\` に回し重複させない。
   - \`whyBuyNow\`: 画一的なテンプレート禁止。1文目に「いつ・どこで・何が起きているか」を明記し、\`deal\` 枠は前回価格・割引の事実を簡潔に述べ、\`gem\` / \`seasonal\` / \`niche\` 枠は外部メディア記事・受賞・トレンドの具体事実を書く。
   - \`highlights\`: ちょうど3項目、各25文字以内の短い仕様タグ。
   - \`todayOverview\`: 1〜2文・120文字以内（目安80文字）。読者向けの語り口で季節感と今日の編集方針を書く。
   - **禁止事項**: 「Keepa」への言及、「Creators API」「キャッシュ」等のシステム処理報告・内部ツール言及、システムログ口調、\`reason\` と \`highlights\` のスペック重複、冗長な文章。

---

## 成果物の作成とセルフ検証・直時完了
- 調査結果を \`data/recommendations/today.json\` に保存せよ。
- **重要**: 今回の調査において、\`data/recommendations/today.json\` 以外のファイル（収集した一時データスクリプトや \`tmp/\` 以下のファイルなど）は**絶対にコミット（Git Commit）しない**。リポジトリに変更を含めるのは \`today.json\` のみとする。
- **セルフ検証の強制とエラーハンドリング (最重要)**: 成果物を生成した後、必ず \`uv run python scripts/validate_artifact.py data/recommendations/today.json\` を実行し、構造の正当性やリンク切れ（404エラーなど）がないか確認せよ。もし1件でもエラーが検出された場合は、絶対にそのままコミットやPR作成を完了してはならない。エラーが出た商品を除外し、自律的に新しい実在する商品を検索・調査して、リストを再構築し、再度検証スクリプトを実行せよ。すべての検証（エラー件数0）をパスするまで、この「調査・修正・検証」の自律ループを繰り返すこと。
- **セルフ検証完了後の自律的 Finalize（PR作成）義務**:
  セルフ検証スクリプト（\`validate_artifact.py\`）がエラー0件でパスした時点で、あなたの作業は成功である。**人間に事前の確認やアドバイスを一切求めることなく、直ちに \`data/recommendations/today.json\` をコミットし、自律的に Pull Request を作成してセッションを完了（finalize）せよ。**
- **ハルシネーションの厳禁**: ハルシネーション（存在しない商品、架空のセール、実在しないニュースやURLの創作）は厳禁である。必ず実在するエビデンスへのリンクを記載し、APIから取得した実在するASINのみを使用すること。

---

## 出力形式 (JSON)
\`data/recommendations/today.json\` の構造：
\`\`\`json
{
  "date": "${this.today}",
  "headline": "本日の厳選ピックアップ：（季節感のある一文）${n}選",
  "recommendations": [
    {
      "asin": "ASIN",
      "title": "検索タグやSEOキーワードを除いた簡潔な商品名",
      "price": 1980,
      "category": "カテゴリ（同一カテゴリは最大2品まで）",
      "pickType": "deal | gem | seasonal | niche のいずれか（配分: deal 2〜3 / gem 2〜3 / seasonal 2〜3 / niche 2）",
      "catchphrase": "読者が1秒で興味を持つ結論・フック（25〜45文字）",
      "reason": "不便をどう解決するか／何が面白いのかを体験ベースで2文・120文字以内。スペック羅列禁止",
      "whyBuyNow": "1文目に『いつ・どこで・何が起きているか』を明記。dealは前回価格・割引の事実を簡潔に。gem/seasonal/nicheは外部メディア記事・受賞の具体事実。※「クーポン」という表現は使用厳禁。「Keepa」への言及も禁止。セールバッジがない商品に割引表現は禁止",
      "rankReason": "枠に応じた掲載理由（20文字以内。「クーポン」表記は禁止。セールバッジがない商品に「◯% OFF」は禁止）",
      "scoreDisclaimer": null,
      "source": {
        "name": "外部情報元の具体名称（deal枠: Amazon タイムセール等 / 非セール枠: ASCII.jp レビュー記事、家電Watch 特集、VGP 2026 受賞結果等。※「公式製品ページ」「サイト内」「当サイト」「クーポン」表記は厳禁）",
        "url": "実在するエビデンスURL（deal枠のみAmazon商品ページ可。gem/seasonal/niche枠はamazon.co.jpおよびamazon-hikaku.com以外の時事性・第三者評価のある外部URLが必須）"
      },
      "highlights": ["短い仕様タグ1（25文字以内）", "短い仕様タグ2（25文字以内）", "短い仕様タグ3（25文字以内）"],
      "url": "https://www.amazon.co.jp/dp/ASIN/",
      "imageUrl": "画像のURL（APIまたは候補リストから取得。不明な場合は null。複数商品への同一URLコピペ厳禁）"
    }
  ],
  "searchContext": {
    "todayOverview": "季節感と本日の編集方針を読者向けに1〜2文・120文字以内で（システム処理や内部ツールへの言及禁止）",
    "searchedCategories": ["探索したカテゴリ1", "カテゴリ2", "カテゴリ3", "..."]
  }
}
\`\`\`

※ **フィールド値に関する重要ルール**:
- **price**: 必ず 0 より大きい実際の販売価格（日本円の数値）を設定すること（\`price: 0\` は禁止）。APIから取得できない場合でも、上記の候補リストに記載された価格を設定せよ。
- **imageUrl**: 同一の画像URLを複数商品にコピペすることは厳禁とする。APIから正式に取得できない場合や不明な場合は、候補リストの画像URLを使用せよ。それでも不明な場合は無理にURLを設定せず必ず \`null\` とせよ。

---

## 完了の条件（チェックリスト）
以下の条件をすべて満たしてセッションを終了すること：
- [ ] \`data/recommendations/today.json\` が生成され、${n}件の厳選商品が含まれている。
- [ ] ${n}品のうち、サイト未登録の新規トレンド商品が3〜5品（既存記事あり5〜7品）含まれており、全件の実在・最新価格を Creators API で確認している。
- [ ] 非セール枠（\`gem\` / \`seasonal\` / \`niche\`）の全商品に、\`amazon.co.jp\`・自サイト以外の実在する外部URLが \`source.url\` として設定され、リンクチェックを通過している。
- [ ] \`uv run python scripts/validate_artifact.py data/recommendations/today.json\` を実行し、エラー件数が0件である。
- [ ] \`today.json\` 以外の不要な一時ファイルやスクリプトがコミットに含まれていない。
- [ ] **ユーザーへの確認メッセージ（Before finalize等の事前相談）を送信せず、自律的に直接コミット・Pull Request作成まで完了（finalize）している。**

それでは、高品質な候補商品を中心に選定を開始し、客観的なエビデンスを持った魅力的な${n}個の厳選リストを作成せよ。検証スクリプトをエラー0件で通過した後は、人間への確認・相談を一切挟むことなく、自律的に直ちにコミットおよびPull Requestの作成（finalize）まで完了させよ。`;
  }
}
