#!/usr/bin/env ts-node
/**
 * Generate MCP Products Script
 * data/investigations/*.json（調査結果）と data/cache/paapi/*.json（商品キャッシュ）を走査し、
 * リモートMCPサーバー（https://mcp.amazon-hikaku.com/mcp）専用の軽量インデックス
 * （static/mcp-products.json）を生成する。
 *
 * index.json には brand が含まれず、スコア根拠（score_rationale）はどの公開JSONにも
 * 含まれないため、MCPサーバーはこのファイルを優先的に取り込んで両者を補完する。
 * 仕様の正本は MCP リポジトリ（aegisfleet/amazon-hikaku-mcp）の DESIGN.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

export interface McpProductItem {
  asin: string;
  brand: string;
  score_rationale: string | null;
}

export interface GenerateMcpProductsOptions {
  investigationsDir?: string;
  cacheDir?: string;
  outputPath?: string;
}

const ASIN_FILENAME_REGEX = /^([A-Z0-9]{10})\.json$/i;

interface InvestigationJson {
  analysis?: {
    recommendation?: {
      scoreRationale?: unknown;
    };
  };
}

interface CacheShard {
  [asin: string]: {
    data?: {
      brand?: unknown;
    };
  };
}

export function extractScoreRationale(investigation: InvestigationJson): string | null {
  const rationale = investigation.analysis?.recommendation?.scoreRationale;
  if (typeof rationale !== 'string') return null;
  const trimmed = rationale.trim();
  return trimmed ? trimmed : null;
}

export function buildMcpProductItem(asin: string, investigation: InvestigationJson, brand: string): McpProductItem {
  return {
    asin: asin.toUpperCase(),
    brand,
    score_rationale: extractScoreRationale(investigation),
  };
}

const READ_CHUNK_SIZE = 256;

// 数千ファイル規模の一括読み込みでファイルディスクリプタ上限（EMFILE）に
// 抵触しないよう、同時読み込み数を制限して処理する。
export async function mapInChunks<T, R>(items: T[], chunkSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

export async function loadBrandMap(cacheDir: string): Promise<Map<string, string>> {
  const brands = new Map<string, string>();
  if (!fs.existsSync(cacheDir)) {
    logger.warn(`PAAPI cache directory not found: ${cacheDir}`);
    return brands;
  }

  const shardFiles = (await fs.promises.readdir(cacheDir)).filter((file) => file.endsWith('.json'));
  await mapInChunks(shardFiles, READ_CHUNK_SIZE, async (file) => {
    try {
      const shard = JSON.parse(await fs.promises.readFile(path.join(cacheDir, file), 'utf-8')) as CacheShard;
      for (const [asin, entry] of Object.entries(shard)) {
        const brand = entry?.data?.brand;
        if (typeof brand === 'string' && brand.trim()) {
          brands.set(asin.toUpperCase(), brand.trim());
        }
      }
    } catch {
      logger.warn(`Failed to parse PAAPI cache shard: ${file}`);
    }
  });
  return brands;
}

export async function generateMcpProducts(options: GenerateMcpProductsOptions = {}): Promise<McpProductItem[]> {
  const investigationsDir = options.investigationsDir || path.join(process.cwd(), 'data/investigations');
  const cacheDir = options.cacheDir || path.join(process.cwd(), 'data/cache/paapi');
  const outputPath = options.outputPath || path.join(process.cwd(), 'static/mcp-products.json');

  if (!fs.existsSync(investigationsDir)) {
    logger.warn(`Investigations directory not found: ${investigationsDir}`);
    return [];
  }

  const brands = await loadBrandMap(cacheDir);

  const files = (await fs.promises.readdir(investigationsDir)).filter((file) => ASIN_FILENAME_REGEX.test(file));

  const results = await mapInChunks(files, READ_CHUNK_SIZE, async (file) => {
    const asin = ASIN_FILENAME_REGEX.exec(file)?.[1];
    if (!asin) return null;
    try {
      const investigation = JSON.parse(
        await fs.promises.readFile(path.join(investigationsDir, file), 'utf-8'),
      ) as InvestigationJson;
      return buildMcpProductItem(asin, investigation, brands.get(asin.toUpperCase()) ?? '');
    } catch {
      logger.warn(`Failed to parse investigation file: ${file}`);
      return null;
    }
  });

  const items: McpProductItem[] = results.filter((item): item is McpProductItem => item !== null);

  // ASIN順で安定ソート（生成物の diff を最小化する）
  items.sort((a, b) => a.asin.localeCompare(b.asin));

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir, { recursive: true });
  }

  // コンパクトJSON（インデントなし）でファイルサイズを最小化
  const jsonContent = JSON.stringify(items);
  await fs.promises.writeFile(outputPath, jsonContent, 'utf-8');

  const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);
  logger.info(`Generated MCP products index for ${items.length} products (${sizeKb} KB) at ${outputPath}`);

  return items;
}

if (require.main === module) {
  generateMcpProducts()
    .then((items) => {
      console.log(`Successfully generated mcp-products.json with ${items.length} items.`);
    })
    .catch((err) => {
      console.error('Failed to generate mcp-products.json:', err);
      process.exit(1);
    });
}
