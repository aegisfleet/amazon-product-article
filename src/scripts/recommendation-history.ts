/**
 * 過去の today.json 掲載ASINを git 履歴から取得するヘルパー。
 * shallow clone や git 不在などで失敗した場合は空セットへ安全にフォールバックする。
 */
import { execFileSync } from 'node:child_process';

const TODAY_JSON_PATH = 'data/recommendations/today.json';

export type GitRunner = (args: string[]) => string;

const defaultGitRunner: GitRunner = (args) =>
  execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

export function extractAsinsFromTodayJson(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as { recommendations?: Array<{ asin?: unknown }> };
    return (data.recommendations ?? [])
      .map((r) => (typeof r.asin === 'string' ? r.asin.trim().toUpperCase() : ''))
      .filter((asin) => asin.length > 0);
  } catch {
    return [];
  }
}

export function loadRecentRecommendedAsins(limit = 14, runGit: GitRunner = defaultGitRunner): Set<string> {
  const asins = new Set<string>();
  let shas: string[];
  try {
    shas = runGit(['log', '-n', String(limit), '--format=%H', '--', TODAY_JSON_PATH])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return asins;
  }

  for (const sha of shas) {
    try {
      for (const asin of extractAsinsFromTodayJson(runGit(['show', `${sha}:${TODAY_JSON_PATH}`]))) {
        asins.add(asin);
      }
    } catch {
      // shallow clone で取得できないコミットはスキップ
    }
  }
  return asins;
}
