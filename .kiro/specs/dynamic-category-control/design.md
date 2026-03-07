# 動的カテゴリ制御機能 - 設計ドキュメント

## Overview

本設計は、Amazon商品調査システムにおけるカテゴリ管理の簡素化と動的表示制御を実現する。現在、親カテゴリの追加には `data/categorygroups.json` の編集に加えて `content/parent-category/{slug}.md` ファイルの手動作成が必要であり、運用負荷が高い。また、商品が存在しないカテゴリも表示されるため、ユーザー体験が低下している。

本機能は以下の主要な改善を提供する：

1. **親カテゴリの自動生成**: `categorygroups.json` の編集のみで親カテゴリページを自動生成
2. **動的表示制御**: 商品数に基づいてカテゴリの表示/非表示を自動制御
3. **拡張可能な設定**: 説明文、表示フラグ、優先度などのメタデータをサポート
4. **既存システムとの互換性**: 後方互換性を維持しながら段階的に機能を追加

## Architecture

### システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                    ビルドプロセス                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. prebuild:hugo (TypeScript)                               │
│     ┌──────────────────────────────────────┐                │
│     │ CategoryManager                       │                │
│     │  - categorygroups.json を読み込み     │                │
│     │  - 商品数をカウント (ProductCounter)  │                │
│     │  - 拡張データを生成                    │                │
│     │  - static/data/ に出力                │                │
│     │  - data/categories.yml に出力 (Hugo用)│                │
│     └──────────────────────────────────────┘                │
│                        ↓                                      │
│  2. Hugo Build                                               │
│     ┌──────────────────────────────────────┐                │
│     │ - data/categories.yml を読み込み      │                │
│     │ - 親カテゴリページを動的生成           │                │
│     │ - テンプレートで商品数をチェック       │                │
│     └──────────────────────────────────────┘                │
│                        ↓                                      │
│  3. 静的サイト生成                                            │
│     - public/ に出力                                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  クライアントサイド                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  category-dropdown.js                                        │
│  - static/data/categorygroups.json を読み込み                │
│  - 商品数が0のカテゴリを除外                                  │
│  - ドロップダウンを動的生成                                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```



### データフロー

1. **ビルド前処理** (`npm run prebuild:hugo`)
   - `CategoryManager` が `data/categorygroups.json` を読み込む
   - `ProductCounter` が `content/` 配下の商品ファイルをスキャンし、カテゴリ別の商品数を集計
   - 拡張カテゴリデータ（商品数、表示状態を含む）を生成
   - `static/data/categorygroups.json` に出力（クライアントサイド用）
   - `data/categories.yml` に出力（Hugo テンプレート用）

2. **Hugo ビルド**
   - `data/categories.yml` を読み込み
   - 親カテゴリごとにページを動的生成（`content/parent-category/{slug}.md` 不要）
   - テンプレート内で商品数をチェックし、0の場合は非表示

3. **クライアントサイド**
   - `category-dropdown.js` が `static/data/categorygroups.json` を読み込む
   - 商品数が0のカテゴリをドロップダウンから除外

## Components and Interfaces

### 1. CategoryManager (TypeScript)

カテゴリデータの読み込み、拡張、出力を担当する中核コンポーネント。

```typescript
interface CategoryGroup {
  name: string;
  slug: string;
  description?: string;
  visible?: boolean;
  priority?: number;
  children: string[];
}

interface EnhancedCategoryGroup extends CategoryGroup {
  productCount: number;
  childrenWithCounts: Array<{
    name: string;
    productCount: number;
  }>;
  isVisible: boolean;
}

class CategoryManager {
  private categoryGroups: CategoryGroup[];
  private productCounter: ProductCounter;

  constructor(categoryGroupsPath: string, contentPath: string);
  
  // カテゴリグループを読み込む
  loadCategoryGroups(): void;
  
  // 商品数を集計して拡張データを生成
  enhanceCategoryGroups(): EnhancedCategoryGroup[];
  
  // 拡張データをJSONとして出力（クライアントサイド用）
  exportToJSON(outputPath: string): void;
  
  // 拡張データをYAMLとして出力（Hugo用）
  exportToYAML(outputPath: string): void;
}
```



### 2. ProductCounter (TypeScript)

商品ファイルをスキャンしてカテゴリ別の商品数を集計する。

```typescript
interface ProductFrontMatter {
  categories: string[];
  [key: string]: unknown;
}

class ProductCounter {
  private contentPath: string;
  private categoryCountMap: Map<string, number>;

  constructor(contentPath: string);
  
  // 商品ファイルをスキャンしてカテゴリ別の商品数を集計
  countProductsByCategory(): Map<string, number>;
  
  // 特定のカテゴリの商品数を取得
  getProductCount(category: string): number;
  
  // Front Matterからカテゴリ情報を抽出
  private extractCategories(filePath: string): string[];
}
```

### 3. Hugo Layout Extensions

既存の `parent-category.html` を拡張し、動的カテゴリ生成に対応する。

```go
{{/* layouts/_default/parent-category.html */}}

{{/* data/categories.yml からカテゴリデータを読み込む */}}
{{ $parentCategory := .Params.parent_category }}
{{ $categoryData := index .Site.Data.categories.parents $parentCategory }}

