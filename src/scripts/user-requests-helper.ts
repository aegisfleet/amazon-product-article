import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface UserRequestItem {
  row: number;
  timestamp: string;
  url: string;
  status: string;
  asin?: string;
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
 * AmazonのURLからASINを抽出する
 * 通常URL、短縮URL（amzn.asia, amzn.to）に対応
 */
export async function extractAsinFromUrl(inputUrl: string): Promise<string | null> {
  if (!inputUrl) return null;

  let targetUrl = inputUrl.trim();

  // 短縮URLの場合はリダイレクト先を取得
  if (targetUrl.includes('amzn.asia') || targetUrl.includes('amzn.to')) {
    try {
      const response = await axios.get(targetUrl, {
        maxRedirects: 5,
        validateStatus: (status) => status < 400 || status === 404,
      });
      const req = response.request as { res?: { responseUrl?: string } } | undefined;
      if (req?.res?.responseUrl) {
        targetUrl = req.res.responseUrl;
      }
    } catch (error) {
      logger.warn(`Failed to resolve short URL ${inputUrl}:`, error);
    }
  }

  // ASIN抽出正規表現
  // パターン例:
  // - /dp/B0XXXXXXXX
  // - /gp/product/B0XXXXXXXX
  // - /ASIN/B0XXXXXXXX
  // - /d/B0XXXXXXXX
  // - ?asin=B0XXXXXXXX
  const patterns = [
    /(?:\/dp\/|\/gp\/product\/|\/ASIN\/|\/d\/)([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
    /(?:^|\/)([A-Z0-9]{10})(?:[/?#]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = targetUrl.match(pattern);
    if (match?.[1]) {
      const candidate = match[1].toUpperCase();
      // 10桁英数字かつ先頭がBまたは英数字
      if (/^[A-Z0-9]{10}$/.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
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
