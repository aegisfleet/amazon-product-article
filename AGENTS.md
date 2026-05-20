# AIエージェント開発ガイドライン

このドキュメントは、Amazon商品調査システムに携わるAIコーディングエージェントのためのベストプラクティス、必須手順、およびコード規約を体系的にまとめたものである。

## 1. 開発方針と基本原則

### 1.1 セキュリティと認証情報

Amazon Creators APIの認証情報の取り扱いには、最優先でセキュリティを確保すること。

- **ログ出力の禁止**:
  `AMAZON_CREATORS_APPLICATION_ID`, `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET`
  をコンソール、ログ、ファイル、またはコミットメッセージに出力しないこと。
- **環境変数の利用**: 秘密情報には `process.env` を通じてアクセスすること。キーをハードコードしたり、平文のファイルに保存したりしないこと。
- **エラーメッセージ**: API失敗時のエラーハンドリングで機密情報が漏洩しないようにすること。

### 1.2 コミュニケーション

- 積極的に提案を行いつつも、既存の設計パターンを尊重すること。
- 要件が曖昧な場合は、実装を進める前にユーザーに確認を行うこと。
- 変更内容は `walkthrough.md` に明確に記録すること。

---

## 2. 品質管理とワークフロー

### 2.1 必須の検証手順

いかなるタスクも、以下のコマンドが正常終了することを確認するまでは完了とみなしてはならない。

- **Biome (コード・定義検証)**: `pnpm run biome:check`
  - ソースコードおよび手動管理定義JSON（`brandgroups.json`, `categorygroups.json` 等）の構文・フォーマットエラーが0件であることを確認する。自動フォーマットを適用する場合は `pnpm run biome:fix` を使用すること。
- **Lint**: `pnpm run lint`
  - ESLintエラーが0件であることを確認する。
- **ビルド**: `pnpm run build`
  - TypeScriptのコンパイルエラーがないことを確認する。
- **サーバー起動 (ブラウザ確認時)**: `pnpm run server:dev`
  - ブラウザでの動作確認（`browser_subagent` 等）を行う場合は、事前にバックグラウンド等でサーバーを起動しておくこと。
- **テスト**: `pnpm test`
  - すべてのユニットテストおよびプロパティベースのテストがパスすることを確認する。
- **アーティファクト検証**: `python scripts/validate_artifact.py <生成したJSONファイル>`
  - 調査結果や推薦リストの生成・修正を行った場合は必ず実行すること。

> [!IMPORTANT]
> GitHub Actions CIはLintやBiomeのエラーがあると失敗する。実装完了前に必ず `pnpm run biome:check` および `pnpm run lint` を実行し、エラーが0件であることを確認すること。

### 2.2 テスト駆動開発 (TDD)

可能な限りTDDを採用すること。

1. **まずテストを書く**: `src/**/__tests__/` に期待される挙動を定義するテストケースを作成・更新する。
2. **実装・修正**: テストをパスさせるために必要な最小限のコードを書く。
3. **リファクタリング**: テスト成功を維持しながらコードを整理する。

### 2.3 コードレビュー方針

- **`data/` ディレクトリ配下**: レビュー対象外とする。自動生成ファイル（商品調査結果、キャッシュ、メタデータ）は、既存データとの整合性よりも「最新情報であること」を優先する。
- **ユーザーストーリー**: 根拠（レビューや記事等のエビデンス）が見つからないストーリーは安易に作成せず、必要に応じて削除すること。
- **価格の妥当性**: 異常な割引率（80%～90%等）の商品は、二重価格表示の可能性があるため推奨対象から除外すること。

### 2.4 開発環境

- **パッケージマネージャー**: 本プロジェクトでは **pnpm** を使用する。`npm` や `yarn` は使用しないこと。依存関係をインストールする際は、不慮のロックファイル更新を防ぐため、必ず `pnpm install --frozen-lockfile` を実行すること。
- **ローカルサーバー**: `http://localhost:1313/`
- **サーバー起動手順**:
  ブラウザテストや目視確認を行う前には、以下のコマンドでサーバーを起動すること。
  ```bash
  # バックグラウンドで起動する場合 (Windows PowerShell)
  Start-Process pnpm -ArgumentList "run", "server:dev" -WindowStyle Hidden
  
  # または通常通り起動
  pnpm run server:dev
  ```