{{/* 商品数が0の場合は404ページを表示 */}}
{{ if eq $categoryData.productCount 0 }}
  {{ partial "404.html" . }}
  {{ return }}
{{ end }}

{{/* 子カテゴリをフィルタリング（商品数が0のものを除外） */}}
{{ $visibleChildren := slice }}
{{ range $categoryData.childrenWithCounts }}
  {{ if gt .productCount 0 }}
    {{ $visibleChildren = $visibleChildren | append . }}
  {{ end }}
{{ end }}

{{/* 商品リストを表示 */}}
{{ range where .Site.RegularPages "Params.categories" "intersect" (slice $parentCategory) }}
  {{/* 商品カードを表示 */}}
{{ end }}
```



### 4. category-dropdown.js Extensions

既存のドロップダウンJavaScriptを拡張し、商品数ベースのフィルタリングを追加。

```javascript
// static/js/category-dropdown.js

async function loadCategoryGroups() {
  const response = await fetch('/amazon-product-article/data/categorygroups.json');
  const data = await response.json();
  return data;
}

function filterVisibleCategories(categoryGroups) {
  // 商品数が0の親カテゴリを除外
  return categoryGroups.filter(group => {
    // isVisible フラグが明示的に false の場合は除外
    if (group.isVisible === false) {
      return false;
    }
    // productCount が 0 の場合は除外
    if (group.productCount === 0) {
      return false;
    }
    return true;
  });
}

function buildDropdown(categoryGroups) {
  const visibleGroups = filterVisibleCategories(categoryGroups);
  
  visibleGroups.forEach(group => {
    // 親カテゴリを追加
    const parentOption = document.createElement('option');
    parentOption.value = group.slug;
    parentOption.textContent = `${group.name} (${group.productCount})`;
    
    // 子カテゴリを追加（商品数が0のものを除外）
    group.childrenWithCounts.forEach(child => {
      if (child.productCount > 0) {
        const childOption = document.createElement('option');
        childOption.value = child.name;
        childOption.textContent = `  ${child.name} (${child.productCount})`;
      }
    });
  });
}
```



## Data Models

### Enhanced Category Groups JSON

`data/categorygroups.json` の拡張版。後方互換性を維持しながら新フィールドを追加。

```json
{
  "categoryGroups": [
    {
      "name": "家電",
      "slug": "electronics",
      "description": "家電製品のカテゴリ",
      "visible": true,
      "priority": 1,
      "children": [
        "テレビ",
        "冷蔵庫",
        "洗濯機"
      ]
    }
  ]
}
```

**フィールド説明:**
- `name` (必須): カテゴリ名
- `slug` (必須): URL用のスラッグ
- `description` (オプション): カテゴリの説明文
- `visible` (オプション): 手動での表示/非表示制御（デフォルト: true）
- `priority` (オプション): 表示優先度（数値が小さいほど優先、デフォルト: 999）
- `children` (必須): 子カテゴリのリスト



### Enhanced Category Data (Build Output)

ビルド時に生成される拡張カテゴリデータ。商品数と表示状態を含む。

**static/data/categorygroups.json (クライアントサイド用):**

```json
{
  "categoryGroups": [
    {
      "name": "家電",
      "slug": "electronics",
      "description": "家電製品のカテゴリ",
      "visible": true,
      "priority": 1,
      "productCount": 15,
      "isVisible": true,
      "children": [
        "テレビ",
        "冷蔵庫",
        "洗濯機"
      ],
      "childrenWithCounts": [
        {
          "name": "テレビ",
          "productCount": 5
        },
        {
          "name": "冷蔵庫",
          "productCount": 7
        },
        {
          "name": "洗濯機",
          "productCount": 3
        }
      ]
    }
  ]
}
```

**追加フィールド:**
- `productCount`: 親カテゴリ全体の商品数
- `isVisible`: 最終的な表示状態（`visible` フラグと `productCount` を考慮）
- `childrenWithCounts`: 子カテゴリごとの商品数



### Hugo Data File Structure

Hugo テンプレートで使用するデータファイル構造。

```yaml
# data/categories.yml (Hugo用)
parents:
  家電:
    name: "家電"
    slug: "electronics"
    description: "家電製品のカテゴリ"
    productCount: 15
    isVisible: true
    childrenWithCounts:
      - name: "テレビ"
        productCount: 5
      - name: "冷蔵庫"
        productCount: 7
      - name: "洗濯機"
        productCount: 3
```

### Front Matter Structure (商品ファイル)

既存の商品ファイルのFront Matter構造（変更なし）。

```yaml
---
title: "商品名"
categories:
  - "家電"
  - "テレビ"
