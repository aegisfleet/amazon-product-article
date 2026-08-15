---
description: 商品（スマートフォン等）のスペック調査・data/investigations更新および比較機能反映の手順
---

# 商品スペック調査・更新ワークフロー

スマートフォンやガジェット・家電製品などにおいて、スペック未調査または一部欠損している商品の仕様を効率的に調査し、`data/investigations/<ASIN>.json` を更新してサイト上の比較機能（Compare Feature）およびスペックタグへ反映する標準手順である。

---

## 1. スペック未調査・欠損商品の特定 (Identification)

### 1.1 高速抽出スクリプトによる対象ASINのリストアップ
`scripts/find_incomplete_specs.py` を実行して、スペックが未調査または一部欠損（CPU, RAM, Storage, OS, Display, Battery等）している商品を瞬時に抽出する。

```bash
uv run python scripts/find_incomplete_specs.py
```

> [!TIP]
> **PowerShellではなくPythonスクリプトを使用する理由**
> 数万件のJSONファイルを走査する場合、PowerShell（`ConvertFrom-Json`）は処理時間が長くなる傾向があります。`uv run python scripts/find_incomplete_specs.py` を利用することで、1秒未満で安全に対象商品をリストアップできます。

### 1.2 全体のスペック状況分析
全体的なフィールド出現頻度や型の一貫性を確認したい場合は、`scripts/analyze-technical-specs.ts` を実行する。

```bash
npx ts-node scripts/analyze-technical-specs.ts
```

---

## 2. スペック情報の収集 (Research)

### 2.1 Amazon生データ / API情報の取得
Amazon Creators APIから該当商品の詳細情報・特徴リスト（FeatureBullets）を取得する。

```bash
uv run python scripts/creators_get_item.py <ASIN>
```
実行結果は `tmp/product_info.json` に出力される。

### 2.2 公式スペックおよび信頼できる一次情報源の調査
APIデータで不足している詳細スペック（SoC型番、RAM/ROM規格、バッテリー容量、充電W数、防水等級、対応バンド/FeliCa有無等）は、以下の優先度で調査を行う：

1. **メーカー公式サイト・スペック表**（最優先）
2. **メーカー公式プレスリリース**
3. **信頼性の高いテック系メディア・実機レビュー記事**

> [!IMPORTANT]
> **情報源（sources）の記録**
> 調査で参照したURLは、JSON内の `analysis.sources` に追加・更新すること。

---

## 3. `data/investigations/<ASIN>.json` の更新 (Update)

`data/investigations/<ASIN>.json` の `analysis.technicalSpecs` を以下の構造化スキーマに従って更新する。

> [!CAUTION]
> **`other` 配列への詰め込みを避け、完全構造化を行うこと**
> かつての調査データでよく見られた「`other` 配列に `"CPU: ..."` や `"ディスプレイ: ..."` などの文字列をまとめて入れる」形式は非推奨です。
> 比較モーダル（`compare.js`）や記事のスペック表で正しく横並び比較できるように、必ず各専用キー（`os`, `cpu`, `ram`, `storage`, `display`, `battery`, `camera`, `dimensions`, `connectivity`）へ構造化して記述してください。

### 3.1 スマートフォン・タブレット・PC向け構造化スキーマ例

```json
"technicalSpecs": {
  "os": "Android 15 (ColorOS 15)",
  "cpu": "Qualcomm Snapdragon 6 Gen 1",
  "ram": "8GB",
  "storage": "128GB",
  "display": {
    "size": "6.7インチ",
    "resolution": "2400×1080 (FHD+)",
    "type": "AMOLED (有機EL)",
    "refreshRate": "120Hz"
  },
  "battery": {
    "capacity": "5800mAh",
    "charging": "45W SUPERVOOC急速充電対応"
  },
  "camera": {
    "main": "50MP (広角 OIS搭載)",
    "ultrawide": "8MP (超広角)",
    "front": "32MP"
  },
  "dimensions": {
    "height": "162mm",
    "width": "75mm",
    "depth": "7.8mm",
    "weight": "192g"
  },
  "weight": "192g",
  "material": "ガラス / 樹脂（カラーによる加工）",
  "origin": "中国",
  "connectivity": [
    "5G",
    "Wi-Fi 6 (802.11ax)",
    "Bluetooth 5.4",
    "FeliCa / おサイフケータイ",
    "eSIM対応"
  ],
  "other": [
    "防塵防水: IP68 / IP69",
    "生体認証: ディスプレイ指紋認証 / 顔認証",
    "AI機能: AI消しゴム / AIポートレート機能",
    "マクロカメラ: 2MP",
    "microSDXC対応 (最大2TB)"
  ]
}
```

### 3.2 スペック記載時の厳格ルール

1. **単位はメートル法を厳守**:
   - 長さ・厚み: `mm` または `cm`（※ヤード・ポンド法 `inch`, `ft`, `lbs`, `oz` 等は禁止）
   - 重量: `g` または `kg`
   - **例外（ディスプレイ）**: 画面サイズのみ `"6.7インチ"` や `"6.1インチ"` などのインチ表記が許可される。
   - **カメラセンサーサイズ**: `"1/1.31インチ"` ではなく、日本規格の **`"1/1.31型"`** または **`"1/1.56型"`** と表記すること（バリデータのインチ検出エラーを防止）。
