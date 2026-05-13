---
description: GitHub Actionsのワークフローが失敗した原因を調査する
---

GitHub Actionsのワークフローが失敗した際、原因を効率的に特定し、修正するための手順です。

## 0. 事前準備 (ディレクトリの作成)

ログファイルを整理するため、プロジェクトのルートディレクトリに `tmp` フォルダが存在することを確認し、なければ作成します。

```powershell
if (!(Test-Path tmp)) { New-Item -ItemType Directory tmp }
```

## 1. 失敗した実行の特定

URLがわかっている場合はそのID（末尾の数字）を使います。
不明な場合や直近の失敗を調査する場合は、以下のコマンドで最新の失敗した実行IDを取得できます。

// turbo
### 直近の失敗した実行を表示
```powershell
gh run list --status failure --limit 1
```

特定の実行の詳細（ジョブ一覧など）を確認するには：
```powershell
gh run view <実行ID>
```

## 2. 失敗メッセージの素早い取得

もっとも効率的な方法は、実行全体の「失敗した箇所のログだけ」を表示することです。ジョブIDを指定する必要はありません。

// turbo
### 失敗した箇所のログのみを表示
```powershell
gh run view <実行ID> --log-failed
```

ログが膨大な場合や、ブラウザでUIを使って確認したい場合は：
```powershell
gh run view <実行ID> --web
```

## 3. ローカルでの再現と原因の切り分け

ログから原因（Lintエラーか、テスト失敗かなど）を推測し、ローカルで実行します。

### Lintエラーの場合
```powershell
# 修正も同時に試みる場合
pnpm run lint:fix

# エラー箇所のみを確認
pnpm run lint -- --quiet
```

### テスト失敗の場合
```powershell
# すべてのテストを実行
pnpm test

# 特定のファイルのみ実行（高速）
npx jest path/to/failing_test.ts
```

## 4. 調査ログの整理（必要に応じて）

`tmp/` ディレクトリ配下に出力して詳細に分析します。

```powershell
# ジョブ全体のログを保存
gh run view --job <ジョブID> --log | Out-File -FilePath tmp/workflow_log.txt -Encoding utf8
```

## 5. 修正と検証

1. 原因を特定したらコードを修正します。
2. ローカルでテスト/Lintがパスすることを確認します。
3. 修正をコミット・プッシュし、GitHub Actionsでパスすることを確認します。