---
```



## Correctness Properties

*プロパティとは、システムのすべての有効な実行において真であるべき特性や動作のことです。本質的には、システムが何をすべきかについての形式的な記述です。プロパティは、人間が読める仕様と機械で検証可能な正確性の保証との橋渡しとなります。*

### Property 1: 親カテゴリページの自動生成

*任意の* 有効なカテゴリ名とslugを持つ親カテゴリに対して、`data/categorygroups.json` に追加してビルドを実行すると、`content/parent-category/{slug}.md` ファイルが存在しなくても、対応する親カテゴリページが生成され、404エラーなくアクセス可能である

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: 商品数ゼロのカテゴリの非表示

*任意の* カテゴリに対して、そのカテゴリに属する商品数が0の場合、そのカテゴリはナビゲーション、リスト、ドロップダウンのすべてから非表示になる

**Validates: Requirements 2.1, 2.2, 5.3**

### Property 3: 商品追加・削除による表示状態の更新

*任意の* カテゴリに対して、商品を追加または削除してビルドを実行すると、カテゴリの表示状態（表示/非表示）が商品数に基づいて自動的に更新される

**Validates: Requirements 2.3**

### Property 4: カテゴリ設定のラウンドトリップ

*任意の* カテゴリ設定（説明文、表示フラグ、優先度）に対して、`categorygroups.json` に設定を書き込み、`CategoryManager` で読み込むと、元の設定値と同じ値が出力データに含まれる

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 5: 後方互換性の維持

*任意の* 既存形式の `categorygroups.json` データ（新フィールドを含まない）に対して、新しい `CategoryManager` で読み込むと、エラーなく処理され、デフォルト値が適用される

**Validates: Requirements 4.1**

### Property 6: 既存機能との互換性

*任意の* 拡張カテゴリデータに対して、`category-dropdown.js` が読み込むと、ドロップダウンが正しく生成され、商品数が0のカテゴリが除外される

**Validates: Requirements 4.3**

### Property 7: 商品数カウントの正確性

*任意の* 商品ファイルセットに対して、`ProductCounter` がカテゴリ別の商品数を集計すると、各カテゴリの実際の商品数と一致する

**Validates: Requirements 5.1**

### Property 8: Front Matterからのカテゴリ抽出

*任意の* 商品ファイルのFront Matterに対して、`categories` フィールドが存在する場合、`ProductCounter` がそのフィールドを正しく抽出し、カテゴリリストとして認識する

**Validates: Requirements 5.2**



## Error Handling

### ビルド時エラー

1. **categorygroups.json の読み込みエラー**
   - ファイルが存在しない場合: エラーメッセージを表示してビルドを中断
   - JSON形式が不正な場合: 詳細なエラーメッセージ（行番号を含む）を表示してビルドを中断
   - 必須フィールド（name, slug, children）が欠けている場合: 該当カテゴリを特定してエラーを表示

2. **商品ファイルの読み込みエラー**
   - Front Matterのパースエラー: 該当ファイルをスキップし、警告を表示（ビルドは継続）
   - categories フィールドが配列でない場合: 該当ファイルをスキップし、警告を表示

3. **出力ファイルの書き込みエラー**
   - ディレクトリが存在しない場合: 自動的にディレクトリを作成
   - 書き込み権限がない場合: エラーメッセージを表示してビルドを中断

### 実行時エラー（クライアントサイド）

1. **categorygroups.json の読み込みエラー**
   - ネットワークエラー: リトライ（最大3回）後、フォールバック表示
   - JSONパースエラー: コンソールにエラーを記録し、空のドロップダウンを表示

2. **データ不整合**
   - productCount が未定義の場合: 0として扱う
   - childrenWithCounts が未定義の場合: 空配列として扱う

### バリデーション

1. **カテゴリ名の重複チェック**
   - 同じ名前の親カテゴリが複数存在する場合: エラーを表示してビルドを中断
   - 同じslugが複数存在する場合: エラーを表示してビルドを中断

2. **子カテゴリの存在チェック**
   - 子カテゴリに商品が存在するが、親カテゴリに定義されていない場合: 警告を表示（ビルドは継続）



## Testing Strategy

### デュアルテストアプローチ

本機能のテストは、ユニットテストとプロパティベーステストの両方を使用する包括的なアプローチを採用します。

- **ユニットテスト**: 特定の例、エッジケース、エラー条件を検証
- **プロパティテスト**: すべての入力にわたる普遍的なプロパティを検証
- 両者は補完的であり、包括的なカバレッジに必要です

### ユニットテストのバランス

ユニットテストは特定の例とエッジケースに焦点を当てます。プロパティベーステストが多数の入力をカバーするため、ユニットテストは以下に集中します：

- **特定の例**: 正しい動作を示す具体的なケース
- **統合ポイント**: コンポーネント間の連携
- **エッジケースとエラー条件**: 境界値や異常系

### プロパティベーステスト設定

- **テストライブラリ**: `fast-check` を使用（TypeScript用）
- **イテレーション数**: 各プロパティテストは最小100回実行（ランダム化のため）
- **タグ形式**: 各テストには設計ドキュメントのプロパティを参照するコメントを付与
  - 形式: `// Feature: dynamic-category-control, Property {number}: {property_text}`

### テストケース

#### 1. CategoryManager のテスト

**ユニットテスト** (`src/category/__tests__/CategoryManager.test.ts`):
```typescript
describe('CategoryManager', () => {
  test('空のカテゴリグループを読み込む', () => {
    // 空のJSONファイルを読み込んでエラーにならないことを確認
  });

  test('必須フィールドが欠けている場合にエラーを投げる', () => {
    // name, slug, children のいずれかが欠けている場合
  });

  test('YAMLとJSONの両方に正しく出力する', () => {
    // 同じデータが両形式で出力されることを確認
  });
});
```