2. **ネストオブジェクトのキー命名**:
   - `display`: `size`, `resolution`, `type`, `refreshRate`
   - `battery`: `capacity`, `charging`, `playbackTime`
   - `camera`: `main`, `ultrawide`, `telephoto`, `front`
   - `dimensions`: `height`, `width`, `depth`, `weight`
3. **比較機能・タグ連動キーワード**:
   - 親・子カテゴリ一覧のスペック絞り込みフィルター（`parent-category.html`, `list.html`）や比較モーダル（`compare.js`）は、`connectivity` や `other`、`display` 内の特定キーワード（`5g`, `gps`, `felica`, `nfc`, `suica`, `おサイフ`, `amoled`, `oled`, `有機el`, `防水`, `ip68`, `軽量` など）を自動検出してチップや比較項目を生成する。主要な機能キーワードは漏れなく記載すること。
4. **制約・注意点の `other` 記載**:
   - シニア向けスマホの専用物理ボタンや、「※おサイフケータイ非対応」「※microSDカード非対応」などの購入判断に関わる重要な仕様・制約は、`other` 配列内に明記すること。
5. **折りたたみ（フォルダブル）スマホの記述ルール**:
   - `display`: メイン画面とカバー画面が存在する場合、`size: "6.7インチ (メイン) / 3.4インチ (カバー)"`、`resolution: "2640×1080 (メイン) / 720×748 (カバー)"` のように両方の仕様を明記すること。
   - `dimensions`: 開閉時のサイズが異なる場合、`height: "165.1mm (開時) / 85.1mm (閉時)"`、`depth: "6.9mm (開時) / 15.1mm (閉時)"` と表記すること。
6. **充電性能の明記**:
   - `battery.charging`: 単に「急速充電」とせず、最大ワット数やワイヤレス充電対応（例: `"68W TurboPower急速充電 / 15Wワイヤレス充電対応"`）を具体的に記載すること。

---

## 4. バリデーションと品質検証 (Validation)

更新したJSONファイルがプロジェクトの品質基準を満たしているか検証する。

### 4.1 アーティファクト検証
単位の誤り（非メートル法の混入）やJSON構造の欠損がないかを検証する。複数ファイルを一括で指定可能。

```bash
uv run python scripts/validate_artifact.py data/investigations/<ASIN_1>.json data/investigations/<ASIN_2>.json
```

### 4.2 Biome構文チェック
JSONフォーマットや構文エラーがないことを確認する。

```bash
pnpm run biome:check
```

---

## 5. 記事生成と反映確認 (Generation & Verification)

### 5.1 更新対象の記事 Markdown のみを高速再生成
更新した調査JSONファイルを直接引数に渡すことで、対象記事のみを瞬時に再生成できる。

```bash
npx ts-node src/scripts/article-generation-cli.ts data/investigations/<ASIN_1>.json data/investigations/<ASIN_2>.json
```

全記事をまとめて再生成する場合は `pnpm run generate:articles` を実行する。

### 5.2 生成結果（Front Matter）の確認
`content/articles/<ASIN>.md` を開き、フロントマターの `specs` セクションに正規化されたスペック情報が正しく書き出されているか確認する。

```yaml
---
specs:
  os: "Android 15 (ColorOS 15)"
  cpu: "Qualcomm Snapdragon 6 Gen 1"
  ram: "8GB"
  storage: "128GB"
  display_size: "6.7インチ"
  display_resolution: "2400×1080 (FHD+)"
  display_type: "AMOLED (有機EL)"
  display_refresh_rate: "120Hz"
  battery_capacity: "5800mAh"
  battery_charging: "45W SUPERVOOC急速充電対応"
  weight: "192g"
  ...
---
```

### 5.3 比較機能（Compare Feature）の動作確認
開発サーバーを起動し、ブラウザ上で該当商品と他商品を「比較」に追加して、比較モーダルでスペック項目が正しく横並び比較できるか確認する。

```powershell
# サーバー起動 (PowerShell)
pnpm run server:dev
```

- **確認ポイント**:
  1. 商品カード / ヒーローセクションの「比較」ボタンを押して比較トレイに追加できるか。
  2. 比較モーダル（`compare.js`）を開いた際に、OS・CPU・RAM・ストレージ・ディスプレイ・バッテリー等の各項目が表（テーブル）として綺麗に整列・表示されるか。
  3. カテゴリページのスペックフィルター（5G, 有機EL, おサイフケータイ等）で正しく絞り込めるか。

---

## 6. 一連の流れまとめ（クイックリファレンス）

| ステップ | コマンド・作業 | 目的 |
|---|---|---|
| **1. 抽出** | `uv run python scripts/find_incomplete_specs.py` | スペック未調査ASINの高速特定 |
| **2. 調査** | `creators_get_item.py` + Web検索 | 公式スペックの取得 |
| **3. 更新** | `data/investigations/<ASIN>.json` 編集 | 各キーへ完全構造化入力 |
| **4. 検証** | `uv run python scripts/validate_artifact.py <パス...>` | 単位・構造のチェック |
| **5. 整形** | `pnpm run biome:check` (`biome:fix`) | JSONフォーマット検証 |
| **6. 反映** | `npx ts-node src/scripts/article-generation-cli.ts <パス...>` | 対象記事 Markdown の即時再生成 |
| **7. 確認** | `pnpm run server:dev` | 比較モーダル・タグの目視確認 |
