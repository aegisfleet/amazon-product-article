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

失敗したワークフローのURL（`https://github.com/.../actions/runs/12345`）から、実行ID（`12345`）を取得します。
ローカルのターミナルで以下のコマンドを使用して、失敗したジョブの一覧を確認できます。

```powershell
gh run view <実行ID>
```

## 2. 失敗メッセージの取得

失敗した個所が判明している場合、その詳細ログを取得します。

// turbo
### 失敗したジョブのログを表示
```powershell
gh run view --job <ジョブID> --log-failed
```

ジョブIDがわからない場合や、全体から探す場合は以下が便利です。

// turbo
### 失敗した実行全体のログからキーワード検索（例: "FAIL", "Error"）
```powershell
gh run view <実行ID> --log | Select-String -Pattern "FAIL|Error|Exception" -Context 5, 20
```

> [!TIP]
> Windows環境（PowerShell）では `Select-String` を使用します。Linux/Mac環境では `grep` を使用してください。

## 3. ローカルでの再現

エラーがテストの失敗である場合は、ローカルでテストを実行して詳細を確認します。

// turbo
### すべてのテストを実行
```powershell
npm test
```

// turbo
### 特定のファイルのみ実行
```powershell
npx jest path/to/failing_test.ts
```

## 4. 調査ログの整理

調査のためにログをファイルに出力する場合は、`tmp/` ディレクトリ配下に出力し、文字化けを防ぐためにUTF-8エンコーディングを指定することをお勧めします。

```powershell
# ジョブ全体のログを保存
gh run view --job <ジョブID> --log | Out-File -FilePath tmp/workflow_log.txt -Encoding utf8

# ローカルテストの結果を保存
npm test 2>&1 | Out-File -FilePath tmp/local_test_result.txt -Encoding utf8
```

## 5. 修正と検証

1. 原因を特定したらコードを修正します。
2. ローカルでテストがパスすることを確認します。
3. 修正をコミット・プッシュし、GitHub Actionsでパスすることを確認します。