**プロパティテスト** (`src/category/__tests__/CategoryManager.property.test.ts`):
```typescript
import * as fc from 'fast-check';

describe('CategoryManager Properties', () => {
  // Feature: dynamic-category-control, Property 4: カテゴリ設定のラウンドトリップ
  test('カテゴリ設定のラウンドトリップ', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }),
          slug: fc.string({ minLength: 1 }),
          description: fc.option(fc.string()),
          visible: fc.option(fc.boolean()),
          priority: fc.option(fc.integer({ min: 0, max: 999 })),
          children: fc.array(fc.string({ minLength: 1 }))
        }),
        (categoryGroup) => {
          const manager = new CategoryManager();
          manager.addCategoryGroup(categoryGroup);
          const output = manager.enhanceCategoryGroups();
          
          // 元の設定値が保持されていることを確認
          expect(output[0].name).toBe(categoryGroup.name);
          expect(output[0].slug).toBe(categoryGroup.slug);
          expect(output[0].description).toBe(categoryGroup.description);
          expect(output[0].visible).toBe(categoryGroup.visible ?? true);
          expect(output[0].priority).toBe(categoryGroup.priority ?? 999);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: dynamic-category-control, Property 5: 後方互換性の維持
  test('後方互換性の維持', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }),
          slug: fc.string({ minLength: 1 }),
          children: fc.array(fc.string({ minLength: 1 }))
        }),
        (legacyCategoryGroup) => {
          const manager = new CategoryManager();
          manager.addCategoryGroup(legacyCategoryGroup);
          const output = manager.enhanceCategoryGroups();
          
          // デフォルト値が適用されることを確認
          expect(output[0].visible).toBe(true);
          expect(output[0].priority).toBe(999);
          expect(output[0].description).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
```



#### 2. ProductCounter のテスト

**ユニットテスト** (`src/category/__tests__/ProductCounter.test.ts`):
```typescript
describe('ProductCounter', () => {
  test('商品が存在しないカテゴリは0を返す', () => {
    // 存在しないカテゴリ名で商品数を取得
  });

  test('Front Matterが不正な商品ファイルをスキップする', () => {
    // パースエラーが発生するファイルを含むディレクトリをスキャン
  });

  test('categories フィールドが配列でない場合をスキップする', () => {
    // categories が文字列や数値の場合
  });
});
```

**プロパティテスト** (`src/category/__tests__/ProductCounter.property.test.ts`):
```typescript
describe('ProductCounter Properties', () => {
  // Feature: dynamic-category-control, Property 7: 商品数カウントの正確性
  test('商品数カウントの正確性', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            categories: fc.array(fc.string({ minLength: 1 }), { minLength: 1 })
          })
        ),
        (products) => {
          // テスト用の商品ファイルを作成
          const tempDir = createTempProductFiles(products);
          const counter = new ProductCounter(tempDir);
          const counts = counter.countProductsByCategory();
          
          // 手動でカウントした結果と一致することを確認
          const expectedCounts = new Map<string, number>();
          products.forEach(product => {
            product.categories.forEach(category => {
              expectedCounts.set(
                category,
                (expectedCounts.get(category) || 0) + 1
              );
            });
          });
          
          expectedCounts.forEach((count, category) => {
            expect(counts.get(category)).toBe(count);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: dynamic-category-control, Property 8: Front Matterからのカテゴリ抽出
  test('Front Matterからのカテゴリ抽出', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        (categories) => {
          const frontMatter = `---\ncategories:\n${categories.map(c => `  - "${c}"`).join('\n')}\n---`;
          const extracted = extractCategoriesFromFrontMatter(frontMatter);
          
          expect(extracted).toEqual(categories);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```



#### 3. 統合テスト

**ユニットテスト** (`src/category/__tests__/integration.test.ts`):
```typescript
describe('Integration Tests', () => {
  test('prebuild:hugo スクリプトが正常に完了する', () => {
    // 実際のビルドスクリプトを実行してエラーがないことを確認
  });

  test('生成されたJSONとYAMLが整合性を持つ', () => {
    // 同じ入力から生成されたJSONとYAMLを比較
  });

  test('Hugo テンプレートが生成されたデータを読み込める', () => {
    // data/categories.yml を Hugo が正しく読み込めることを確認
  });
});
```