- **サーバー停止手順**:
  作業終了後、不要になったサーバーは `Ctrl+C` またはプロセス終了で停止すること。

---

## 3. 構成と実装規約

### 3.1 リポジトリ構造

- `/scripts/`: Creators APIとの直接的なやりとりやデータ収集用のPythonスクリプト。
- `/src/scripts/`: メインアプリケーションのTypeScript CLIエントリポイント。
- `/data/`: 商品データや調査結果。一時ファイルはコミットしないこと。

### 3.2 UI/UX 実装（コンポーネントの同期）

商品の魅力を伝えるUIコンポーネントは、以下の箇所で整合性を保つように実装すること。

| 場所 | 実装ファイル | 役割 |
|---|---|---|
| **商品詳細 (ヒーローカード)** | `layouts/partials/product-hero.html` | 記事冒頭のメインカード |
| **子カテゴリ一覧** | `layouts/_default/list.html` | 詳細・子カテゴリページのリスト項目 |
| **親カテゴリ一覧** | `layouts/_default/parent-category.html` | 親カテゴリページのリスト項目 |
| **検索/ウィジェット** | `layouts/partials/product-card.html` | その他の汎用カード部品 |

> [!NOTE]
> すべて Hugo テンプレート側で HTML を生成する。`ArticleGenerator.ts` は Front Matter へのデータ出力のみを担当する。

---

## 4. データ管理とキャッシュ

### 4.1 カテゴリグループ管理

カテゴリを親グループに整理する際は、**`data/categorygroups.json` のみ編集する**こと。

- **ソート順**: Unicodeコードポイント順（英数字 > ひらがな > カタカナ > 漢字）を維持すること。
  迷った場合は `pnpm run sort:categories` を実行すること。
- **新規追加後の手順**: `pnpm run prebuild:hugo` を実行し、`data/categories.yml` 等が
  自動生成・更新されることを確認すること。

### 4.2 キャッシュ管理ツール

キャッシュ操作時は自作スクリプトを作成せず、以下のツールを優先的に使用すること。

| スクリプト | 用途 | 使用例 |
|---|---|---|
| `scripts/reset-cache-timestamp.ts` | ASIN単位のリセット | `scripts/... B003AZZS4A` |
| `scripts/reset-category-cache.ts` | カテゴリ単位のリセット | `scripts/... "カテゴリー名"` |

> [!NOTE]
> 使用例の詳細はスクリプトのヘルプ、またはソースコードを参照すること。

### 4.3 定義ファイルのフォーマットと整合性
手動で編集するカテゴリ定義（`data/categorygroups.json`）およびブランド定義（`data/brandgroups.json`）は、ネストが深く括弧の記述ミスが発生しやすい。
これらのファイルを編集した後は、必ず `pnpm run biome:check` を実行し、構文エラーがないことを検証すること。フォーマットの崩れは `pnpm run biome:fix` で自動整形できる。

---

## 5. 調査ツールとプロンプト

### 5.1 Creators API 調査ツール

以下のスクリプトは編集せずに使用すること。

| スクリプト | 用途 | 出力先 |
|---|---|---|
| `scripts/creators_get_item.py` | 商品詳細取得 | `tmp/product_info.json` |
| `scripts/creators_search_items.py` | 競合商品検索 | `tmp/search_results.json` |

### 5.2 プロンプト管理（JulesInvestigator）

`src/jules/JulesInvestigator.ts` 等のプロンプトを編集する際は以下を遵守すること。

- **構文維持**: 巨大なテンプレートリテラルのバックティックや波括弧の対応を壊さないこと。
- **フレーズの維持**: プロパティテストでチェックされている特定の指示やキーワードを慎重に扱うこと。
- **変更後の検証**: `pnpm test src/jules/__tests__/JulesInvestigator.property.test.ts` を必ず実行すること。
