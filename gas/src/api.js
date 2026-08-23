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

/**
 * GET: 未処理のユーザーリクエスト一覧を取得
 * パラメータ:
 *   token: 認証トークン
 *   limit: 取得上限件数（デフォルト: 10）
 */
function doGet(e) {
  try {
    const token = e && e.parameter ? e.parameter.token : null;
    if (!isValidToken(token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: Invalid or missing token' }, 401);
    }

    const limit = Math.max(1, Math.min(50, parseInt((e.parameter && e.parameter.limit) || '10', 10)));
    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheets()[0];
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return createJsonResponse({ success: true, count: 0, requests: [] });
    }

    // A列〜F列（タイムスタンプ, URL, ステータス, ASIN, 処理日時, 備考）を取得
    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const unprocessed = [];

    for (let i = 0; i < data.length; i++) {
      const rowNum = i + 2;
      const [timestamp, url, status, asin, _processedAt, note] = data[i];

      const urlStr = String(url || '').trim();
      const statusStr = String(status || '').trim();

      if (!urlStr) continue;

      // ステータスが空、または「未処理」のものを抽出
      if (!statusStr || statusStr === '未処理') {
        unprocessed.push({
          row: rowNum,
          timestamp: timestamp ? String(timestamp) : '',
          url: urlStr,
          status: statusStr || '未処理',
          asin: asin ? String(asin) : undefined,
          note: note ? String(note) : undefined,
        });

        if (unprocessed.length >= limit) {
          break;
        }
      }
    }

    return createJsonResponse({
      success: true,
      count: unprocessed.length,
      requests: unprocessed,
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error && error.message ? error.message : String(error),
    }, 500);
  }
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
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ success: false, error: 'Empty post body' }, 400);
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (_err) {
      return createJsonResponse({ success: false, error: 'Invalid JSON payload' }, 400);
    }

    if (!isValidToken(payload.token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: Invalid or missing token' }, 401);
    }

    if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
      return createJsonResponse({ success: true, updatedCount: 0, message: 'No updates provided' });
    }

    const spreadsheet = getSpreadsheet();
    const sheet = spreadsheet.getSheets()[0];
    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    let updatedCount = 0;

    for (const update of payload.updates) {
      const row = update.row;
      if (!row || row < 2 || row > sheet.getLastRow()) continue;

      // C列: ステータス
      if (update.status) {
        sheet.getRange(row, 3).setValue(update.status);
      }
      // D列: ASIN
      if (update.asin !== undefined) {
        sheet.getRange(row, 4).setValue(update.asin);
      }
      // E列: 処理日時
      sheet.getRange(row, 5).setValue(now);
      // F列: 備考
      if (update.note !== undefined) {
        sheet.getRange(row, 6).setValue(update.note);
      }

      updatedCount++;
    }

    return createJsonResponse({
      success: true,
      updatedCount: updatedCount,
      timestamp: now,
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error && error.message ? error.message : String(error),
    }, 500);
  }
}
