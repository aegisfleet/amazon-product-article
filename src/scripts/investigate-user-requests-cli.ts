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
 *   MAX_INVESTIGATION_PRODUCTS - 1回の実行で取得する最大件数（デフォルト: 10）
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
  type UserRequestItem,
  type UserRequestsSessionData,
  type UserRequestUpdate,
  updateUserRequestsInGas,
} from './user-requests-helper';

const logger = Logger.getInstance();
const SESSION_FILE_PATH = path.join(process.cwd(), 'data', 'products', 'user-requests-session.json');

const RETRY_THRESHOLD_HOURS = 24;

/**
 * 処理日時から指定時間以上経過しているか判定
 */
function isSessionTimedOut(processedAt?: string): boolean {
  if (!processedAt) return true;
  const processedDate = new Date(processedAt);
  if (Number.isNaN(processedDate.getTime())) return true;
  const elapsedHours = (Date.now() - processedDate.getTime()) / (1000 * 60 * 60);
  return elapsedHours >= RETRY_THRESHOLD_HOURS;
}

type EvaluationResult =
  | { type: 'invalid'; update: UserRequestUpdate }
  | { type: 'completed'; update: UserRequestUpdate }
  | { type: 'in_progress_skip' }
  | { type: 'duplicate'; update: UserRequestUpdate }
  | { type: 'target'; asin: string; target: { row: number; url: string; asin: string; status: string; note: string } };

/**
 * 1件のユーザーリクエストを評価し、処理タイプを決定する（Cognitive Complexity低減）
 */
async function evaluateSingleRequest(req: UserRequestItem, validAsins: Set<string>): Promise<EvaluationResult> {
  const asin = await extractAsinFromUrl(req.url);
  if (!asin) {
    logger.warn(`Invalid Amazon URL or ASIN not found: ${req.url} (Row ${req.row})`);
    return {
      type: 'invalid',
      update: { row: req.row, status: '無効なURL', note: 'Amazon商品のASINを検出できませんでした。' },
    };
  }

  const alreadyInvestigated = await isProductAlreadyInvestigated(asin);
  if (alreadyInvestigated) {
    logger.info(`Product already investigated: ${asin} (Row ${req.row}) -> Updating to "完了"`);
    return {
      type: 'completed',
      update: { row: req.row, status: '完了', asin, note: '記事・調査結果を公開しました。' },
    };
  }

  if (req.status === 'セッション開始済' && !isSessionTimedOut(req.processedAt)) {
    logger.info(`Jules session still in progress for ${asin} (Row ${req.row}) -> Waiting`);
    return { type: 'in_progress_skip' };
  }

  if (validAsins.has(asin)) {
    logger.info(`Duplicate ASIN in current batch: ${asin} (Row ${req.row})`);
    return {
      type: 'duplicate',
      update: {
        row: req.row,
        status: '重複リクエスト',
        asin,
        note: '同一バッチ内の先行リクエストで調査対象になっています。',
      },
    };
  }

  return {
    type: 'target',
    asin,
    target: {
      row: req.row,
      url: req.url,
      asin,
      status: '処理中',
      note: req.status === 'セッション開始済' ? '前回の調査未完了のため再調査を開始' : 'GitHub Actionsにて調査開始',
    },
  };
}

/**
 * モード1: GASから未処理・未完了URLを取得し、調査対象ASIN（最大maxProducts件）を抽出して出力
 */
async function fetchAndProcessRequests(gasApiUrl: string, token: string, maxProducts: number): Promise<void> {
  logger.info(`Fetching unprocessed/pending user requests from GAS (Target capacity: ${maxProducts})...`);

  // 調査済みスキップが発生しても最大件数を満たせるよう、多めに取得（最大50件）
  const fetchLimit = Math.max(50, maxProducts * 10);
  const requests = await fetchUserRequestsFromGas(gasApiUrl, token, fetchLimit);

  if (requests.length === 0) {
    logger.info('No unprocessed or pending user requests found.');
    await setGitHubOutput('asins', '');
    await setGitHubOutput('products-found', 'false');
    return;
  }

  logger.info(`Fetched ${requests.length} request(s). Processing and filtering URLs...`);

  const immediateUpdates: UserRequestUpdate[] = [];
  const targetRequests: Array<{ row: number; url: string; asin: string; status: string; note?: string }> = [];
  const validAsins = new Set<string>();

  for (const req of requests) {
    const result = await evaluateSingleRequest(req, validAsins);

    if (result.type === 'target') {
      validAsins.add(result.asin);
      targetRequests.push(result.target);
      if (validAsins.size >= maxProducts) {
        logger.info(`Reached target capacity of ${maxProducts} products.`);
        break;
      }
    } else if (result.type !== 'in_progress_skip') {
      immediateUpdates.push(result.update);
    }
  }

  // 完了・無効・重複行のステータスを即時更新
  if (immediateUpdates.length > 0) {
    logger.info(`Updating ${immediateUpdates.length} completed/invalid/duplicate request(s) in GAS...`);
    try {
      await updateUserRequestsInGas(gasApiUrl, token, immediateUpdates);
    } catch (err) {
      logger.error('Failed to update request statuses in GAS:', err);
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

  const asinListStr = Array.from(validAsins).join(',');
  logger.info(`Identified ${validAsins.size} new ASIN(s) for investigation: ${asinListStr}`);

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
  const maxProducts = Number.parseInt(process.env.MAX_INVESTIGATION_PRODUCTS || '10', 10);

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
