import type { ArticleTemplate } from '../types/ArticleTypes';

/**
 * スペックフィールド名から日本語ラベルへのマッピング
 * 動的レンダリングで使用
 */
export const SPEC_LABEL_MAP: Record<string, string> = {
  // 基本情報
  dimensions: 'サイズ',
  weight: '重量',
  material: '素材',
  color: 'カラー',
  model: '型番',
  modelNumber: '型番',
  count: '個数',
  countryOfOrigin: '原産国',
  country_of_origin: '原産国',
  category: 'カテゴリ',
  productType: '商品タイプ',
  brand: 'ブランド',
  manufacturer: 'メーカー',

  // 電子機器
  os: 'OS',
  cpu: 'プロセッサ',
  gpu: 'GPU',
  processor: 'プロセッサ',
  ram: 'メモリ',
  memory: 'メモリ',
  storage: 'ストレージ',
  display: 'ディスプレイ',
  battery: 'バッテリー',
  camera: 'カメラ',
  connectivity: '接続',
  interface: 'インターフェース',
  connectorType: 'コネクタタイプ',
  transferSpeed: '転送速度',
  dataTransferSpeed: 'データ転送速度',
  resolution: '解像度',
  refreshRate: 'リフレッシュレート',
  responseTime: '応答速度',

  // 電源・家電関連
  power: '電力/電源',
  powerConsumption: '消費電力',
  consumption: '消費電力',
  capacity: '容量',
  tankCapacity: 'タンク容量',
  dustCapacity: '集塵容量',
  output: '出力',
  input: '入力',
  maxPower: '最大出力',
  cableLength: 'ケーブル長',
  cordLength: 'コード長',
  ports: 'ポート',
  voltage: '電圧',
  frequency: '周波数',

  // オーディオ
  driver: 'ドライバー',
  codec: 'コーデック',
  noiseCancel: 'ノイズキャンセル',
  microphone: 'マイク',
  frequencyResponse: '周波数特性',
  impedance: 'インピーダンス',
  sensitivity: '感度',

  // 靴（シューズ）・アパレル
  width: '幅',
  midsole: 'ミッドソール',
  cushioningTech: 'クッショニング',
  heelCounter: 'ヒールカウンター',
  heelHeight: 'ヒール高',
  upperMaterial: 'アッパー素材',
  midsoleMaterial: 'ミッドソール素材',
  outsoleMaterial: 'アウトソール素材',
  outerSole: 'アウトソール',
  insoleMaterial: 'インソール素材',
  innerSole: 'インソール',
  insole: 'インソール',
  soleMaterial: 'ソール素材',
  claspType: '留め具タイプ',
  closureType: '留め具',

  // 食品・サプリ・美容・健康
  quantity: '内容量',
  content: '内容量',
  contentVolume: '内容量',
  servingSize: '1食分量',
  activeIngredients: '有効成分',
  mainIngredients: '主な成分',
  ingredients: '成分',
  allergens: 'アレルゲン',
  calories: 'カロリー',
  protein: 'タンパク質',
  fat: '脂質',
  carbohydrates: '炭水化物',
  saltEquivalent: '食塩相当量',
  dosage: '用法・用量',
  dailyDosage: '1日の摂取目安',
  origin: '産地',
  shelfLife: '期限',
  flavor: '味',
  fragrance: '香り',
  scent: '香り',
  skinType: '対象肌タイプ',

  // 文房具・書籍・メディア
  pages: 'ページ数',
  publicationDate: '出版日',
  publisher: '出版社',
  binding: '製本',
  genre: 'ジャンル',
  language: '言語',
  isbn: 'ISBN',
  numberOfDiscs: 'ディスク枚数',
  discCount: 'ディスク枚数',

  // その他・共通
  loadCapacity: '耐荷重',
  load_capacity: '耐荷重',
  attachments: '付属品',
  accessories: '付属品',
  includedItems: '同梱物',
  packageContents: '同梱物',
  other: 'その他',
  features: '特徴',
  specialFeatures: '特殊機能',
  compatibility: '互換性',
  compatibleDevices: '対応機器',
  compatibleModels: '対応モデル',
  releaseDate: '発売日',
  warranty: '保証',
  targetAge: '対象年齢',
  recommendedAge: '推奨年齢',
  uvProtection: 'UVカット',

  // コンタクトレンズ
  dia: 'レンズ直径(DIA)',
  bc: 'ベースカーブ(BC)',
  coloredDiameter: '着色直径',
  waterContent: '含水率',
  lensType: 'レンズタイプ',
  medicalApprovalNumber: '医療機器承認番号',

  // 寸法・重量（ネストされたプロパティ用）
  height: '高さ',
  depth: '奥行き',
  thickness: '厚さ',

  // ディスプレイ・その他（ネストされたプロパティ用）
  size: 'サイズ',
  type: 'タイプ',

  // バッテリー（ネストされたプロパティ用）
  charging: '充電',
  playbackTime: '再生時間',

  // カメラ（ネストされたプロパティ用）
  main: 'メイン',
  ultrawide: '超広角',
  telephoto: '望遠',
  front: 'フロント',
};