**プロパティテスト** (`src/category/__tests__/integration.property.test.ts`):
```typescript
describe('Integration Properties', () => {
  // Feature: dynamic-category-control, Property 2: 商品数ゼロのカテゴリの非表示
  test('商品数ゼロのカテゴリの非表示', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1 }),
            slug: fc.string({ minLength: 1 }),
            children: fc.array(fc.string({ minLength: 1 }))
          })
        ),
        (categoryGroups) => {
          // 商品が存在しないカテゴリグループを作成
          const manager = new CategoryManager();
          categoryGroups.forEach(group => manager.addCategoryGroup(group));
          
          const counter = new ProductCounter(emptyContentDir);
          const enhanced = manager.enhanceCategoryGroups(counter);
          
          // すべてのカテゴリが非表示になることを確認
          enhanced.forEach(group => {
            expect(group.isVisible).toBe(false);
            expect(group.productCount).toBe(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: dynamic-category-control, Property 3: 商品追加・削除による表示状態の更新
  test('商品追加・削除による表示状態の更新', () => {
    fc.assert(
      fc.property(
        fc.record({
          categoryName: fc.string({ minLength: 1 }),
          initialProductCount: fc.integer({ min: 0, max: 10 }),
          finalProductCount: fc.integer({ min: 0, max: 10 })
        }),
        ({ categoryName, initialProductCount, finalProductCount }) => {
          // 初期状態でビルド
          const initialProducts = createProducts(categoryName, initialProductCount);
          const initialEnhanced = buildAndGetEnhanced(initialProducts);
          const initialVisible = initialEnhanced.find(g => g.name === categoryName)?.isVisible;
          
          // 商品を追加・削除してビルド
          const finalProducts = createProducts(categoryName, finalProductCount);
          const finalEnhanced = buildAndGetEnhanced(finalProducts);
          const finalVisible = finalEnhanced.find(g => g.name === categoryName)?.isVisible;
          
          // 表示状態が商品数に基づいて更新されることを確認
          expect(initialVisible).toBe(initialProductCount > 0);
          expect(finalVisible).toBe(finalProductCount > 0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### テスト実行

すべてのテストは以下のコマンドで実行されます：

```bash
# すべてのテストを実行
npm test

# 特定のテストファイルを実行
npm test src/category/__tests__/CategoryManager.property.test.ts

# カバレッジレポートを生成
npm test -- --coverage
```

### 継続的インテグレーション

GitHub Actions で以下のチェックを実行：

1. `npm run lint` - ESLintエラーが0件であることを確認
2. `npm run build` - TypeScriptのコンパイルエラーがないことを確認
3. `npm test` - すべてのテストがパスすることを確認



## Implementation Details

### ビルドプロセスの統合

`package.json` の `prebuild:hugo` スクリプトを拡張：

```json
{
  "scripts": {
    "prebuild:hugo": "ts-node src/scripts/enhance-categories.ts && mkdir -p static/data && cp data/categorygroups.json static/data/",
    "build:hugo": "npm run prebuild:hugo && hugo",
    "build": "tsc"
  }
}
```

### ディレクトリ構造

```
src/
  category/
    CategoryManager.ts          # カテゴリ管理の中核クラス
    ProductCounter.ts           # 商品数カウントクラス
    types.ts                    # 型定義
    __tests__/
      CategoryManager.test.ts
      CategoryManager.property.test.ts
      ProductCounter.test.ts
      ProductCounter.property.test.ts
      integration.test.ts
      integration.property.test.ts
  scripts/
    enhance-categories.ts       # ビルド前処理スクリプト

data/
  categorygroups.json           # カテゴリ定義（手動編集）
  categories.yml                # 拡張カテゴリデータ（自動生成、Hugo用）

static/
  data/
    categorygroups.json         # 拡張カテゴリデータ（自動生成、クライアント用）
  js/
    category-dropdown.js        # カテゴリドロップダウン（拡張）

layouts/
  _default/
    parent-category.html        # 親カテゴリページテンプレート（拡張）

content/
  parent-category/              # 親カテゴリページ（自動生成により不要）
```



### CategoryManager 実装の詳細

```typescript
// src/category/types.ts
export interface CategoryGroup {
  name: string;
  slug: string;
  description?: string;
  visible?: boolean;
  priority?: number;
  children: string[];
}

export interface EnhancedCategoryGroup extends CategoryGroup {
  productCount: number;
  childrenWithCounts: Array<{
    name: string;
    productCount: number;
  }>;
  isVisible: boolean;
}

// src/category/CategoryManager.ts
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { CategoryGroup, EnhancedCategoryGroup } from './types';
import { ProductCounter } from './ProductCounter';

export class CategoryManager {
  private categoryGroups: CategoryGroup[] = [];

  constructor(private categoryGroupsPath: string) {}

  loadCategoryGroups(): void {
    const content = fs.readFileSync(this.categoryGroupsPath, 'utf-8');
    const data = JSON.parse(content);
    
    // バリデーション
    if (!data.categoryGroups || !Array.isArray(data.categoryGroups)) {
      throw new Error('Invalid categorygroups.json: categoryGroups must be an array');
    }

    data.categoryGroups.forEach((group: CategoryGroup, index: number) => {
      if (!group.name || !group.slug || !group.children) {
        throw new Error(
          `Invalid category group at index ${index}: name, slug, and children are required`
        );
      }
    });

    this.categoryGroups = data.categoryGroups;
  }

  enhanceCategoryGroups(productCounter: ProductCounter): EnhancedCategoryGroup[] {
    return this.categoryGroups.map(group => {
      // 子カテゴリごとの商品数を集計
      const childrenWithCounts = group.children.map(child => ({
        name: child,
        productCount: productCounter.getProductCount(child)
      }));

      // 親カテゴリ全体の商品数を計算
      const productCount = productCounter.getProductCount(group.name);

      // 表示状態を決定
      const isVisible = (group.visible ?? true) && productCount > 0;

      return {
        ...group,
        visible: group.visible ?? true,
        priority: group.priority ?? 999,
        productCount,
        childrenWithCounts,
        isVisible
      };
    });
  }

  exportToJSON(enhanced: EnhancedCategoryGroup[], outputPath: string): void {
    const output = {
      categoryGroups: enhanced
    };
    
    const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  }

