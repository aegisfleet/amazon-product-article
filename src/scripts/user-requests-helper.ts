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

export interface ExistingInvestigationResult {
  exists: boolean;
  existingAsin?: string;
  matchType?: 'exact' | 'parent';
  parentAsin?: string;
}

// メモリキャッシュ用
let cachedPaapiData: Record<string, { data?: { parentAsin?: string; title?: string } }> | null = null;
let cachedParentToInvestigationMap: Map<string, string> | null = null;

/**
 * PAAPIキャッシュおよび既存調査データから、親ASINと調査済みASINのマップをロード
 */
async function getInvestigationIndex(workspaceRoot = process.cwd()): Promise<{
  paapiCache: Record<string, { data?: { parentAsin?: string; title?: string } }>;
  parentToInvestigationMap: Map<string, string>;
}> {
  if (cachedPaapiData && cachedParentToInvestigationMap) {
    return {
      paapiCache: cachedPaapiData,
      parentToInvestigationMap: cachedParentToInvestigationMap,
    };
  }

  const cachePath = path.join(workspaceRoot, 'data', 'cache', 'paapi-product-cache.json');
  let paapiCache: Record<string, { data?: { parentAsin?: string; title?: string } }> = {};
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    paapiCache = JSON.parse(raw);
  } catch {
    // 開発環境などで本番キャッシュが存在しない場合は空オブジェクト
  }

  const parentToInvMap = new Map<string, string>();
  const invDir = path.join(workspaceRoot, 'data', 'investigations');
  try {
    const files = await fs.readdir(invDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const investigatedAsin = path.basename(file, '.json');
      try {
        const invRaw = await fs.readFile(path.join(invDir, file), 'utf-8');
        const invJson = JSON.parse(invRaw);
        const parentAsin = invJson.analysis?.parentAsin || paapiCache[investigatedAsin]?.data?.parentAsin;
        if (parentAsin && !parentToInvMap.has(parentAsin)) {
          parentToInvMap.set(parentAsin, investigatedAsin);
        }
      } catch {
        // パース失敗したファイルはスキップ
      }
    }
  } catch {
    // ディレクトリが存在しない場合
  }

  cachedPaapiData = paapiCache;
  cachedParentToInvestigationMap = parentToInvMap;
  return { paapiCache, parentToInvestigationMap: parentToInvMap };
}

/**
 * 調査結果ファイルが既に存在するか、または同一親ASINの調査が既に存在するか確認
 */
export async function findExistingInvestigation(
  asin: string,
  workspaceRoot = process.cwd(),
): Promise<ExistingInvestigationResult> {
  const investigationPath = path.join(workspaceRoot, 'data', 'investigations', `${asin}.json`);
  try {
    await fs.access(investigationPath);
    return { exists: true, existingAsin: asin, matchType: 'exact' };
  } catch {
    // 直接の一致が存在しない場合、親ASINで検索
  }

  try {
    const { paapiCache, parentToInvestigationMap } = await getInvestigationIndex(workspaceRoot);
    const parentAsin = paapiCache[asin]?.data?.parentAsin;
    if (parentAsin && parentToInvestigationMap.has(parentAsin)) {
      const existingAsin = parentToInvestigationMap.get(parentAsin);
      if (existingAsin) {
        return {
          exists: true,
          existingAsin,
          matchType: 'parent',
          parentAsin,
        };
      }
    }
  } catch (err) {
    logger.warn(`Failed to check parent ASIN investigation for ${asin}:`, err);
  }

  return { exists: false };
}

/**
 * 調査結果ファイルが既に存在するか確認（ASIN単体または同一親ASIN）
 */
export async function isProductAlreadyInvestigated(asin: string, workspaceRoot = process.cwd()): Promise<boolean> {
  const result = await findExistingInvestigation(asin, workspaceRoot);
  return result.exists;
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