/**
 * 英語の値を日本語に変換するためのマッピング
 */
export const SPEC_VALUE_MAP: Record<string, string> = {
  yes: 'あり',
  no: 'なし',
  true: 'あり',
  false: 'なし',
  available: '在庫あり',
  'in stock': '在庫あり',
  unavailable: '在庫なし',
  'out of stock': '在庫なし',
  black: 'ブラック',
  white: 'ホワイト',
  blue: 'ブルー',
  red: 'レッド',
  green: 'グリーン',
  gray: 'グレー',
  grey: 'グレー',
  silver: 'シルバー',
  gold: 'ゴールド',
  pink: 'ピンク',
  purple: 'パープル',
  brown: 'ブラウン',
  orange: 'オレンジ',
  yellow: 'イエロー',
  transparent: '透明',
  clear: 'クリア',
};

/**
 * 無効なプレースホルダー値のセット
 */
export const INVALID_PLACEHOLDERS = new Set(['null', 'none', 'unknown', '不明', 'n/a', '-', 'なし']);

/**
 * 既知のフィールド（既存ロジックで処理済み）
 * これらは動的レンダリングから除外される
 */
export const HANDLED_SPEC_FIELDS = new Set([
  // これらのフィールドは renderDynamicSpecs で自動表示しない（別途手動で表示するため）
  'asin',
  'price',
  'brand',
  'category',
  'availability',
  'externalIds',
  'images',
  'title',
  'url',
]);

export const DEFAULT_IMAGE_URL = 'https://placehold.jp/ffffff/000000/300x300.png?text=No%20Image';

export const DEFAULT_ARTICLE_TEMPLATE: ArticleTemplate = {
  sections: {
    introduction: {
      title: '導入部',
      minWordCount: 200,
      requiredElements: ['商品名', '記事の目的', '読者への価値提案'],
      structure: '商品紹介 → 記事の目的 → 読者メリット',
    },
    userReviews: {
      title: 'ユーザーレビュー',
      minWordCount: 800,
      requiredElements: ['ポジティブポイント', 'ネガティブポイント', '使用シーン'],
      structure: '良い点 → 気になる点 → 実際の使用例',
    },
    competitiveAnalysis: {
      title: '競合商品との比較',
      minWordCount: 600,
      requiredElements: ['競合商品', '比較ポイント', '選び方のポイント'],
      structure: '競合商品紹介 → 比較ポイント → 優位性分析',
    },
    recommendation: {
      title: '購入推奨度',
      minWordCount: 400,
      requiredElements: ['推奨ユーザー', '注意点', 'コスパ評価'],
      structure: '総合評価 → 推奨ユーザー → 購入判断',
    },
    conclusion: {
      title: '商品詳細・購入',
      minWordCount: 200,
      requiredElements: ['商品情報', '購入リンク', 'チェックリスト'],
      structure: '商品詳細 → 購入案内 → 注意事項',
    },
  },
  qualityRequirements: {
    minWordCount: 2000,
    requiredElements: ['商品概要', 'ユーザーレビュー', '競合比較', '購入推奨度', 'アフィリエイト開示'],
    styleGuidelines: [
      {
        rule: 'mobile_first',
        description: 'モバイルファーストのレスポンシブデザイン',
        example: '短い段落、読みやすいフォント、タップしやすいボタン',
      },
      {
        rule: 'seo_optimized',
        description: 'SEO最適化されたコンテンツ構造',
        example: '適切な見出し構造、キーワード配置、メタデータ',
      },
      {
        rule: 'user_focused',
        description: 'ユーザーの購買判断を支援する内容',
        example: '具体的な使用例、明確な推奨理由、注意点の明示',
      },
    ],
  },
};