  exportToYAML(enhanced: EnhancedCategoryGroup[], outputPath: string): void {
    // Hugo用のデータ構造に変換
    const hugoData: Record<string, unknown> = {
      parents: {}
    };

    enhanced.forEach(group => {
      hugoData.parents[group.name] = {
        name: group.name,
        slug: group.slug,
        description: group.description,
        productCount: group.productCount,
        isVisible: group.isVisible,
        childrenWithCounts: group.childrenWithCounts
      };
    });

    const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, yaml.dump(hugoData), 'utf-8');
  }
}
```



### ProductCounter 実装の詳細

```typescript
// src/category/ProductCounter.ts
import * as fs from 'fs';
import * as path from 'path';
import * as matter from 'gray-matter';

export class ProductCounter {
  private categoryCountMap: Map<string, number> = new Map();

  constructor(private contentPath: string) {
    this.countProductsByCategory();
  }

  private countProductsByCategory(): void {
    this.scanDirectory(this.contentPath);
  }

  private scanDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      console.warn(`Content directory not found: ${dirPath}`);
      return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    entries.forEach(entry => {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        this.scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const categories = this.extractCategories(fullPath);
          categories.forEach(category => {
            this.categoryCountMap.set(
              category,
              (this.categoryCountMap.get(category) || 0) + 1
            );
          });
        } catch (error) {
          console.warn(`Failed to parse ${fullPath}:`, error);
        }
      }
    });
  }

  private extractCategories(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(content);

    if (!parsed.data.categories) {
      return [];
    }

    if (!Array.isArray(parsed.data.categories)) {
      console.warn(`Invalid categories field in ${filePath}: expected array`);
      return [];
    }

    return parsed.data.categories.filter(
      (cat): cat is string => typeof cat === 'string'
    );
  }

  getProductCount(category: string): number {
    return this.categoryCountMap.get(category) || 0;
  }

  getAllCounts(): Map<string, number> {
    return new Map(this.categoryCountMap);
  }
}
```



### ビルドスクリプト実装

```typescript
// src/scripts/enhance-categories.ts
import * as path from 'path';
import { CategoryManager } from '../category/CategoryManager';
import { ProductCounter } from '../category/ProductCounter';

async function main(): Promise<void> {
  try {
    console.log('Enhancing category data...');

    // パスの設定
    const rootDir = path.resolve(__dirname, '../..');
    const categoryGroupsPath = path.join(rootDir, 'data/categorygroups.json');
    const contentPath = path.join(rootDir, 'content');
    const jsonOutputPath = path.join(rootDir, 'static/data/categorygroups.json');
    const yamlOutputPath = path.join(rootDir, 'data/categories.yml');

    // カテゴリマネージャーの初期化
    const manager = new CategoryManager(categoryGroupsPath);
    manager.loadCategoryGroups();

    // 商品数のカウント
    const counter = new ProductCounter(contentPath);

    // 拡張データの生成
    const enhanced = manager.enhanceCategoryGroups(counter);

    // 出力
    manager.exportToJSON(enhanced, jsonOutputPath);
    manager.exportToYAML(enhanced, yamlOutputPath);

    console.log(`✓ Enhanced category data written to:`);
    console.log(`  - ${jsonOutputPath}`);
    console.log(`  - ${yamlOutputPath}`);

    // 統計情報の表示
    const visibleCount = enhanced.filter(g => g.isVisible).length;
    const totalCount = enhanced.length;
    console.log(`✓ ${visibleCount}/${totalCount} categories are visible`);

  } catch (error) {
    console.error('Error enhancing categories:', error);
    process.exit(1);
  }
}

main();
```



### Hugo テンプレートの実装

```go
{{/* layouts/_default/parent-category.html */}}

{{ define "main" }}
  {{ $parentCategory := .Params.parent_category }}
  {{ $categoryData := index .Site.Data.categories.parents $parentCategory }}

  {{/* 商品数が0の場合は404ページを表示 */}}
  {{ if or (not $categoryData) (eq $categoryData.productCount 0) }}
    <div class="container mx-auto px-4 py-8">
      <h1 class="text-2xl font-bold mb-4">カテゴリが見つかりません</h1>
      <p>このカテゴリには現在商品が登録されていません。</p>
      <a href="/" class="text-blue-600 hover:underline">トップページに戻る</a>
    </div>
    {{ return }}
  {{ end }}

  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-2">{{ $categoryData.name }}</h1>
    
    {{ if $categoryData.description }}
      <p class="text-gray-600 mb-6">{{ $categoryData.description }}</p>
    {{ end }}

    <p class="text-sm text-gray-500 mb-8">
      {{ $categoryData.productCount }}件の商品
    </p>

    {{/* 子カテゴリのフィルタリング（商品数が0のものを除外） */}}
    {{ if $categoryData.childrenWithCounts }}
      <div class="mb-8">
        <h2 class="text-xl font-semibold mb-4">サブカテゴリ</h2>
        <div class="flex flex-wrap gap-2">
          {{ range $categoryData.childrenWithCounts }}
            {{ if gt .productCount 0 }}
              <a href="/categories/{{ .name | urlize }}" 
                 class="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200">
                {{ .name }} ({{ .productCount }})
              </a>
            {{ end }}
          {{ end }}
        </div>
      </div>
    {{ end }}

    {{/* 商品リストを表示 */}}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {{ range where .Site.RegularPages "Params.categories" "intersect" (slice $parentCategory) }}
        <article class="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition">
          {{ if .Params.image }}
            <img src="{{ .Params.image }}" alt="{{ .Title }}" class="w-full h-48 object-cover">
          {{ end }}
          <div class="p-4">
            <h3 class="text-lg font-semibold mb-2">
              <a href="{{ .Permalink }}" class="hover:text-blue-600">{{ .Title }}</a>
            </h3>
            {{ if .Params.price }}
              <p class="text-xl font-bold text-green-600 mb-2">¥{{ .Params.price }}</p>
            {{ end }}
            <p class="text-gray-600 text-sm">{{ .Summary }}</p>
          </div>
        </article>
      {{ end }}
    </div>
  </div>
{{ end }}
```



### category-dropdown.js の拡張実装

```javascript
// static/js/category-dropdown.js

