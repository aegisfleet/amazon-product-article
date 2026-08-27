import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { parseInputAsin } from '../utils/amazon';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface UserRequestItem {
  row: number;
  timestamp: string;
  url: string;
  status: string;
  asin?: string;
  processedAt?: string;
  note?: string;
}

export interface UserRequestUpdate {
  row: number;
  status: string;
  asin?: string;
  note?: string;
}

export interface UserRequestsSessionData {
  fetchedAt: string;
  processedRequests: Array<{
    row: number;
    url: string;
    asin: string;
    status: string;
    note?: string;
  }>;
}

/**
 * AmazonのURLまたはASINからASINを抽出・解決する
 * 通常URL、各種短縮URL（amzn.asia, amzn.to, link.amazon, a.co 等）に対応
 */
export async function extractAsinFromUrl(inputUrl: string): Promise<string | null> {
  if (!inputUrl || typeof inputUrl !== 'string') return null;

  try {
    return await parseInputAsin(inputUrl);
  } catch (error) {
    logger.warn(`Failed to resolve Amazon URL: ${inputUrl}`, error);
    return null;
  }
}

/**
 * 調査結果ファイルが既に存在するか確認
 */
export async function isProductAlreadyInvestigated(asin: string, workspaceRoot = process.cwd()): Promise<boolean> {
  const investigationPath = path.join(workspaceRoot, 'data', 'investigations', `${asin}.json`);
  try {
    await fs.access(investigationPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * GAS Web API から未処理リクエスト一覧を取得
 */
export async function fetchUserRequestsFromGas(
  gasApiUrl: string,
  token: string,
  limit = 10,
): Promise<UserRequestItem[]> {
  const url = gasApiUrl.trim();
  const response = await axios.get<{ success: boolean; requests?: UserRequestItem[]; error?: string }>(url, {
    params: { token: token.trim(), limit },
    timeout: 20000,
    maxRedirects: 10,
  });

  if (!response.data?.success) {
    throw new Error(`GAS API error: ${response.data?.error || 'Unknown error'}`);
  }

  return response.data.requests || [];
}

/**
 * GAS Web API にステータス更新をPOST送信
 */
export async function updateUserRequestsInGas(
  gasApiUrl: string,
  token: string,
  updates: UserRequestUpdate[],
): Promise<number> {
  if (updates.length === 0) return 0;

  const url = gasApiUrl.trim();
  const response = await axios.post<{ success: boolean; updatedCount?: number; error?: string }>(
    url,
    { token: token.trim(), updates },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
      maxRedirects: 10,
    },
  );

  if (!response.data?.success) {
    throw new Error(`GAS API update error: ${response.data?.error || 'Unknown error'}`);
  }

  return response.data.updatedCount || 0;
}
