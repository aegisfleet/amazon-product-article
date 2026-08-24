import axios from 'axios';

/**
 * 短縮URLやAmazon URLからASINを抽出・解決するユーティリティ
 */

// ASINは10桁の英数字
const ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

// Amazon URLからASINを抽出するパターン
const AMAZON_URL_PATH_PATTERN =
  /(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|o\/ASIN|product-reviews|d)\/([A-Z0-9]{10})(?:[/?#&]|$)/i;
const AMAZON_QUERY_PATTERN = /[?&](?:asin|pd_rd_i)=([A-Z0-9]{10})(?:[&#]|$)/i;

/**
 * 文字列がASINの形式であるか判定する
 */
export function isAsin(val: string): boolean {
  return ASIN_PATTERN.test(val.trim());
}

/**
 * Amazon URLからASINを抽出する。見つからない場合はnullを返す。
 */
export function extractAsinFromUrl(url: string): string | null {
  const pathMatch = AMAZON_URL_PATH_PATTERN.exec(url);
  if (pathMatch?.[1]) {
    return pathMatch[1].toUpperCase();
  }

  const queryMatch = AMAZON_QUERY_PATTERN.exec(url);
  if (queryMatch?.[1]) {
    return queryMatch[1].toUpperCase();
  }

  return null;
}

/**
 * 特定のメソッドでURLにアクセスし、30xリダイレクトが発生した場合はLocationヘッダのURLを返す。
 * リダイレクトが発生しなかった場合はnullを返す。
 */
async function requestRedirectLocation(method: 'HEAD' | 'GET', url: string): Promise<string | null> {
  const options = {
    maxRedirects: 0,
    validateStatus: (status: number): boolean => status >= 200 && status < 400,
    timeout: 5000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  };

  const response = method === 'HEAD' ? await axios.head(url, options) : await axios.get(url, options);

  const location: unknown = response.headers.location;
  if (response.status >= 300 && response.status < 400 && typeof location === 'string') {
    return new URL(location, url).toString();
  }
  return null;
}

/**
 * 1回分のリダイレクト解決を試みる。
 * リダイレクトされた場合は新しいURLを返す。
 * リダイレクトが発生しなかった場合は null を返す。
 * エラーが発生した場合はエラーを投げる。
 */
async function resolveSingleRedirect(url: string): Promise<string | null> {
  try {
    // まずHEADリクエストを試みる
    return await requestRedirectLocation('HEAD', url);
  } catch {
    // HEADが失敗した場合（405 Method Not Allowed など）、GETでリトライする
    try {
      return await requestRedirectLocation('GET', url);
    } catch (getError) {
      throw new Error(
        `Failed to resolve URL: ${url}. Error: ${getError instanceof Error ? getError.message : String(getError)}`,
        { cause: getError },
      );
    }
  }
}

/**
 * 短縮URLのリダイレクト先を解決する。
 * HEADリクエストを試み、失敗した場合はGETリクエストを試みる。
 */
export async function resolveUrl(url: string): Promise<string> {
  let currentUrl = url;
  const maxRedirects = 5;

  for (let i = 0; i < maxRedirects; i++) {
    // すでにURLからASINが抽出できる場合は、余計なリダイレクト追跡によるHTTPリクエスト送信（および500等のエラー）を防ぐため、即時リターンする
    if (extractAsinFromUrl(currentUrl)) {
      return currentUrl;
    }

    const nextUrl = await resolveSingleRedirect(currentUrl);
    if (nextUrl === null) {
      return currentUrl;
    }
    currentUrl = nextUrl;
  }

  if (extractAsinFromUrl(currentUrl)) {
    return currentUrl;
  }

  throw new Error(`Too many redirects (max: ${maxRedirects}) for URL: ${url}`);
}

/**
 * 入力文字列（ASIN、通常URL、短縮URL）からASINを解決して返す。
 * 解決できない場合はエラーをスローする。
 */
export async function parseInputAsin(input: string): Promise<string> {
  const trimmed = input.trim();
  if (isAsin(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // まずそのままURLからASIN抽出を試みる（通常URLの場合、リクエストを送る必要がないため高速）
    const extracted = extractAsinFromUrl(trimmed);
    if (extracted) {
      return extracted;
    }

    // 抽出できなかった場合は短縮URLとみなして解決を試みる
    try {
      const resolvedUrl = await resolveUrl(trimmed);
      const extractedFromResolved = extractAsinFromUrl(resolvedUrl);
      if (extractedFromResolved) {
        return extractedFromResolved;
      }
      throw new Error(`ASIN could not be found in the resolved URL: ${resolvedUrl}`);
    } catch (error) {
      throw new Error(
        `Failed to resolve ASIN from URL ${trimmed}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  throw new Error(`Invalid ASIN or Amazon URL format: ${input}`);
}
