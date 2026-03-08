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
python scripts/debug_dump.py <ASIN>
```
実行すると `tmp/debug_output.json` に生成されます。

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

- **`blacklist`**: 完全一致で除外する場合。
- **`invalidPatterns`**: 正規表現で除外する場合（表記揺れや部分一致に対応できるため、こちらが推奨されます）。

> [!WARNING]
> **躓きポイント（よくある落とし穴）**
> 1. **広範なキーワードの除外**: 「Home」や「under」などを `invalidPatterns` に追加する場合、意図せず正常なカテゴリ（例：「Home & Kitchen」）まで除外してしまう可能性があります。追加するキーワードの影響範囲には注意し、必要に応じてテストを見直してください。
> 2. **テストケース名との意図しない一致**: `src/utils/CategoryNormalizer.test.ts` や `src/api/__tests__/CategoryParsing.test.ts` 内の正常・異常想定のダミー文字列（例：`category_with_underscore` や `sale`）が、新旧の除外ルールと意図せず一致してしまい、関係ないテストが失敗することがあります。除外ルールの更新後は既存テストのダミー文字列も確認し、必要なら抽象的な文字列（`test` や `dash`）などに修正してください。

### 2.3 検証
ユニットテストを実行して、修正が正しいこと、および他のカテゴリに影響がないことを確認します。

```bash
npm test src/utils/CategoryNormalizer.test.ts
```

## 3. キャッシュのリセット (Cache Management)

ロジックを修正しただけでは、既存のキャッシュには古いカテゴリ名が残ったままになります。以下のスクリプトを使用して、該当する商品のタイムスタンプをリセットします。

### 3.1 カテゴリ名による一括リセット
特定のカテゴリ名を持つすべての商品のキャッシュをリセットします。

```bash
npx ts-node scripts/reset-category-cache.ts "カテゴリ名"
```

### 3.2 ASINによる個別リセット
特定のASINのキャッシュのみをリセットします。

```bash
npx ts-node scripts/reset-cache-timestamp.ts <ASIN>
```

## 4. 反映の確認 (Finalization)

記事を再生成して、最終的な出力（Markdownのフロントマター）を確認します。

```bash
npm run generate:articles
```

`content/articles/<ASIN>.md` を開き、`categories` や `subcategory` が意図通りになっているか確認してください。
