#!/usr/bin/env ts-node
/**
 * Investigate User Requests CLI
 * Googleフォーム/GSS経由で送信されたユーザーリクエストをGAS APIから取得し、
 * 既存の調査パイプラインに渡してステータスを更新する。
 *
 * モード:
 *   1. --fetch-requests: 未処理URLを取得し、ASINを抽出して GITHUB_OUTPUT に出力
 *   2. --update-status:  調査開始後のステータス（セッション開始済等）をGASに更新
 *
 * 環境変数:
 *   GAS_API_URL                - デプロイされたGAS Web APIのURL
 *   GAS_API_TOKEN              - GAS API 認証トークン
 *   MAX_INVESTIGATION_PRODUCTS - 1回の実行で取得する最大件数（デフォルト: 5）
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';
import {
  extractAsinFromUrl,
  fetchUserRequestsFromGas,
  isProductAlreadyInvestigated,
  type UserRequestsSessionData,
  type UserRequestUpdate,
  updateUserRequestsInGas,
} from './user-requests-helper';

const logger = Logger.getInstance();
const SESSION_FILE_PATH = path.join(process.cwd(), 'data', 'products', 'user-requests-session.json');

/**
 * モード1: GASから未処理URLを取得し、ASINを抽出して出力
 */
async function fetchAndProcessRequests(gasApiUrl: string, token: string, maxProducts: number): Promise<void> {
  logger.info(`Fetching unprocessed user requests from GAS (Limit: ${maxProducts})...`);

  const requests = await fetchUserRequestsFromGas(gasApiUrl, token, maxProducts * 2);

  if (requests.length === 0) {
    logger.info('No unprocessed user requests found.');
    await setGitHubOutput('asins', '');
    await setGitHubOutput('products-found', 'false');
    return;
  }

  logger.info(`Fetched ${requests.length} unprocessed request(s). Processing URLs...`);

  const immediateUpdates: UserRequestUpdate[] = [];
  const targetRequests: Array<{ row: number; url: string; asin: string; status: string; note?: string }> = [];
  const validAsins: string[] = [];

  for (const req of requests) {
    const asin = await extractAsinFromUrl(req.url);

    if (!asin) {
      logger.warn(`Invalid Amazon URL or ASIN not found: ${req.url} (Row ${req.row})`);
      immediateUpdates.push({
        row: req.row,
        status: '無効なURL',
        note: 'Amazon商品のASINを検出できませんでした。',
      });
      continue;
    }

    // 既に調査済みかチェック
    const alreadyInvestigated = await isProductAlreadyInvestigated(asin);
    if (alreadyInvestigated) {
      logger.info(`Product already investigated: ${asin} (Row ${req.row})`);
      immediateUpdates.push({
        row: req.row,
        status: '調査済（重複）',
        asin,
        note: '既にサイト上に記事・調査結果が存在します。',
      });
      continue;
    }

    // 同一バッチ内で重複している場合
    if (validAsins.includes(asin)) {
      logger.info(`Duplicate ASIN in current batch: ${asin} (Row ${req.row})`);
      immediateUpdates.push({
        row: req.row,
        status: '重複リクエスト',
        asin,
        note: '同一バッチ内の先行リクエストで調査対象になっています。',
      });
      continue;
    }

    validAsins.push(asin);
    targetRequests.push({
      row: req.row,
      url: req.url,
      asin,
      status: '処理中',
      note: 'GitHub Actionsにて調査開始',
    });

    if (validAsins.length >= maxProducts) {
      break;
    }
  }

  // 無効・重複行のステータスを即時更新
  if (immediateUpdates.length > 0) {
    logger.info(`Updating ${immediateUpdates.length} invalid/duplicate request(s) in GAS...`);
    try {
      await updateUserRequestsInGas(gasApiUrl, token, immediateUpdates);
    } catch (err) {
      logger.error('Failed to update invalid/duplicate requests in GAS:', err);
    }
  }

  if (targetRequests.length === 0) {
    logger.info('No new valid ASINs to investigate.');
    await setGitHubOutput('asins', '');
    await setGitHubOutput('products-found', 'false');
    return;
  }

  // 今回調査対象となるリクエストをセッションファイルに保存
  const sessionData: UserRequestsSessionData = {
    fetchedAt: new Date().toISOString(),
    processedRequests: targetRequests,
  };

  await fs.mkdir(path.dirname(SESSION_FILE_PATH), { recursive: true });
  await fs.writeFile(SESSION_FILE_PATH, JSON.stringify(sessionData, null, 2), 'utf-8');

  const asinListStr = validAsins.join(',');
  logger.info(`Identified ${validAsins.length} new ASIN(s) for investigation: ${asinListStr}`);

  // GAS側のステータスを「処理中」に一括更新
  const inProgressUpdates: UserRequestUpdate[] = targetRequests.map((r) => ({
    row: r.row,
    status: '処理中',
    asin: r.asin,
    note: '商品情報取得・調査を開始しました。',
  }));
  try {
    await updateUserRequestsInGas(gasApiUrl, token, inProgressUpdates);
  } catch (err) {
    logger.error('Failed to mark requests as in-progress in GAS:', err);
  }

  await setGitHubOutput('asins', asinListStr);
  await setGitHubOutput('products-found', 'true');
}

/**
 * モード2: 調査セッション開始完了後のステータス更新
 */
async function updateCompletedStatus(gasApiUrl: string, token: string): Promise<void> {
  logger.info('Updating user requests status to "セッション開始済"...');

  let sessionData: UserRequestsSessionData;
  try {
    const raw = await fs.readFile(SESSION_FILE_PATH, 'utf-8');
    sessionData = JSON.parse(raw) as UserRequestsSessionData;
  } catch (error) {
    logger.warn('Session file not found or invalid. Skipping status update.', error);
    return;
  }

  if (!sessionData.processedRequests || sessionData.processedRequests.length === 0) {
    logger.info('No processed requests found in session.');
    return;
  }

  const updates: UserRequestUpdate[] = sessionData.processedRequests.map((req) => ({
    row: req.row,
    status: 'セッション開始済',
    asin: req.asin,
    note: 'Jules AI による調査セッションを開始しました。記事生成待ちです。',
  }));

  try {
    const count = await updateUserRequestsInGas(gasApiUrl, token, updates);
    logger.info(`Successfully updated ${count} request(s) in GAS.`);
  } catch (error) {
    logger.error('Failed to update status in GAS:', error);
  }
}

async function main(): Promise<void> {
  logger.info('Starting User Requests Investigation CLI...');

  const gasApiUrl = process.env.GAS_API_URL;
  const gasToken = process.env.GAS_API_TOKEN;
  const maxProducts = Number.parseInt(process.env.MAX_INVESTIGATION_PRODUCTS || '5', 10);

  if (!gasApiUrl || !gasToken) {
    logger.error('Missing required environment variables: GAS_API_URL and/or GAS_API_TOKEN');
    await setGitHubOutput('asins', '');
    await setGitHubOutput('products-found', 'false');
    process.exit(1);
  }

  const mode = process.argv.includes('--update-status') ? 'update-status' : 'fetch-requests';

  try {
    if (mode === 'fetch-requests') {
      await fetchAndProcessRequests(gasApiUrl, gasToken, maxProducts);
    } else {
      await updateCompletedStatus(gasApiUrl, gasToken);
    }
    process.exit(0);
  } catch (error) {
    logger.error('User requests investigation failed:', error);
    await setGitHubOutput('asins', '');
    await setGitHubOutput('products-found', 'false');
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
