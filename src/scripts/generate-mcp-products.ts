#!/usr/bin/env ts-node
/**
 * Generate MCP Products Script
 * data/investigations/*.json（調査結果）と data/cache/paapi/*.json（商品キャッシュ）を走査し、
 * リモートMCPサーバー（https://mcp.amazon-hikaku.com/mcp）専用の軽量インデックス
 * （static/mcp-products.json）を生成する。
 *
 * index.json には brand が含まれず、スコア根拠（score_rationale）はどの公開JSONにも
 * 含まれないため、MCPサーバーはこのファイルを優先的に取り込んで両者を補完する。
 * あわせて、調査JSONの用途記述から抽出したギフト属性（gift_recipients /
 * gift_occasions、ギフト文脈のある商品のみ）も収録する。
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
  // ギフト文脈が検出された商品にのみ付与する（キー自体が「ギフト候補」の印）。
  gift_recipients?: string[];
  gift_occasions?: string[];
}

export interface GenerateMcpProductsOptions {
  investigationsDir?: string;
  cacheDir?: string;
  outputPath?: string;
}

const ASIN_FILENAME_REGEX = /^([A-Z0-9]{10})\.json$/i;

interface InvestigationJson {
  analysis?: {
    productName?: unknown;
    productUsage?: unknown;
    useCases?: unknown;
    userStories?: unknown;
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

// ギフト属性の抽出。
// 分類（taxonomy）は商品種別で1商品1分類のため、「プレゼント」は種別ではなく
// 用途・相手の属性として別軸で持つ。公開JSONにはギフト語がほぼ現れないので、
// 調査JSONの用途記述（useCases / userStories / productUsage / 商品名）から、
// ギフト語（プレゼント等）を含む文脈だけを対象に相手・シーンを拾う（精度優先）。
const GIFT_MARKERS = ['プレゼント', 'ギフト', '贈り物', '贈る', '祝い', 'ご褒美'];

const GIFT_OCCASION_RULES: Array<{ key: string; patterns: string[] }> = [
  { key: 'christmas', patterns: ['クリスマス'] },
  { key: 'birthday', patterns: ['誕生日', 'バースデー'] },
  { key: 'mothers_day', patterns: ['母の日'] },
  { key: 'fathers_day', patterns: ['父の日'] },
  { key: 'valentine', patterns: ['バレンタイン'] },
  { key: 'whiteday', patterns: ['ホワイトデー'] },
  { key: 'wedding', patterns: ['結婚祝い', '結婚記念日'] },
  { key: 'baby_gift', patterns: ['出産祝い'] },
  { key: 'housewarming', patterns: ['新築祝い', '引っ越し祝い', '引越し祝い'] },
  { key: 'graduation', patterns: ['卒業祝い', '入学祝い', '就職祝い'] },
  { key: 'respect_elderly', patterns: ['敬老の日'] },
  { key: 'longevity', patterns: ['還暦', '古希', '喜寿', '米寿', '長寿祝い'] },
  { key: 'anniversary', patterns: ['記念日'] },
  { key: 'midyear', patterns: ['お中元'] },
  { key: 'yearend', patterns: ['お歳暮'] },
];

// シーンから相手が自明なものは、相手も補完する（例: 母の日ギフトの相手は両親）。
// 調査文は「母の日のプレゼントとして」とシーン中心に書かれることが多く、
// 相手が明示されないケースが大半のため。
const OCCASION_RECIPIENT_IMPLICATIONS: Record<string, string[]> = {
  mothers_day: ['parents'],
  fathers_day: ['parents'],
  respect_elderly: ['grandparents'],
  longevity: ['grandparents'],
  valentine: ['partner'],
  whiteday: ['partner'],
};

const GIFT_RECIPIENT_RULES: Array<{ key: string; patterns: string[] }> = [
  { key: 'partner', patterns: ['恋人', 'パートナー', '彼女', '彼氏'] },
  { key: 'female', patterns: ['女性', '彼女', '妻', '奥さん', '奥様'] },
  { key: 'male', patterns: ['男性', '彼氏', '旦那'] },
  { key: 'kids', patterns: ['子供', '子ども', 'お子さん', 'お子様', '息子', '娘', '孫', '小学生', '中学生', '高校生'] },
  { key: 'parents', patterns: ['両親', 'お母さん', 'お父さん', '母親', '父親'] },
  { key: 'grandparents', patterns: ['祖父母', 'おばあちゃん', 'おじいちゃん', '祖母', '祖父'] },
  { key: 'friends', patterns: ['友人', '友達', 'ママ友'] },
  { key: 'colleagues', patterns: ['上司', '同僚', '先輩', '後輩'] },
  { key: 'self', patterns: ['自分へのご褒美', '自分用', 'ご褒美', '自分へのプレゼント'] },
];

function collectGiftTargetTexts(investigation: InvestigationJson): string[] {
  const analysis = investigation.analysis;
  if (!analysis) return [];
  const texts: string[] = [];
  if (typeof analysis.productName === 'string') texts.push(analysis.productName);
  for (const field of [analysis.useCases, analysis.productUsage]) {
    if (Array.isArray(field)) {
      for (const entry of field) {
        if (typeof entry === 'string') texts.push(entry);
      }
    }
  }
  if (Array.isArray(analysis.userStories)) {
    for (const story of analysis.userStories) {
      if (story && typeof story === 'object') {
        const record = story as Record<string, unknown>;
        for (const key of ['scenario', 'experience']) {
          const value = record[key];
          if (typeof value === 'string') texts.push(value);
        }
      }
    }
  }
  return texts;
}

export interface GiftAttributes {
  gift_recipients: string[];
  gift_occasions: string[];
}

// ギフト文脈が無ければ null（＝ギフト属性を付けない）。
export function extractGiftAttributes(investigation: InvestigationJson): GiftAttributes | null {
  const giftContexts = collectGiftTargetTexts(investigation).filter((text) =>
    GIFT_MARKERS.some((marker) => text.includes(marker)),
  );
  if (giftContexts.length === 0) return null;

  const joined = giftContexts.join('\n');
  const matchKeys = (rules: Array<{ key: string; patterns: string[] }>): string[] =>
    rules.filter((rule) => rule.patterns.some((pattern) => joined.includes(pattern))).map((rule) => rule.key);

  const occasions = matchKeys(GIFT_OCCASION_RULES);
  // 「結婚記念日」は wedding として拾うので、汎用の anniversary からは除外する
  const filteredOccasions =
    occasions.includes('wedding') && !/記念日/.test(joined.replace(/結婚記念日/g, ''))
      ? occasions.filter((key) => key !== 'anniversary')
      : occasions;

  const recipients = matchKeys(GIFT_RECIPIENT_RULES);
  for (const occasion of filteredOccasions) {
    for (const implied of OCCASION_RECIPIENT_IMPLICATIONS[occasion] ?? []) {
      if (!recipients.includes(implied)) recipients.push(implied);
    }
  }

  return {
    gift_recipients: recipients,
    gift_occasions: filteredOccasions,
  };
}

export function buildMcpProductItem(asin: string, investigation: InvestigationJson, brand: string): McpProductItem {
  const item: McpProductItem = {
    asin: asin.toUpperCase(),
    brand,
    score_rationale: extractScoreRationale(investigation),
  };
  const gift = extractGiftAttributes(investigation);
  if (gift) {
    item.gift_recipients = gift.gift_recipients;
    item.gift_occasions = gift.gift_occasions;
  }
  return item;
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