(function() {
  'use strict';

  let categoryData = null;

  async function loadCategoryGroups() {
    try {
      const response = await fetch('/amazon-product-article/data/categorygroups.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.categoryGroups || [];
    } catch (error) {
      console.error('Failed to load category groups:', error);
      return [];
    }
  }

  function filterVisibleCategories(categoryGroups) {
    return categoryGroups.filter(group => {
      // isVisible フラグが明示的に false の場合は除外
      if (group.isVisible === false) {
        return false;
      }
      // productCount が 0 の場合は除外
      if (group.productCount === 0) {
        return false;
      }
      return true;
    });
  }

  function sortCategoriesByPriority(categoryGroups) {
    return [...categoryGroups].sort((a, b) => {
      const priorityA = a.priority ?? 999;
      const priorityB = b.priority ?? 999;
      return priorityA - priorityB;
    });
  }

  function buildDropdown(categoryGroups) {
    const dropdown = document.getElementById('category-dropdown');
    if (!dropdown) {
      console.warn('Category dropdown element not found');
      return;
    }

    // 既存のオプションをクリア
    dropdown.innerHTML = '<option value="">すべてのカテゴリ</option>';

    const visibleGroups = filterVisibleCategories(categoryGroups);
    const sortedGroups = sortCategoriesByPriority(visibleGroups);

    sortedGroups.forEach(group => {
      // 親カテゴリを追加
      const parentOption = document.createElement('option');
      parentOption.value = group.slug;
      parentOption.textContent = `${group.name} (${group.productCount})`;
      dropdown.appendChild(parentOption);

      // 子カテゴリを追加（商品数が0のものを除外）
      if (group.childrenWithCounts) {
        group.childrenWithCounts.forEach(child => {
          if (child.productCount > 0) {
            const childOption = document.createElement('option');
            childOption.value = child.name;
            childOption.textContent = `  └ ${child.name} (${child.productCount})`;
            dropdown.appendChild(childOption);
          }
        });
      }
    });
  }

  function handleDropdownChange(event) {
    const selectedValue = event.target.value;
    if (selectedValue) {
      window.location.href = `/amazon-product-article/categories/${selectedValue}`;
    }
  }

  async function init() {
    categoryData = await loadCategoryGroups();
    buildDropdown(categoryData);

    const dropdown = document.getElementById('category-dropdown');
    if (dropdown) {
      dropdown.addEventListener('change', handleDropdownChange);
    }
  }

  // DOMContentLoaded イベントで初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```



## Migration Strategy

### 段階的な移行アプローチ

既存システムへの影響を最小限に抑えるため、以下の段階的な移行を推奨します。

#### Phase 1: 基盤の構築（破壊的変更なし）

1. `CategoryManager` と `ProductCounter` クラスを実装
2. `enhance-categories.ts` スクリプトを作成
3. ユニットテストとプロパティテストを追加
4. `prebuild:hugo` スクリプトに統合（既存の処理は維持）

**検証ポイント:**
- 既存のビルドプロセスが正常に動作すること
- 生成されたJSONとYAMLが正しい形式であること
- すべてのテストがパスすること

#### Phase 2: Hugo テンプレートの拡張

1. `layouts/_default/parent-category.html` を拡張
2. `data/categories.yml` からデータを読み込むように変更
3. 商品数が0のカテゴリを非表示にするロジックを追加

**検証ポイント:**
- 既存の親カテゴリページが正常に表示されること
- 商品数が0のカテゴリが非表示になること
- レイアウトが崩れていないこと

#### Phase 3: クライアントサイドの拡張

1. `static/js/category-dropdown.js` を拡張
2. 商品数ベースのフィルタリングを追加
3. 優先度ベースのソートを追加

**検証ポイント:**
- ドロップダウンが正常に動作すること
- 商品数が0のカテゴリが除外されること
- ソート順が正しいこと

#### Phase 4: 手動作成ファイルの削除（オプション）

1. `content/parent-category/*.md` ファイルを削除
2. Hugo の動的ページ生成に完全移行

**検証ポイント:**
- すべての親カテゴリページがアクセス可能であること
- 404エラーが発生しないこと

### ロールバック計画

各フェーズで問題が発生した場合のロールバック手順：

1. **Phase 1**: `prebuild:hugo` スクリプトから新しい処理を削除
2. **Phase 2**: Hugo テンプレートを元に戻す
3. **Phase 3**: JavaScript ファイルを元に戻す
4. **Phase 4**: 削除したMarkdownファイルを復元



## Performance Considerations

### ビルド時のパフォーマンス

1. **商品ファイルのスキャン**
   - 大量の商品ファイルが存在する場合、スキャンに時間がかかる可能性がある
   - 対策: ファイルシステムのキャッシュを活用し、変更されたファイルのみを再スキャン

2. **カテゴリデータの生成**
   - カテゴリ数が多い場合、データ生成に時間がかかる可能性がある
   - 対策: 並列処理を検討（現時点では不要と判断）

3. **ファイル出力**
   - JSONとYAMLの両方を出力するため、I/Oコストが発生
   - 対策: 非同期I/Oを使用（現時点では同期I/Oで十分）

**目標**: 既存ビルド時間の+10%以内

### 実行時のパフォーマンス

1. **JSONの読み込み**
   - クライアントサイドでJSONを読み込むため、ネットワークコストが発生
   - 対策: ブラウザキャッシュを活用（Cache-Control ヘッダーの設定）

2. **ドロップダウンの生成**
   - カテゴリ数が多い場合、DOM操作に時間がかかる可能性がある
   - 対策: DocumentFragmentを使用してバッチ処理

3. **フィルタリングとソート**
   - カテゴリ数が多い場合、処理に時間がかかる可能性がある
   - 対策: 現時点では不要（カテゴリ数は数十程度と想定）

## Security Considerations

### ビルド時のセキュリティ

1. **ファイルパスの検証**
   - ディレクトリトラバーサル攻撃を防ぐため、パスを正規化
   - `path.resolve()` と `path.join()` を使用

2. **JSONパースのエラーハンドリング**
   - 不正なJSONファイルによるクラッシュを防ぐ
   - try-catch でエラーをキャッチし、適切なエラーメッセージを表示

3. **ファイル書き込みの権限チェック**
   - 書き込み権限がない場合のエラーハンドリング
   - ディレクトリが存在しない場合は自動作成

### 実行時のセキュリティ

1. **XSS対策**
   - カテゴリ名やslugをDOMに挿入する際、適切にエスケープ
   - `textContent` を使用（`innerHTML` は使用しない）

2. **CSRF対策**
   - 読み取り専用の操作のみのため、特別な対策は不要

3. **データの整合性**
   - JSONデータの改ざんを検出するため、ビルド時にハッシュを生成（将来的な拡張）

## Backward Compatibility

### 既存データとの互換性

1. **categorygroups.json の構造**
   - 既存のフィールド（name, slug, children）は変更なし
   - 新しいフィールド（description, visible, priority）はオプション
   - デフォルト値を適用することで後方互換性を維持

2. **Hugo テンプレート**
   - 既存のテンプレート変数は維持
   - 新しいデータ構造（data/categories.yml）を追加
   - 既存の `content/parent-category/*.md` ファイルも引き続き使用可能

3. **JavaScript**
   - 既存のドロップダウン機能は維持
   - 新しいフィールドが存在しない場合はデフォルト値を使用

### 移行期間中の互換性

- Phase 1-3 の間、既存の手動作成ファイルと新しい動的生成が共存可能
- 段階的に移行することで、リスクを最小化



## Future Enhancements

### 短期的な拡張（次のイテレーション）

1. **カテゴリの自動マージ**
   - 商品数が少ないカテゴリを自動的に統合
   - 設定可能な閾値（例: 商品数が5未満のカテゴリを統合）

2. **カテゴリの推奨機能**
   - 商品のタイトルや説明から自動的にカテゴリを推奨
   - 機械学習モデルの活用

3. **カテゴリのアイコン**
   - 各カテゴリにアイコンを設定可能に
   - ビジュアル的な識別性の向上

### 中期的な拡張

1. **動的なカテゴリ階層**
   - 3階層以上のカテゴリ構造をサポート
   - 親-子-孫の関係を動的に管理

2. **カテゴリのA/Bテスト**
   - カテゴリ名や説明文の効果を測定
   - コンバージョン率の最適化

3. **カテゴリの多言語対応**
   - 日本語以外の言語でのカテゴリ名をサポート
   - i18n対応

### 長期的な拡張

1. **管理UIの構築**
   - カテゴリの追加・編集・削除をGUIで実行
   - JSONファイルの手動編集を不要に

2. **リアルタイム更新**
   - 商品の追加・削除時にカテゴリ表示を即座に更新
   - WebSocketやServer-Sent Eventsの活用

3. **カテゴリの分析ダッシュボード**
   - カテゴリごとのアクセス数、コンバージョン率を可視化
   - データドリブンなカテゴリ最適化

## Conclusion

本設計は、Amazon商品調査システムにおけるカテゴリ管理の簡素化と動的表示制御を実現します。

**主要な利点:**
- 開発者の運用負荷を削減（手動ファイル作成が不要）
- ユーザー体験の向上（商品が存在するカテゴリのみを表示）
- 拡張性の確保（新しいメタデータを簡単に追加可能）
- 後方互換性の維持（既存システムを壊さない）

**次のステップ:**
1. 本設計ドキュメントのレビューと承認
2. タスクリストの作成
3. Phase 1の実装開始（基盤の構築）
