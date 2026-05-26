---
description: カテゴリの調査・除外・修正およびキャッシュリセットの手順
---

# カテゴリ管理ワークフロー

商品カテゴリが正しく判定されない場合（例：「その他」になる）や、不適切なカテゴリ（ジャンクカテゴリ）が混入した場合の調査と修正手順です。

## 1. 調査 (Investigation)

### 1.1 キャッシュ内の検索
特定のキーワードが含まれるカテゴリがどの程度存在するか、キャッシュファイルを確認します。

```bash
# Windows (PowerShell)
grep "キーワード" data/cache/paapi-product-cache.json
```

### 1.2 生データの取得
Amazon Creators APIから返される生のBrowseNode情報を確認します。

```bash
uv run python scripts/debug_dump.py <ASIN>
```
実行すると `tmp/debug_output.json` に生成されます。

### 1.3 正規化プロセスの詳細確認
現在のロジックでどのBrowseNodeが選ばれ、どのようなスコア・深さ（Depth）になっているかを詳しく確認します。

```bash
npx ts-node tmp/repro_issue.ts <ASIN>
```
実行すると `tmp/repro_results.txt` に詳細な判定プロセスが出力されます。どのノードが `Depth` や `Score` で競り合っているかを特定するのに非常に有効です。

## 2. 正規化ロジックの修正 (Correction)

### 2.1 テストケースの追加 (TDD)
修正前に、期待する動作（除外されるべき名前が `false` になる、など）を `src/utils/CategoryNormalizer.test.ts` に追加します。

```typescript
it('should return false for junk category', () => {
    expect(CategoryNormalizer.isValidCategoryName('ジャンク名')).toBe(false);
});
```

### 2.2 ロジックの更新
`src/utils/CategoryNormalizer.ts` を修正します。

- **`blacklist` / `invalidPatterns`**: 不適切なカテゴリ（ジャンクカテゴリ）を除外する場合。特定のサービス名（「パントリー」など）やブランド名（「コクヨ」など）が含まれるカテゴリを弾くのに有効です。
- **`preferredKeywords`**: 特定のドメイン（おもちゃ、ベビー、家電など）を優先したい場合。キーワードは、そのノードの**全親階層**を対象にマッチングされます。

> [!IMPORTANT]
> **優先順位のポリシー (Architecture)**
> 現在の判定ロジックは以下の優先順位で最適なカテゴリを選択します：
> 1. **カテゴリ階層の深さ (Depth/nameCount)**: 最も具体的（深い）な末端カテゴリを最優先します。
> 2. **キーワードスコア (Score)**: 深さが同じ場合、`preferredKeywords` に一致するドメインを優先します。
> 3. **売上順位 (SalesRank)**: 深さもスコアも同じ場合、Amazonでの売上順位が高いものを優先します。
>
> 以前はスコアが深さより優先されていましたが、特定の詳細なカテゴリが一般的なカテゴリに負けてしまう問題を防ぐため、現在は**深さ優先**となっています。

> [!WARNING]
> **躓きポイント（よくある落とし穴）**
> 1. **広範なキーワードの除外**: 「Home」や「under」などを `invalidPatterns` に追加する場合、意図せず正常なカテゴリ（例：「Home & Kitchen」）まで除外してしまう可能性があります。追加するキーワードの影響範囲には注意し、必要に応じてテストを見直してください。
> 2. **テストケース名との意図しない一致**: `src/utils/CategoryNormalizer.test.ts` や `src/api/__tests__/CategoryParsing.test.ts` 内の正常・異常想定のダミー文字列（例：`category_with_underscore` や `sale`）が、新旧の除外ルールと意図せず一致してしまい、関係ないテストが失敗することがあります。除外ルールの更新後は既存テストのダミー文字列も確認し、必要なら抽象的な文字列（`test` や `dash`）などに修正してください。
> 3. **類似・動的なキャンペーン名の除外**: `hpcafc2409under2000` のように、年月や価格などの動的な値が名前に含まれているものや、今後類似パターンが増えそうなカテゴリについては、`blacklist`（完全一致）ではなく、`invalidPatterns`（正規表現：例 `/hpcafc\d*under/i`）へ追加してください。完全一致では次回の類似キャンペーンがすり抜けてしまいます。
> 4. **共通の接頭辞による一括除外**: 「HPCCreatorInfoHub」や「hpc recommendation widget」のように共通の接頭辞からなる不要カテゴリ群は、個別にブラックリストに追加するのではなく、`/^hpc/i` のように接頭辞ベースの正規表現で一括除外すると管理が容易になります。
> 5. **表記揺れや部分一致の除外**: 「>」と「＞」のような記号の全半角揺れや、「Amazon Global」（スペース有無）、「カテゴリ末尾がCat（`/l\d+.*cat$/i`）」といった柔軟な部分一致除外を行いたい場合は、`blacklist` ではなく `invalidPatterns` の正規表現を活用してください。特に「beauty」や「パントリー」のように、サービス名やプロモーション用キーワードがカテゴリ名に含まれる場合、`/beauty/i` や `/パントリー/i` のように広範に除外することで、未知のパターン（例：`PBBeauty9999` や `3P beauty`）も一括で防ぐことができます。
> 6. **テストケースの保守（重複回避）**: `src/utils/CategoryNormalizer.test.ts` にテストケースを追加する際、似たようなカテゴリ名を複数追加すると重複が生じやすくなります。テストコードの肥大化を防ぐため、追加前に既存の `invalidNames` リストを検索し、重複がないか確認してください。
> 7. **コードの健全性（不要なアサーション）**: ロジック修正時に `as string` や `as BrowseNode` などの型アサーションが不要になる場合があります。不要なアサーションは削除し、配列アクセス時には非空アサーション演算子 (`!`) を適切に用いることで、コードを簡潔にしつつ Lint 警告（`unnecessary type assertion`）を回避してください。

### 2.3 検証
ユニットテストを実行して、修正が正しいこと、および他のカテゴリに影響がないことを確認します。

```bash
pnpm test src/utils/CategoryNormalizer.test.ts
```

## 3. キャッシュのリセット (Cache Management)

ロジックを修正しただけでは、既存のキャッシュには古いカテゴリ名が残ったままになります。以下のスクリプトを使用して、該当する商品のタイムスタンプをリセットします。

### 3.1 カテゴリ名からのキーワード検索による一括リセット
指定したキーワード（大文字小文字を区別せず、部分一致）を含むカテゴリ名を持つすべての商品のキャッシュをリセットします。

```bash
npx ts-node scripts/reset-category-cache.ts "キーワード"
```

### 3.2 ASINによる個別リセット
特定のASINのキャッシュのみをリセットします。

```bash
npx ts-node scripts/reset-cache-timestamp.ts <ASIN>
```

## 4. 反映の確認 (Finalization)

記事を再生成して、最終的な出力（Markdownのフロントマター）を確認します。

```bash
pnpm run generate:articles
```

`content/articles/<ASIN>.md` を開き、`categories` や `subcategory` が意図通りになっているか確認してください。
