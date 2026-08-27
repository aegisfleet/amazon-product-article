/**
 * Amazon商品調査リクエスト管理システム 初期化スクリプト
 *
 * 実行手順:
 * 1. GASエディタまたはclaspから setupProductRequestSystem() を実行する。
 * 2. 実行ログに表示されるフォームURL（公開用・編集用）とスプレッドシートURLを控える。
 * 3. スクリプトプロパティ「API_TOKEN」に任意の認証トークン（UUID等）を設定する。
 */

const FORM_DESCRIPTION = 
  '当サイトで調査・記事化してほしいAmazon商品のURLを入力してください。\n' +
  'システムが自動で定期調査を行い、レビュー・スペック比較記事を作成・公開します。\n\n' +
  '【URLの入力について】\n' +
  '・ブラウザのアドレスバーからコピーしたURLをそのまま貼り付けてください。\n' +
  '・日本語の商品名や長いパラメーターが含まれるURL、公式アプリの共有短縮URLのどちらでも自動判別されます。\n\n' +
  '【調査スケジュール・仕様】\n' +
  '・調査実施: 1時間に1回程度\n' +
  '・調査件数: 1回あたり1件ずつ順次調査\n' +
  '・対象外: 既にサイト上に記事が存在する商品や、無効なURLは自動的にスキップされます。\n\n' +
  '【プライバシー・個人情報について】\n' +
  '・完全匿名でご利用いただけます。\n' +
  '・ご入力いただいた商品URLのみが送信され、Googleアカウント情報やメールアドレス等の個人情報は一切収集・記録されません。';

const HELP_TEXT = 'ブラウザのアドレスバーからコピーした長いURL（または公式アプリの共有短縮URL）をそのまま貼り付けてください。';

function setupProductRequestSystem() {
  // 1. 回答保存用スプレッドシートを作成
  const spreadsheet = SpreadsheetApp.create('Amazon商品調査リクエスト管理シート');
  const sheet = spreadsheet.getActiveSheet();
  sheet.setName('フォームの回答 1');
  const spreadsheetId = spreadsheet.getId();

  // 2. Googleフォームを作成
  const form = FormApp.create('Amazon商品調査リクエスト');
  form.setDescription(FORM_DESCRIPTION);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setProgressBar(false);

  // 3. 商品URL入力項目を追加（バリデーション設定）
  const urlValidation = FormApp.createTextValidation()
    .requireTextMatchesPattern(
      'https?://.*amazon\\.co\\.jp/.*|https?://amzn\\.asia/.*|https?://amzn\\.to/.*|https?://.*link\\.amazon/.*|https?://a\\.co/.*',
    )
    .setHelpText('有効なAmazon.co.jpの商品URL（または短縮URL）を入力してください。')
    .build();

  form.addTextItem()
    .setTitle('Amazon商品のURL')
    .setHelpText(HELP_TEXT)
    .setRequired(true)
    .setValidation(urlValidation);

  // 4. フォームの回答先をスプレッドシートに紐付け
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheetId);

  // 5. スクリプトプロパティ設定
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('SPREADSHEET_ID', spreadsheetId);
  scriptProperties.setProperty('FORM_ID', form.getId());

  // デフォルトのAPIトークンを生成（未設定の場合）
  if (!scriptProperties.getProperty('API_TOKEN')) {
    scriptProperties.setProperty('API_TOKEN', Utilities.getUuid());
  }

  // スプレッドシート側のヘッダー初期設定
  const updatedSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const updatedSheet = updatedSpreadsheet.getActiveSheet();

  // フォーム連携でA列=タイムスタンプ, B列=Amazon商品のURL が自動作成される想定
  // C列以降に管理用ヘッダーを追加
  const headers = ['ステータス', 'ASIN', '処理日時', '備考'];
  updatedSheet.getRange(1, 3, 1, headers.length).setValues([headers]);
  updatedSheet.getRange(1, 1, 1, 6).setBackground('#f3f4f6').setFontWeight('bold');
  updatedSheet.setFrozenRows(1);

  Logger.log('=== 初期セットアップが完了しました ===');
  Logger.log(`公開用フォームURL: ${form.getPublishedUrl()}`);
  Logger.log(`編集用フォームURL: ${form.getEditUrl()}`);
  Logger.log(`スプレッドシートURL: ${spreadsheet.getUrl()}`);
  Logger.log(`スプレッドシートID: ${spreadsheetId}`);
  Logger.log(`API認証トークン: ${scriptProperties.getProperty('API_TOKEN')}`);
}

/**
 * 既存のGoogleフォームの説明文・補足文・URLバリデーションを即座に最新化する関数
 * （既にフォームを作成済みの場合、これだけ実行すればフォームURLを変えずに最新化されます）
 */
function updateFormDescription() {
  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) {
    throw new Error('FORM_ID が設定されていません。先に setupProductRequestSystem を実行してください。');
  }
  const form = FormApp.openById(formId);
  form.setDescription(FORM_DESCRIPTION);

  // 質問項目の補足テキストおよびバリデーションを更新
  const items = form.getItems(FormApp.ItemType.TEXT);
  if (items.length > 0) {
    const textItem = items[0].asTextItem();
    textItem.setHelpText(HELP_TEXT);

    const urlValidation = FormApp.createTextValidation()
      .requireTextMatchesPattern(
        'https?://.*amazon\\.co\\.jp/.*|https?://amzn\\.asia/.*|https?://amzn\\.to/.*|https?://.*link\\.amazon/.*|https?://a\\.co/.*',
      )
      .setHelpText('有効なAmazon.co.jpの商品URL（または短縮URL）を入力してください。')
      .build();
    textItem.setValidation(urlValidation);
  }

  Logger.log('フォームの説明文およびバリデーションを更新しました: ' + form.getPublishedUrl());
}
