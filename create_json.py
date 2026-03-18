import json

data = {
  "analysis": {
    "productName": "FOSMET QS40 スマートウォッチ 第3世代",
    "parentAsin": "B0GS1FZLNL",
    "productDescription": "薄型・軽量設計の丸型スマートウォッチ。ChatGPT対応、AI文字盤、AMOLEDディスプレイ、サファイアガラスを搭載し、最大10日間のバッテリー持ちを実現。",
    "productUsage": [
      "通知確認や通話",
      "睡眠や運動のモニタリング",
      "ChatGPT連携による情報収集"
    ],
    "positivePoints": [
      "サファイアガラスとAMOLEDディスプレイによる高画質と耐久性",
      "薄型・軽量設計でビジネスでもプライベートでも使いやすいデザイン",
      "通常使用で最大10日間の長持ちバッテリー"
    ],
    "negativePoints": [
      "GPSは本体非搭載（アプリ連動が必要）",
      "高温多湿環境（入浴やサウナ）での使用は非推奨"
    ],
    "useCases": [
      "日常的なメッセージ確認やハンズフリー通話",
      "ランニングやサイクリングなど150種類以上の運動記録",
      "睡眠中の質やリズムの自動記録と分析"
    ],
    "userStories": [],
    "userImpression": "薄型軽量で使いやすく、サファイアガラスやAMOLEDディスプレイの高級感が魅力。バッテリー持ちが良く、日々の健康管理からビジネスシーンまで幅広く活用できるスマートウォッチとして評価されていると推測されます。",
    "sources": [
      {
        "id": "src-1",
        "name": "Amazon商品ページ",
        "url": "https://www.amazon.co.jp/dp/B0G6YXL5RP",
        "tier": "high",
        "evidenceType": "primary",
        "publishedAt": "2026-03-19",
        "author": "FOSMET",
        "conflictOfInterest": "possible",
        "notes": "製品仕様、特徴、価格情報を取得"
      }
    ],
    "claims": [
      {
        "claim": "最大10日間のバッテリー持ち",
        "category": "quality",
        "confidence": "high",
        "supportingSourceIds": [
          "src-1"
        ],
        "crossChecked": False,
        "notes": "フル充電で約8～10日間、常時表示で約2～3日間使用可能"
      },
      {
        "claim": "3ATM防水対応",
        "category": "durability",
        "confidence": "high",
        "supportingSourceIds": [
          "src-1"
        ],
        "crossChecked": False,
        "notes": "雨の日や水辺でのアクティビティに対応"
      }
    ],
    "lastInvestigated": "2026-03-19",
    "competitiveAnalysis": [
      {
        "name": "Xiaomi Smart Band 10",
        "asin": "B0DYF82545",
        "priceComparison": "対象商品の方が高価。機能性やデザイン（サファイアガラス、丸型デザイン）に特化しているため、価格に見合う価値がある。",
        "featureComparison": [
          "共通点：睡眠モニタリングや運動モードを搭載している点",
          "相違点：FOSMET QS40は丸型でサファイアガラスを採用、ChatGPT連携機能を備えるのに対し、Xiaomi Smart Band 10はバンド型でより軽量・コンパクトなデザイン"
        ],
        "differentiators": [
          "FOSMET QS40の利点：高級感のある丸型デザインとサファイアガラス、ChatGPT対応などの多機能性",
          "Xiaomi Smart Band 10の利点：バンド型でコンパクト、より手頃な価格で日常的な活動量計として使いやすい"
        ]
      },
      {
        "name": "HUAWEI Band 11 Pro",
        "asin": "B0GJSCGFTP",
        "priceComparison": "価格帯は同程度。デザインや搭載機能（GPS内蔵の有無など）で選ぶ基準が異なる。",
        "featureComparison": [
          "共通点：長時間バッテリー、多種の運動モードや睡眠モニタリング機能を搭載",
          "相違点：HUAWEI Band 11 ProはGPSを内蔵し単体でのルート記録が可能だが、FOSMET QS40はGPS非搭載でスマートフォン連動が必要。デザインもバンド型と丸型で異なる"
        ],
        "differentiators": [
          "FOSMET QS40の利点：丸型デザインでビジネスシーンに馴染みやすく、ChatGPT連携機能を備える点",
          "HUAWEI Band 11 Proの利点：GPS内蔵でスマートフォンなしでもルート記録が可能、薄型軽量（18g）な点"
        ]
      },
      {
        "name": "Redmi Watch 5 Active",
        "asin": "B0DFZPR9Z4",
        "priceComparison": "対象商品の方が高価。ディスプレイの品質やガラスの耐久性、ChatGPT機能の有無が価格差に表れている。",
        "featureComparison": [
          "共通点：通話機能、通知機能、健康モニタリング機能を備える点",
          "相違点：FOSMET QS40はAMOLEDディスプレイとサファイアガラスを採用しているのに対し、Redmi Watch 5 Activeは液晶ディスプレイを採用している可能性がある（モデル詳細による）"
        ],
        "differentiators": [
          "FOSMET QS40の利点：サファイアガラスによる高い耐久性と、AMOLEDの鮮やかなディスプレイ表示",
          "Redmi Watch 5 Activeの利点：より手頃な価格で、基本的なスマートウォッチ機能を利用できる点"
        ]
      },
      {
        "name": "スマートウォッチ Mibro Watch FIT",
        "asin": "B0GJZ96CNS",
        "priceComparison": "対象商品の方がやや安価。どちらもデザイン性に優れるが、価格を抑えつつ高級感を求める場合に適している。",
        "featureComparison": [
          "共通点：軽量・スリムなデザインで日常からビジネスまで使いやすい点",
          "相違点：Mibro Watch FITはミラネーゼベルトなどを採用したミニマルデザインが特徴だが、FOSMET QS40はサファイアガラスとAMOLEDを採用した丸型デザイン"
        ],
        "differentiators": [
          "FOSMET QS40の利点：サファイアガラス採用による高い耐久性と、ChatGPT連携などの最新機能",
          "Mibro Watch FITの利点：より軽量・スリムなデザインで、ミラネーゼベルトなどの質感を楽しめる点"
        ]
      },
      {
        "name": "スマートウォッチ fusho",
        "asin": "B0G5GGH2GF",
        "priceComparison": "対象商品の方がやや高価。機能の充実度（ChatGPT連携、サファイアガラス等）による価格差。",
        "featureComparison": [
          "共通点：Bluetooth通話、通知機能、多種の運動モードを搭載している点",
          "相違点：fushoは大画面で懐中電灯機能などを備えるが、FOSMET QS40はサファイアガラス採用でChatGPT連携に対応している"
        ],
        "differentiators": [
          "FOSMET QS40の利点：サファイアガラスによる耐久性と、AI文字盤・ChatGPT連携などの高度な機能",
          "fushoの利点：より大画面で、手頃な価格ながら多機能である点"
        ]
      },
      {
        "name": "スマートウォッチ MTDKA",
        "asin": "B0FWK5WFPK",
        "priceComparison": "対象商品の方が高価。基本的な機能は備えつつも、素材や最新機能の有無で価格差がある。",
        "featureComparison": [
          "共通点：Bluetooth通話機能、スポーツモード、生活防水機能を備える点",
          "相違点：MTDKAは大画面を採用しているが、FOSMET QS40はAMOLEDとサファイアガラスを採用し、画質や耐久性に優れる"
        ],
        "differentiators": [
          "FOSMET QS40の利点：サファイアガラスとAMOLEDディスプレイによる高級感と耐久性、ChatGPT連携機能",
          "MTDKAの利点：大画面で視認性が高く、非常に安価である点"
        ]
      }
    ],
    "recommendation": {
      "targetUsers": [
        "ビジネスシーンでも使えるデザインのスマートウォッチを探している人",
        "長持ちするバッテリーを求める人",
        "サファイアガラスなど耐久性の高い素材を好む人"
      ],
      "pros": [
        "高級感のあるデザインと素材",
        "充実した健康管理・運動記録機能",
        "便利なChatGPT連携機能"
      ],
      "cons": [
        "GPS非搭載のため、ルート記録にはスマートフォンが必要",
        "入浴時の使用は非推奨"
      ],
      "score": 85,
      "scoreRationale": "[基本点: 70]\n[加点: +10] (サファイアガラスとAMOLED採用による高い耐久性と視認性)\n[加点: +5] (最大10日間の長持ちバッテリー)\n[加点: +5] (ChatGPT連携やAI文字盤などの先進機能)\n[減点: -5] (GPS非搭載)\n[合計: 85]"
    },
    "technicalSpecs": {
      "dimensions": {
        "height": "不明",
        "width": "不明",
        "depth": "不明"
      },
      "weight": "33g",
      "display": "AMOLED (約3.6cmまたは約3.7cm)",
      "material": "サファイアガラス（ディスプレイ）",
      "battery": "フル充電で約8～10日間の連続使用、常時表示で約2～3日間、待機時間は最大約21日間",
      "chargingTime": "約2時間（フル充電）、約30分（急速充電で1日分）",
      "waterResistance": "3ATM防水",
      "sportsModes": "150種類以上",
      "other": [
        "Bluetooth通話機能",
        "ChatGPT対応（スマートフォン連動）",
        "自動運動検知機能",
        "AI文字盤",
        "睡眠モニタリング（4段階）",
        "血中酸素・心拍数・ストレスレベル測定"
      ]
    }
  }
}

with open("data/investigations/B0G6YXL5RP.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
