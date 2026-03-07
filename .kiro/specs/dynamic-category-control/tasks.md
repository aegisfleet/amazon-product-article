# Implementation Plan: 動的カテゴリ制御機能

## Overview

本実装計画は、Amazon商品調査システムにおけるカテゴリ管理の簡素化と動的表示制御を実現します。TDD（テスト駆動開発）アプローチを採用し、各実装タスクの前にテストを作成します。プロパティベーステスト（fast-check）とユニットテストの両方を含み、既存システムとの後方互換性を維持しながら段階的に機能を追加します。

## Tasks

- [ ] 1. プロジェクト構造とコア型定義のセットアップ
  - `src/category/` ディレクトリを作成
  - `src/category/types.ts` に型定義を作成（CategoryGroup, EnhancedCategoryGroup）
  - `src/category/__tests__/` ディレクトリを作成
  - 必要な依存パッケージを確認（gray-matter, js-yaml, fast-check）
  - _Requirements: 4.1, 4.2_

- [ ] 2. ProductCounter クラスの実装
  - [ ] 2.1 ProductCounter のユニットテストを作成
    - 商品が存在しないカテゴリは0を返すテスト
    - Front Matterが不正な商品ファイルをスキップするテスト
    - categories フィールドが配列でない場合をスキップするテスト
    - _Requirements: 5.1, 5.2_

  - [ ]* 2.2 ProductCounter のプロパティテストを作成
    - **Property 7: 商品数カウントの正確性**
    - **Validates: Requirements 5.1**
    - **Property 8: Front Matterからのカテゴリ抽出**
    - **Validates: Requirements 5.2**

  - [ ] 2.3 ProductCounter クラスを実装
    - `src/category/ProductCounter.ts` を作成
    - コンストラクタで contentPath を受け取る
    - countProductsByCategory メソッドを実装（再帰的にディレクトリをスキャン）
    - extractCategories メソッドを実装（gray-matter を使用）
    - getProductCount メソッドを実装
    - エラーハンドリング（不正なFront Matter、存在しないディレクトリ）
    - _Requirements: 5.1, 5.2_

- [ ] 3. Checkpoint - ProductCounter のテストを実行
  - `npm test src/category/__tests__/ProductCounter` を実行してすべてのテストがパスすることを確認
  - 問題があれば修正し、ユーザーに質問する

- [ ] 4. CategoryManager クラスの実装
  - [ ] 4.1 CategoryManager のユニットテストを作成
    - 空のカテゴリグループを読み込むテスト
    - 必須フィールドが欠けている場合にエラーを投げるテスト
    - YAMLとJSONの両方に正しく出力するテスト
    - カテゴリ名の重複チェックテスト
    - _Requirements: 3.1, 3.2, 3.3, 4.1_

  - [ ]* 4.2 CategoryManager のプロパティテストを作成
    - **Property 4: カテゴリ設定のラウンドトリップ**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - **Property 5: 後方互換性の維持**
    - **Validates: Requirements 4.1**

  - [ ] 4.3 CategoryManager クラスを実装
    - `src/category/CategoryManager.ts` を作成
    - loadCategoryGroups メソッドを実装（JSON読み込み、バリデーション）
    - enhanceCategoryGroups メソッドを実装（ProductCounter と連携）
    - exportToJSON メソッドを実装（static/data/ に出力）
    - exportToYAML メソッドを実装（data/ に出力、js-yaml を使用）
    - エラーハンドリング（不正なJSON、書き込み権限エラー）
    - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 4.1_

- [ ] 5. Checkpoint - CategoryManager のテストを実行
  - `npm test src/category/__tests__/CategoryManager` を実行してすべてのテストがパスすることを確認
  - 問題があれば修正し、ユーザーに質問する

- [ ] 6. ビルドスクリプトの実装
  - [ ] 6.1 enhance-categories.ts スクリプトを作成
    - `src/scripts/enhance-categories.ts` を作成
    - CategoryManager と ProductCounter を統合
    - パス設定（data/categorygroups.json, content/, static/data/, data/）
    - エラーハンドリングと統計情報の表示
    - _Requirements: 4.2, 5.1_

  - [ ] 6.2 package.json のスクリプトを更新
    - `prebuild:hugo` スクリプトに `ts-node src/scripts/enhance-categories.ts` を追加
    - 既存の処理（static/data/ へのコピー）を維持
    - _Requirements: 4.2_

  - [ ]* 6.3 ビルドスクリプトの統合テストを作成
    - prebuild:hugo スクリプトが正常に完了するテスト
    - 生成されたJSONとYAMLが整合性を持つテスト

- [ ] 7. Checkpoint - ビルドプロセスの検証
  - `npm run prebuild:hugo` を実行して正常に完了することを確認
  - `static/data/categorygroups.json` と `data/categories.yml` が生成されることを確認
  - `npm run lint` を実行してエラーが0件であることを確認
  - `npm run build` を実行してコンパイルエラーがないことを確認
  - 問題があれば修正し、ユーザーに質問する

