/**
 * Amazon商品調査リクエスト管理 Web API
 *
 * GitHub Actions からのHTTPリクエストを受け取り、
 * 未処理URLの取得および処理ステータスの更新を行う。
 */

function getSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function isValidToken(token) {
  if (!token) return false;
  const validToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!validToken) return false;
  return token === validToken;
}

function createJsonResponse(data, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

const COMPLETED_STATUSES = new Set(['完了', '無効なURL', '調査済（重複）', '重複リクエスト']);

/**
 * 1行のデータを検証・パースする（Cognitive Complexity低減）
 */
function parseRow(rowValues, rowNum) {
  const [timestamp, url, status, asin, processedAt, note] = rowValues;
  const urlStr = String(url || '').trim();
  const statusStr = String(status || '').trim();

  if (!urlStr || COMPLETED_STATUSES.has(statusStr)) {
    return null;
  }

  return {
    row: rowNum,
    timestamp: timestamp ? String(timestamp) : '',
    url: urlStr,
    status: statusStr || '未処理',
    asin: asin ? String(asin) : undefined,
    processedAt: processedAt ? String(processedAt) : undefined,
    note: note ? String(note) : undefined,
  };
}

/**
 * スプレッドシートから未完了のリクエスト行を抽出する
 */
function extractUnprocessedRequests(sheet, limit) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const unprocessed = [];

  for (let i = 0; i < data.length; i++) {
    const item = parseRow(data[i], i + 2);
    if (!item) continue;

    unprocessed.push(item);
    if (unprocessed.length >= limit) break;
  }

  return unprocessed;
}

/**
 * 各行のステータス更新を適用する（Cognitive Complexity低減）
 */
function applyRowUpdates(sheet, updates, now) {
  const maxRow = sheet.getLastRow();
  let updatedCount = 0;

  for (const update of updates) {
    const row = update.row;
    if (!row || row < 2 || row > maxRow) continue;

    if (update.status) {
      sheet.getRange(row, 3).setValue(update.status);
    }
    if (update.asin !== undefined) {
      sheet.getRange(row, 4).setValue(update.asin);
    }
    sheet.getRange(row, 5).setValue(now);
    if (update.note !== undefined) {
      sheet.getRange(row, 6).setValue(update.note);
    }

    updatedCount++;
  }

  return updatedCount;
}

/**
 * GET: 未処理のユーザーリクエスト一覧を取得
 * パラメータ:
 *   token: 認証トークン
 *   limit: 取得上限件数（デフォルト: 10）
 */
function doGet(e) {
  try {
    const token = e?.parameter?.token;
    if (!isValidToken(token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: Invalid or missing token' }, 401);
    }

    const limitParam = e?.parameter?.limit || '10';
    const limit = Math.max(1, Math.min(50, Number.parseInt(limitParam, 10)));
    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheets()[0];

    const requests = extractUnprocessedRequests(sheet, limit);

    return createJsonResponse({
      success: true,
      count: requests.length,
      requests: requests,
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
}

/**
 * 待ち件数に応じたGoogleフォーム確認メッセージを生成
 */
function generateConfirmationMessage(pendingCount) {
  let queueText = '';
  if (pendingCount <= 1) {
    queueText =
      '【現在の調査状況・目安】\n' +
      '・現在の調査待ち: 0 件（現在待機列はありません）\n' +
      '・調査開始の目安: 次回実行時（1時間以内）に調査が開始される見込みです。\n';
  } else {
    queueText =
      '【現在の調査状況・目安】\n' +
      `・現在の調査待ち: 約 ${pendingCount - 1} 件\n` +
      `・調査開始の目安: 約 ${pendingCount - 1} 時間以内（1時間に1件ずつ順次調査中）\n`;
  }

  return (
    '送信が完了しました。リクエストありがとうございます！\n\n' +
    queueText + '\n' +
    '※既に記事が存在する場合や無効なURLの場合はスキップされるため、より早く開始される場合があります。\n' +
    '※調査結果は当サイトにて自動公開されます。'
  );
}

/**
 * スプレッドシートの未完了件数を集計し、フォーム送信完了画面のメッセージを最新化する
 */
function updateConfirmationMessage() {
  try {
    const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
    if (!formId) return;

    const form = FormApp.openById(formId);
    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheets()[0];
    const lastRow = sheet.getLastRow();

    let pendingCount = 0;
    if (lastRow > 1) {
      const data = sheet.getRange(2, 2, lastRow - 1, 2).getValues(); // B列(URL), C列(ステータス)
      for (let i = 0; i < data.length; i++) {
        const url = String(data[i][0] || '').trim();
        const status = String(data[i][1] || '').trim();
        if (url && !COMPLETED_STATUSES.has(status)) {
          pendingCount++;
        }
      }
    }

    const message = generateConfirmationMessage(pendingCount);
    form.setConfirmationMessage(message);
  } catch (error) {
    Logger.log('Failed to update confirmation message: ' + error);
  }
}

/**
 * フォーム送信時トリガー用ハンドラ
 */
function onFormSubmit(e) {
  updateConfirmationMessage();
}

/**
 * POST: 処理完了・ステータス更新
 * ペイロード:
 * {
 *   "token": "...",
 *   "updates": [
 *     { "row": 2, "status": "完了", "asin": "B0XXXXXXXX", "note": "..." }
 *   ]
 * }
 */
function doPost(e) {
  try {
    if (!e?.postData?.contents) {
      return createJsonResponse({ success: false, error: 'Empty post body' }, 400);
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (_err) {
      return createJsonResponse({ success: false, error: 'Invalid JSON payload' }, 400);
    }

    if (!isValidToken(payload?.token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: Invalid or missing token' }, 401);
    }

    if (!Array.isArray(payload?.updates) || payload.updates.length === 0) {
      return createJsonResponse({ success: true, updatedCount: 0, message: 'No updates provided' });
    }

    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheets()[0];
    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

    const updatedCount = applyRowUpdates(sheet, payload.updates, now);

    // ステータス更新後にフォームの確認メッセージ（待ち件数）も自動最新化
    updateConfirmationMessage();

    return createJsonResponse({
      success: true,
      updatedCount: updatedCount,
      timestamp: now,
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
}
