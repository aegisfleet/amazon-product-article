import fs from 'node:fs';
import path from 'node:path';
import type { DiscoveryCandidatesFile } from '../scripts/extract-discovery-candidates';
import type { SaleCandidatesFile } from '../scripts/extract-sale-candidates';

/**
 * RecommendationPromptBuilder - 本日の注目商品を調査するためのプロンプトを構築
 */

export class RecommendationPromptBuilder {
  private readonly today: string;
  private readonly candidatesPath: string;
  private readonly discoveryPath: string;
  private readonly maxProducts: number;

  constructor(candidatesPath?: string, maxProducts = 10, discoveryPath?: string) {
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
    this.discoveryPath = discoveryPath || path.join(process.cwd(), 'tmp/discovery_candidates.json');
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

      const candidateLines = data.candidates.slice(0, 15).map((item, index) => {
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

## 【系統A：事前抽出された高品質・高スコア候補商品リスト（値下げ・セール。deal枠・seasonal枠の材料）】
以下はキャッシュ上の前回価格比の値下げ、およびセールバッジを基に決定論的に抽出した候補である（直近に掲載した商品は除外済み）。

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

  private loadDiscoveryCandidatesPromptSection(): string {
    if (!fs.existsSync(this.discoveryPath)) {
      return '';
    }

    try {
      const raw = fs.readFileSync(this.discoveryPath, 'utf-8');
      const data = JSON.parse(raw) as DiscoveryCandidatesFile;

      if (!data.candidates || data.candidates.length === 0) {
        return '';
      }

      const lines = data.candidates.slice(0, 20).map((item, index) => {
        const price = item.price ? ` | 価格帯: ${item.price}` : '';
        const image = item.imageUrl ? ` | 画像URL: ${item.imageUrl}` : '';
        return `${index + 1}. ASIN: ${item.asin} | ${item.title} | 検証スコア: ${item.score}点 | 親グループ: ${item.group} | カテゴリ: ${item.category}${price} | 記事: ${item.articlePath}${image}`;
      });

      return `
---

## 【系統B：高スコア名品の発掘候補リスト（gem枠・seasonal枠・niche枠の材料）】
以下はサイト内の詳細検証でスコア80点以上を獲得した名品で、**セール中かどうかは問わない**。日付シードで毎日入れ替わる。直近に掲載した商品・系統Aの商品は除外済み。
- ここに記載の価格は参考値である。\`price\` には \`uv run python scripts/creators_get_item.py <ASIN>\` で取得できた現在価格を設定せよ（取得不可なら記載の価格を数値化）。
- セールバッジを確認できていない商品に、割引・値下げ・セールを示唆する表現を使ってはならない。

${lines.join('\n')}
`;
    } catch {
      return '';
    }
  }

  public build(): string {
    const saleCandidatesSection = this.loadSaleCandidatesPromptSection();
    const discoveryCandidatesSection = this.loadDiscoveryCandidatesPromptSection();
    const n = this.maxProducts;

    return `【ミッション：本日（${this.today}）の「知らなかった良品の再発見＋厳選セール」${n}選の編集】
あなたは読者に「へぇ、これ欲しい」と思わせる商品を見つける、目利きの編集者でもある優秀なAIエージェントとして、Amazon商品の調査・選定を行う。
本日は、特定のジャンルに偏らず、幅広いカテゴリから確かな品質と信頼性を持つ${n}個の商品を厳選せよ。
既存の \`data/recommendations/today.json\` の内容は考慮不要。毎日新しい情報を上書きするため、過去のデータと大きく乖離しても問題ない。本日の季節・生活シーンと最新のセール情報に基づいた、最高の${n}選を提案せよ。
最重要ルールは、**「なぜこの商品を今おすすめするのか」の根拠となる『情報元（エビデンス）』を必ず明記せよ**。客観的な事実に基づかない推奨は無価値である。
${saleCandidatesSection}${discoveryCandidatesSection}
---

## 自律性に関する基本原則（最重要：確認・アドバイス要求の完全禁止と自律完遂）
- **自律的判断と完遂の義務**: あなたには、提供されたツールを駆使してミッションを完遂する全責任がある。ツールのエラーや一時的な情報不足で作業を中断してはならない。
- **完全自動・非同期バッチ実行環境（重要）**: 本システムは完全自動・非同期バッチ（無人環境）で実行されており、ユーザー（人間）からの回答や指示は物理的に一切得られない。質問や相談、確認メッセージを送信した時点でタスクは永久に停止し、完全に失敗・破棄となる。
- **変更確定前（Before finalize）の事前確認・アドバイス要求の完全禁止 (最重要)**:
  「Before I finalize these changes, do you have any additional advice or specific checks you would like me to perform...?」「この内容で確定（finalize）してよろしいでしょうか？」「追加のアドバイスやチェックすべき点はありますか？」といった、**成果物の確定（finalize）・コミット・PR作成前の最終確認やアドバイス要求は絶対に禁止**する。プロンプトに記載された全ルールはすでに確定した要件であり、人間の追加レビューを待つ必要は一切ない。
- **事前抽出候補の最優先活用**: 上記の系統A（値下げ）・系統B（発掘）の候補商品を最優先で採用し、客観的で魅力的な解説文を作成せよ。
- **自己レビューと自律的リトライ**: 選定した商品が不適切（エビデンスが弱い、セールの実態がない、カテゴリが重複しているなど）であると自己レビューで気づいた場合は、立ち止まらずにそれらを除外し、代わりの候補を自律的に選べ。10個すべてが「自信を持って今日おすすめできる」状態になるまで、繰り返し調査と選定を行え。
- **手元データでの自律完遂**: 曖昧な仕様や未決定事項がある場合、またはツールの実行エラーに直面した場合は、手元のデータや文脈から自律的かつ合理的に判断し、あなたの判断だけで処理を完遂すること。

---

## 調査・選定の進め方
1. **品質と信頼性の絶対厳守 (最重要方針)**:
   - **ノーブランド・無名業者の粗悪品（耳かきカメラ、怪しいマッサージ器、ノーブランド充電器等）の混入を絶対に禁止する**。
   - **検証済み記事の存在が必須 (最重要)**: 必ず当リポジトリの \`content/articles/<asin>.md\` が存在するスコア75点以上の商品から選定せよ。記事が存在しない未調査商品（レビューやスコアがない商品）の選定は厳禁とする。
   - 割引率の高さ（「50% OFF」「60% OFF」等の表示）だけで商品を選んではならない。参考価格を吊り上げた二重価格商品を徹底的に排除せよ。
   - 事前抽出候補（系統A・系統B、スコア75点以上の検証済み商品）から${n}品を構成せよ。
   - もし外部から新規商品を採用する場合でも、当サイトに詳細検証記事が存在し、かつ \`data/brandgroups.json\` に登録されている信頼できる有名ブランドかつレビュー評価4.0以上・レビュー件数100件以上の商品に限定せよ。
2. **多角的な商品選定（カテゴリの分散）**:
   - 意図的にジャンルを分散させ、1つのテーマに偏らないようにせよ（同一カテゴリは最大2品まで）。
3. **4枠編集ミックス（\`pickType\`）**: 次の配分で${n}品を構成し、各商品に \`pickType\` を必ず設定せよ。
   - \`deal\`（本気の値下げ）**2品**: 系統Aから。リアルタイムAPIで最新の \`dealBadge\` を確認でき、前回価格より実際に下がっている二重価格でない目玉のみ。
   - \`gem\`（高スコア名品発掘）**3品**: 系統Bから。セール有無を問わず、検証スコアが高く満足度が際立つ名品。
   - \`seasonal\`（季節・生活シーン）**3品**: 系統A・B横断。実行日（${this.today}）の季節・気候・行事（防寒、乾燥対策、新生活、帰省、年末年始など）に刺さるもの。
   - \`niche\`（ニッチ・課題解決）**2品**: 系統B中心。自分では検索しないが「言われてみれば欲しい」一点突破型の便利・面白アイテム。
   - \`deal\` 枠にできる商品が不足する場合は、無理にセール品で埋めず他枠へ振り替えてよい（\`deal\` は最大でも5品以下）。
4. **記事コンテンツの参照（必須）**: 選定した${n}品すべてについて \`content/articles/<asin（小文字）>.md\` を読み込み、記事内のレビュー検証上の強み・解決する悩み・利用シーンを根拠に \`catchphrase\` / \`reason\` / \`whyBuyNow\` を執筆せよ。記事にない性能や用途を創作してはならない。
5. **外部Webエビデンスの調査と引用（必須）**:
   - 非セール枠（\`gem\` / \`seasonal\` / \`niche\`）として選定した各商品について、Web検索を行い以下のいずれかの**実在する外部URL**を必ず1件取得して \`source.name\` と \`source.url\` に設定せよ（\`amazon.co.jp\`・\`amzn.to\`・\`amzn.asia\`・\`amazon-hikaku.com\` は設定禁止）：
     - 第三者の受賞歴・アワードページ（グッドデザイン賞、VGP、価格.comプロダクトアワード等）
     - 専門メディア・比較メディアのレビュー／特集記事（家電Watch、AV Watch、ITmedia、マイベスト等）
     - メーカー公式サイトの製品詳細・技術解説ページ（プレスリリース含む）
     - 季節枠における公的・専門の季節／気象／生活トレンド記事
   - \`source.name\` に「サイト内」「当サイト」「amazon-hikaku」等の自己言及表現を含めることは**厳禁**とする。
   - 取得した外部ソースの具体的な事実（受賞名、メディアでの評価点、メーカー独自の技術や開発背景、最新の気象・季節動向など）を1点以上 \`whyBuyNow\` に自然に織り込み、「年末だから」「帰省シーズンだから」だけの汎用的な記述を禁止する。
   - 外部URLが見つからない、またはアクセス不可（404/403等）で \`validate_artifact.py\` を通過できない商品は採用せず、系統Bの別候補へ自律的に差し替えよ。推測・記憶によるURLの捏造は厳禁。
6. **並び順**: 読者が最初に「おっ」と思う順（意外性・季節との相性・満足度の高さ）に並べよ。セール枠を機械的に上位へ固めないこと。
   - **セール理由の捏造（ハルシネーション）の完全禁止**:
     - **セールバッジのない通常商品へのセール表現の完全禁止 (最重要)**:
       API（\`creators_get_item.py\`）で最新の \`dealBadge\` が確認できない商品に、メーカー参考価格からの通常値引き率を口実に「◯% OFF」「割引対象」「セール」等の表記を \`rankReason\` / \`whyBuyNow\` / \`source.name\` に付与することは**厳禁**とする。
     - **「クーポン適用」「クーポン対象」等のクーポン表現の完全禁止 (最重要)**:
        事前抽出リストやCreators APIには「商品ページで適用するクーポン」の情報は含まれず、判定も保証も不可能である。「クーポン」という語は一切使用してはならない。割引の記載は本体価格自体の割引事実のみを客観的に記述せよ。
   - **実在するASINと最新API状態の絶対保証**: 事前抽出候補を最優先で採用し、可能であれば \`uv run python scripts/creators_get_item.py ASIN\` で現在の最新価格と \`dealBadge\` を取得せよ。架空のASINは絶対に生成・追加してはならない。
   - **API実行不可時の自律フォールバック**: 認証エラー等で \`creators_get_item.py\` が実行できない場合も作業を中断せず、候補リストの ASIN・商品名・カテゴリ・価格・画像URLを活用して構成せよ。この場合セール表現は使わず \`deal\` 枠は作らないこと。
7. **選定理由の明記と多様化**:
   - 同じ文言を安易にコピペしてはならない。\`rankReason\` には枠に応じた具体的な掲載理由（例: \`高スコア名品発掘\`, \`冬の乾燥対策\`, \`言われてみれば欲しい\`, \`前回比15%値下げ\` など、20文字以内）を設定せよ。
8. **文章品質ルール（厳守）**:
   - \`catchphrase\`: 25〜45文字。読者が1秒で興味を持てる結論・フック。
   - \`reason\`: 2文・120文字以内（目安80〜100文字）。スペックの羅列は禁止。「どんな不便をどう解決するか／何が面白いのか」を体験ベースで書く。数値仕様は \`highlights\` に回し重複させない。
   - \`whyBuyNow\`: 画一的なテンプレート禁止。\`deal\` 枠は前回価格・割引の事実を簡潔に述べ、\`gem\` / \`seasonal\` / \`niche\` 枠は価格ではなく「今の生活シーンでの価値・選ぶべき理由」と外部ソースから得た具体事実を書く。
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
      "pickType": "deal | gem | seasonal | niche のいずれか（配分: deal 2 / gem 3 / seasonal 3 / niche 2）",
      "catchphrase": "読者が1秒で興味を持つ結論・フック（25〜45文字）",
      "reason": "不便をどう解決するか／何が面白いのかを体験ベースで2文・120文字以内。スペック羅列禁止",
      "whyBuyNow": "dealは前回価格・割引の事実を簡潔に。gem/seasonal/nicheは今の生活シーンでの価値・選ぶ理由と外部ソースの具体事実。※「クーポン」という表現は使用厳禁。「Keepa」への言及も禁止。セールバッジがない商品に割引表現は禁止",
      "rankReason": "枠に応じた掲載理由（20文字以内。「クーポン」表記は禁止。セールバッジがない商品に「◯% OFF」は禁止）",
      "scoreDisclaimer": null,
      "source": {
        "name": "外部情報元の具体名称（deal枠: Amazon タイムセール等 / 非セール枠: グッドデザイン賞 受賞ページ、家電Watch レビュー、メーカー公式製品ページ等。※「サイト内」「当サイト」「クーポン」表記は厳禁）",
        "url": "実在するエビデンスURL（deal枠のみAmazon商品ページ可。gem/seasonal/niche枠はamazon.co.jpおよびamazon-hikaku.com以外の実在する外部URLが必須）"
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
- [ ] 非セール枠（\`gem\` / \`seasonal\` / \`niche\`）の全商品に、\`amazon.co.jp\`・自サイト以外の実在する外部URLが \`source.url\` として設定され、リンクチェックを通過している。
- [ ] \`uv run python scripts/validate_artifact.py data/recommendations/today.json\` を実行し、エラー件数が0件である。
- [ ] \`today.json\` 以外の不要な一時ファイルやスクリプトがコミットに含まれていない。
- [ ] **ユーザーへの確認メッセージ（Before finalize等の事前相談）を送信せず、自律的に直接コミット・Pull Request作成まで完了（finalize）している。**

それでは、高品質な候補商品を中心に選定を開始し、客観的なエビデンスを持った魅力的な${n}個の厳選リストを作成せよ。検証スクリプトをエラー0件で通過した後は、人間への確認・相談を一切挟むことなく、自律的に直ちにコミットおよびPull Requestの作成（finalize）まで完了させよ。`;
  }
}