- [ ] 8. 統合テストとプロパティテストの実装
  - [ ]* 8.1 統合テストを作成
    - `src/category/__tests__/integration.test.ts` を作成
    - Hugo テンプレートが生成されたデータを読み込めるテスト
    - 全体のビルドプロセスが正常に動作するテスト

  - [ ]* 8.2 統合プロパティテストを作成
    - `src/category/__tests__/integration.property.test.ts` を作成
    - **Property 2: 商品数ゼロのカテゴリの非表示**
    - **Validates: Requirements 2.1, 2.2, 5.3**
    - **Property 3: 商品追加・削除による表示状態の更新**
    - **Validates: Requirements 2.3**

- [ ] 9. Hugo テンプレートの拡張
  - [ ] 9.1 parent-category.html テンプレートを拡張
    - `layouts/_default/parent-category.html` を編集
    - `data/categories.yml` からカテゴリデータを読み込む
    - 商品数が0の場合は404ページを表示するロジックを追加
    - 子カテゴリをフィルタリング（商品数が0のものを除外）
    - 商品数の表示を追加
    - _Requirements: 1.2, 1.3, 2.1, 2.2_

  - [ ] 9.2 Hugo テンプレートの動作確認
    - `hugo server` を起動してローカルで確認
    - 親カテゴリページが正しく表示されることを確認
    - 商品数が0のカテゴリが非表示になることを確認
    - _Requirements: 1.3, 2.1, 2.2_

- [ ] 10. Checkpoint - Hugo テンプレートの検証
  - すべての親カテゴリページがアクセス可能であることを確認
  - レイアウトが崩れていないことを確認
  - 問題があれば修正し、ユーザーに質問する

- [ ] 11. category-dropdown.js の拡張
  - [ ] 11.1 category-dropdown.js を拡張
    - `static/js/category-dropdown.js` を編集
    - filterVisibleCategories 関数を追加（isVisible と productCount をチェック）
    - sortCategoriesByPriority 関数を追加
    - buildDropdown 関数を更新（商品数を表示、子カテゴリをフィルタリング）
    - エラーハンドリング（JSONの読み込み失敗、要素が見つからない）
    - _Requirements: 2.1, 2.2, 4.3_

  - [ ]* 11.2 category-dropdown.js のプロパティテストを作成
    - **Property 6: 既存機能との互換性**
    - **Validates: Requirements 4.3**

  - [ ] 11.3 クライアントサイドの動作確認
    - ブラウザでドロップダウンが正しく動作することを確認
    - 商品数が0のカテゴリが除外されることを確認
    - 優先度順にソートされることを確認
    - _Requirements: 2.1, 2.2, 4.3_

- [ ] 12. Checkpoint - クライアントサイドの検証
  - ドロップダウンが正常に動作することを確認
  - コンソールにエラーが表示されていないことを確認
  - 問題があれば修正し、ユーザーに質問する

- [ ] 13. 最終検証とドキュメント更新
  - [ ] 13.1 すべてのテストを実行
    - `npm test` を実行してすべてのテストがパスすることを確認
    - `npm run lint` を実行してESLintエラーが0件であることを確認
    - `npm run build` を実行してコンパイルエラーがないことを確認
    - _Requirements: すべて_

  - [ ] 13.2 AGENTS.md の更新（必要に応じて）
    - カテゴリグループ管理のセクションを更新
    - 新しいビルドプロセスの説明を追加
    - 動的カテゴリ生成の説明を追加

  - [ ] 13.3 移行ガイドの作成
    - `.kiro/specs/dynamic-category-control/migration-guide.md` を作成
    - 段階的な移行手順を記載
    - ロールバック手順を記載
    - トラブルシューティングを記載

- [ ] 14. Final Checkpoint - プロジェクト全体の健全性確認
  - `npm run lint` が成功することを確認（ESLintエラー0件）
  - `npm run build` が成功することを確認（TypeScriptコンパイルエラーなし）
  - `npm test` が成功することを確認（すべてのテストがパス）
  - `npm run prebuild:hugo` が成功することを確認
  - `hugo server` でローカルサーバーを起動し、すべての機能が正常に動作することを確認
  - 問題があれば修正し、ユーザーに質問する

## Notes

- タスクに `*` が付いているものはオプションで、より速いMVPのためにスキップ可能です
- 各タスクは特定の要件を参照しており、トレーサビリティを確保しています
- チェックポイントタスクは段階的な検証を保証します
- プロパティテストは普遍的な正確性プロパティを検証します
- ユニットテストは特定の例とエッジケースを検証します
- TDDアプローチに従い、実装前にテストを作成します
- AGENTS.mdのガイドラインに従い、lint/build/testの3つのコマンドがすべて成功することを確認します

## Implementation Language

TypeScript

## Test Framework

- ユニットテスト: Jest
- プロパティベーステスト: fast-check
- 最小イテレーション数: 100回/プロパティ

## Dependencies

- `gray-matter`: Front Matterのパース
- `js-yaml`: YAMLファイルの生成
- `fast-check`: プロパティベーステスト
- `ts-node`: TypeScriptスクリプトの実行
