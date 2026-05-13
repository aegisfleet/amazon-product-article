/**
 * Amazon Creators API Client
 * Handles OAuth 2.0 authentication, rate limiting, and product data retrieval
 * Updated for Creators API (v1)
 */

import crypto from 'node:crypto';
import { URLSearchParams } from 'node:url';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import type {
  CreatorsAPICredentials,
  CreatorsAPIItem,
  CreatorsAPIRequest,
  CreatorsAPIResponse,
  RateLimitConfig,
} from '../types/CreatorsAPITypes';
import type { Product, ProductDetail, ProductSearchParams, ProductSearchResult } from '../types/Product';
import { CategoryNormalizer } from '../utils/CategoryNormalizer';
import { Logger } from '../utils/Logger';

type ProductInfoType = NonNullable<NonNullable<CreatorsAPIItem['itemInfo']>['productInfo']>;
type ItemDimensionsType = NonNullable<ProductInfoType['itemDimensions']>;
type TechnicalInfoType = NonNullable<NonNullable<CreatorsAPIItem['itemInfo']>['technicalInfo']>;
type ManufactureInfoType = NonNullable<NonNullable<CreatorsAPIItem['itemInfo']>['manufactureInfo']>;

interface CreatorsAPIErrorData {
  errors?: Array<{ code: string; message: string }>;
  message?: string; // Some errors return message directly
  __type?: string;
  type?: string;
  resourceId?: string;
  [key: string]: unknown;
}

export class CreatorsAPIClient {
  private readonly logger = Logger.getInstance();
  private credentials?: CreatorsAPICredentials;
  private readonly httpClient: AxiosInstance;
  private readonly rateLimitConfig: RateLimitConfig;
  private lastRequestTime = 0;
  private readonly requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  // OAuth Token Management
  private accessToken: string | undefined;
  private tokenExpiresAt = 0;
  private readonly OAUTH_TOKEN_URL = 'https://api.amazon.co.jp/auth/o2/token';
  private readonly API_BASE_URL = 'https://creatorsapi.amazon';
  private readonly MARKETPLACE = 'www.amazon.co.jp';
  private readonly CREDENTIAL_VERSION = '3.3';

  constructor() {
    // Rate limit configuration - can be adjusted via environment variables
    // Creators API Japan: 1 request per second, burst of 5
    this.rateLimitConfig = {
      requestsPerSecond: Number.parseFloat(process.env.CREATORS_API_REQUESTS_PER_SECOND || '0.8'), // Conservative: 0.8 req/sec
      burstLimit: Number.parseInt(process.env.CREATORS_API_BURST_LIMIT || '5', 10),
      retryDelay: Number.parseInt(process.env.CREATORS_API_RETRY_DELAY || '1000', 10),
      maxRetries: Number.parseInt(process.env.CREATORS_API_MAX_RETRIES || '5', 10),
    };

    this.logger.debug(
      `Rate limit config: ${this.rateLimitConfig.requestsPerSecond} req/sec, max ${this.rateLimitConfig.maxRetries} retries`,
    );

    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'amazon-product-research-system/1.0.0',
      },
    });
  }

  /**
   * Authenticate with Amazon Creators API (Japan marketplace)
   * Note: applicationId is optional for OAuth flow but kept for compatibility
   */
  authenticate(applicationId: string, credentialId: string, credentialSecret: string, partnerTag: string): void {
    if (!credentialId || !credentialSecret || !partnerTag) {
      throw new Error('Missing required Creators API credentials');
    }

    this.credentials = {
      applicationId,
      credentialId,
      credentialSecret,
      partnerTag,
    };

    this.logger.info('Creators API client authenticated successfully (Japan marketplace)');
  }

  /**
   * Get OAuth 2.0 Access Token
   */
  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Client not authenticated');
    }

    // Return cached token if valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    this.logger.debug('Refreshing OAuth access token...');

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('scope', 'creatorsapi::default');
      params.append('client_id', this.credentials.credentialId);
      params.append('client_secret', this.credentials.credentialSecret);

      const response = await axios.post<{ access_token: string; expires_in: number }>(
        this.OAUTH_TOKEN_URL,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        },
      );

      this.accessToken = response.data.access_token;
      // expires_in is in seconds
      this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

      this.logger.debug(`OAuth token obtained, expires in ${response.data.expires_in}s`);

      return this.accessToken;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get OAuth token: ${msg}`);
      throw new Error(`Authentication failed: ${msg}`, { cause: error });
    }
  }

  /**
   * Search for products by category and keywords
   */
  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    this.validateAuthentication();

    const allProducts: Product[] = [];
    const maxResultsPerPage = 10;
    const totalPagesNeeded = Math.ceil(params.maxResults / maxResultsPerPage);
    let totalResultCount = 0;

    for (let page = 1; page <= totalPagesNeeded; page++) {
      const remainingResults = params.maxResults - allProducts.length;
      const itemCount = Math.min(remainingResults, maxResultsPerPage);

      const request = this.buildSearchRequest(params, page, itemCount);

      try {
        const response = await this.makeRequest(request);
        const products = this.parseSearchResponse(response);
        allProducts.push(...products);

        const pageTotalResultCount = response.searchResult?.totalResultCount || 0;
        if (page === 1) {
          totalResultCount = pageTotalResultCount;
        }

        this.logger.debug(`Page ${page}/${totalPagesNeeded}: fetched ${products.length} products`);

        const totalPages = Math.ceil(pageTotalResultCount / maxResultsPerPage);
        if (page >= totalPages) break;

        if (page < totalPagesNeeded) {
          await this.sleep(1100);
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch page ${page}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }

    return {
      products: allProducts,
      totalResults: totalResultCount,
      searchParams: params,
      timestamp: new Date(),
    };
  }

  private buildSearchRequest(params: ProductSearchParams, page: number, itemCount: number): CreatorsAPIRequest {
    const resources = [
      'images.primary.large',
      'images.primary.medium',
      'images.primary.small',
      'images.variants.large',
      'images.variants.medium',
      'images.variants.small',
      'itemInfo.title',
      'itemInfo.features',
      'itemInfo.productInfo',
      'offersV2.listings.price',
      'offersV2.listings.availability',
      'offersV2.listings.loyaltyPoints',
      'offersV2.listings.dealDetails',
      'browseNodeInfo.browseNodes',
    ];

    const request: CreatorsAPIRequest = {
      operation: 'searchItems',
      partnerTag: this.credentials!.partnerTag,
      marketplace: this.MARKETPLACE,
      resources: resources,
      keywords: params.keywords.join(' '),
      searchIndex:
        params.searchIndex ||
        (params.category === 'All'
          ? this.inferIndexFromKeywords(params.keywords)
          : this.mapCategoryToSearchIndex(params.category)),
      itemCount: itemCount,
      itemPage: page,
      sortBy: this.mapSortBy(params.sortBy || 'featured'),
    };

    if (params.minPrice) {
      request.minPrice = params.minPrice * 100;
    }
    if (params.maxPrice) {
      request.maxPrice = params.maxPrice * 100;
    }

    return request;
  }

  /**
   * Get detailed product information by ASIN
   */
  async getProductDetails(asin: string): Promise<ProductDetail> {
    this.validateAuthentication();

    const request: CreatorsAPIRequest = {
      operation: 'getItems',
      partnerTag: this.credentials!.partnerTag,
      marketplace: this.MARKETPLACE,
      itemIds: [asin],
      itemIdType: 'ASIN',
      resources: [
        'images.primary.small',
        'images.primary.medium',
        'images.primary.large',
        'images.variants.small',
        'images.variants.medium',
        'images.variants.large',
        'itemInfo.title',
        'itemInfo.features',
        'itemInfo.productInfo',
        'itemInfo.byLineInfo',
        'itemInfo.technicalInfo',
        'offersV2.listings.price',
        'offersV2.listings.isBuyBoxWinner',
        'offersV2.listings.merchantInfo',
        'offersV2.listings.availability',
        'offersV2.listings.loyaltyPoints',
        'offersV2.listings.dealDetails',
        'browseNodeInfo.browseNodes',
      ],
    };

    const response = await this.makeRequest(request);

    if (!response.itemsResult?.items?.[0]) {
      throw new Error(`Product with ASIN ${asin} not found`);
    }

    return this.parseProductDetail(response.itemsResult.items[0]);
  }

  /**
   * Fetch details for multiple ASINs (max 10)
   */
  async getMultipleProductDetails(asins: string[]): Promise<{
    results: Map<string, ProductDetail>;
    permanentFailures: Set<string>;
  }> {
    this.validateAuthentication();

    const result = new Map<string, ProductDetail>();
    const permanentFailures = new Set<string>();

    if (asins.length === 0) {
      return { results: result, permanentFailures };
    }

    const validAsins = asins.filter((asin) => /^[A-Z0-9]{10}$/.test(asin)).slice(0, 10);

    if (validAsins.length === 0) {
      return { results: result, permanentFailures };
    }

    const request: CreatorsAPIRequest = {
      operation: 'getItems',
      partnerTag: this.credentials!.partnerTag,
      partnerType: 'Associates',
      marketplace: this.MARKETPLACE,
      itemIds: validAsins,
      itemIdType: 'ASIN',
      resources: [
        'images.primary.large',
        'images.primary.medium',
        'images.variants.large',
        'itemInfo.title',
        'itemInfo.features',
        'itemInfo.manufactureInfo',
        'itemInfo.productInfo',
        'itemInfo.byLineInfo',
        'itemInfo.contentInfo',
        'itemInfo.technicalInfo',
        'itemInfo.externalIds',
        'offersV2.listings.price',
        'offersV2.listings.isBuyBoxWinner',
        'offersV2.listings.merchantInfo',
        'offersV2.listings.availability',
        'offersV2.listings.loyaltyPoints',
        'offersV2.listings.dealDetails',
        'customerReviews.count',
        'customerReviews.starRating',
        'browseNodeInfo.browseNodes',
        'parentASIN',
      ],
    };

    let batchFailed = false;

    try {
      const response = await this.makeRequest(request);

      if (response.itemsResult?.items) {
        this.parseBatchResults(response.itemsResult.items, result);
      }

      const foundAsins = new Set(result.keys());
      const notFoundAsins = validAsins.filter((asin) => !foundAsins.has(asin));
      if (notFoundAsins.length > 0) {
        this.logger.warn(`The following ASINs were not found: ${notFoundAsins.join(', ')}`);
      }
    } catch (error: unknown) {
      batchFailed = await this.handleBatchError(error, request, validAsins, result, permanentFailures);
    }

    if (batchFailed) {
      await this.fetchIndividualAsinsFallback(validAsins, result, permanentFailures);
    }

    return { results: result, permanentFailures };
  }

  private parseBatchResults(items: CreatorsAPIItem[], result: Map<string, ProductDetail>): void {
    for (const item of items) {
      try {
        const detail = this.parseProductDetail(item);
        result.set(item.asin, detail);
      } catch (error) {
        this.logger.warn(
          `Failed to parse product detail for ASIN ${item.asin}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async retryBatchWithoutAsin(
    invalidAsin: string,
    request: CreatorsAPIRequest,
    validAsins: string[],
    result: Map<string, ProductDetail>,
  ): Promise<boolean> {
    const remainingAsins = validAsins.filter((asin) => asin !== invalidAsin);
    if (remainingAsins.length === 0) return false;

    this.logger.info(`Retrying batch without problematic ASIN ${invalidAsin}`);
    try {
      const retryRequest = { ...request, itemIds: remainingAsins };
      const retryResponse = await this.makeRequest(retryRequest);
      if (retryResponse.itemsResult?.items) {
        this.parseBatchResults(retryResponse.itemsResult.items, result);
      }
      return true; // Successfully recovered
    } catch (retryError) {
      this.logger.warn(
        `Retry batch also failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
      );
      return false; // Failed again
    }
  }

  private async handleBatchError(
    error: unknown,
    request: CreatorsAPIRequest,
    validAsins: string[],
    result: Map<string, ProductDetail>,
    permanentFailures: Set<string>,
  ): Promise<boolean> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Batch request failed: ${errorMessage}`);
    let recovered = false;

    if (axios.isAxiosError(error) && error.response?.data) {
      this.logger.error(`API Error Response: ${JSON.stringify(error.response.data, null, 2)}`);

      // Check if error indicates a specific ASIN is invalid
      const errorData = error.response.data as CreatorsAPIErrorData;
      if (errorData.resourceId && errorData.type === 'ResourceNotFoundException') {
        const invalidAsin = errorData.resourceId;
        permanentFailures.add(invalidAsin);
        this.logger.warn(`ASIN ${invalidAsin} marked as permanent failure (ResourceNotFoundException)`);
        recovered = await this.retryBatchWithoutAsin(invalidAsin, request, validAsins, result);
      } else if (errorMessage.includes('InvalidParameterValue')) {
        const invalidAsinMatch = /ItemIds ([A-Z0-9]{10})/.exec(errorMessage);
        if (invalidAsinMatch?.[1]) {
          const invalidAsin = invalidAsinMatch[1];
          permanentFailures.add(invalidAsin);
          this.logger.warn(`ASIN ${invalidAsin} marked as permanent failure (InvalidParameterValue)`);
          recovered = await this.retryBatchWithoutAsin(invalidAsin, request, validAsins, result);
        }
      }
    }
    return !recovered; // batchFailed = true if not recovered
  }

  private async fetchIndividualAsinsFallback(
    validAsins: string[],
    result: Map<string, ProductDetail>,
    permanentFailures: Set<string>,
  ): Promise<void> {
    this.logger.info(`Batch request failed, falling back to individual requests for ${validAsins.length} ASINs`);
    for (const asin of validAsins) {
      try {
        this.logger.debug(`Fetching individual ASIN: ${asin}`);
        const detail = await this.getProductDetails(asin);
        result.set(asin, detail);
        this.logger.debug(`Successfully fetched ${asin}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if it's a permanent failure
        if (
          errorMessage.includes('InvalidParameterValue') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('404') ||
          errorMessage.includes('ResourceNotFoundException')
        ) {
          permanentFailures.add(asin);
          this.logger.warn(`ASIN ${asin} marked as permanent failure: ${errorMessage}`);
        } else {
          // Temporary failure - don't add to results or permanentFailures
          this.logger.warn(`ASIN ${asin} temporary failure: ${errorMessage}`);
        }
      }
      await this.sleep(1200);
    }
  }

  // ... handleRateLimit logic ...
  async handleRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.rateLimitConfig.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      await this.sleep(delay);
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Make authenticated request to Creators API
   */
  private async makeRequest(request: CreatorsAPIRequest): Promise<CreatorsAPIResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await this.handleRateLimit();

          const token = await this.getAccessToken();

          const endpoint = request.operation === 'getItems' ? '/catalog/v1/getItems' : '/catalog/v1/searchItems';
          const url = `${this.API_BASE_URL}${endpoint}`;

          // Remove internal field 'operation' from payload
          const { operation: _operation, ...payload } = request;

          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-marketplace': this.MARKETPLACE,
            'x-amz-application-id': this.credentials?.applicationId, // Include if available
          };

          let lastError: Error | null = null;

          for (let attempt = 1; attempt <= this.rateLimitConfig.maxRetries; attempt++) {
            try {
              this.logger.debug(`Making API request (attempt ${attempt})`);
              const response: AxiosResponse<CreatorsAPIResponse> = await this.httpClient.post(url, payload, {
                headers,
              });

              this.checkResponseErrors(response);

              return resolve(response.data);
            } catch (error: unknown) {
              lastError = error as Error;
              const shouldRetry = await this.handleApiError(error, attempt, url, headers);
              if (!shouldRetry) break;
            }
          }
          reject(lastError || new Error('Request failed'));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error), { cause: error }));
        }
      });
      void this.processQueue();
    });
  }

  private async handleApiError(
    error: unknown,
    attempt: number,
    url: string,
    headers: Record<string, string | undefined>,
  ): Promise<boolean> {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;

      if (statusCode === 401) {
        this.accessToken = undefined;
      }

      const errorData = error.response?.data as CreatorsAPIErrorData;
      this.logger.error(`API Error Response (${statusCode}): ${JSON.stringify(errorData, null, 2)}`);

      if (statusCode === 400) {
        this.logger.error(`Request URL: ${url}`);
        this.logger.error(`Request Headers: ${JSON.stringify({ ...headers, Authorization: '[REDACTED]' }, null, 2)}`);
      }

      if (statusCode === 429) {
        return this.handleRateLimitError(error, attempt);
      }
    }

    const lastError = error as Error;

    // Non-retryable errors
    if (
      lastError &&
      (lastError.message.includes('400') ||
        lastError.message.includes('404') ||
        lastError.message.includes('InvalidParameterValue') ||
        lastError.message.includes('ResourceNotFoundException') ||
        lastError.message.includes('not found'))
    ) {
      return false; // Break loop
    }

    if (attempt < this.rateLimitConfig.maxRetries) {
      const delay = 1000 * 2 ** (attempt - 1);
      this.logger.debug(`Retrying after ${delay}ms (attempt ${attempt}/${this.rateLimitConfig.maxRetries})`);
      await this.sleep(delay);

      if (lastError && axios.isAxiosError(lastError) && lastError.response?.status === 401) {
        this.logger.info('Refreshing access token after 401 error');
        const newToken = await this.getAccessToken();
        headers.Authorization = `Bearer ${newToken}`;
      }
      return true; // Continue loop
    }
    return false; // Break loop
  }

  private async handleRateLimitError(error: unknown, attempt: number): Promise<boolean> {
    if (!axios.isAxiosError(error)) return false;

    const retryAfter = error.response?.headers['retry-after'] as string | undefined;
    let waitTime: number;

    if (retryAfter && typeof retryAfter === 'string') {
      waitTime = Number.parseInt(retryAfter, 10) * 1000;
    } else {
      const baseDelay = 2000;
      const exponentialDelay = baseDelay * 2 ** (attempt - 1);
      const jitter = crypto.randomInt(0, 1000);
      waitTime = Math.min(exponentialDelay + jitter, 60000);
    }

    this.logger.warn(
      `Rate limited (429), waiting ${Math.round(waitTime / 1000)}s before retry (attempt ${attempt}/${this.rateLimitConfig.maxRetries})`,
    );

    if (attempt < this.rateLimitConfig.maxRetries) {
      await this.sleep(waitTime);
      return true; // Continue loop
    }
    return false; // Break loop
  }

  private checkResponseErrors(response: AxiosResponse<CreatorsAPIResponse>): void {
    if (response.data.errors && response.data.errors.length > 0) {
      const firstError = response.data.errors[0];
      if (firstError) {
        throw new Error(`API Error: ${firstError.code} - ${firstError.message}`);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    this.isProcessingQueue = true;
    while (this.requestQueue.length > 0) {
      const req = this.requestQueue.shift();
      if (req) await req();
    }
    this.isProcessingQueue = false;
  }

  // === Parsers updated for camelCase ===

  private parseSearchResponse(response: CreatorsAPIResponse): Product[] {
    if (!response.searchResult?.items) return [];

    // Filter logic... (Mobile apps, etc.) simplified for now
    return response.searchResult.items.map((item) => this.parseProduct(item));
  }

  private parseProduct(item: CreatorsAPIItem): Product {
    const price = this.extractPrice(item);
    const images = this.extractImages(item);
    const listing = item.offersV2?.listings?.[0];
    const { category, categoryInfo } = this.extractCategoryInfo(item);

    const product: Product = {
      asin: item.asin,
      title: item.itemInfo?.title?.displayValue || '',
      category: category,
      categoryInfo: categoryInfo,
      detailPageUrl: item.detailPageURL,
      price,
      images,
      specifications: this.extractSpecifications(item),
      rating: {
        average: item.customerReviews?.starRating || 0,
        count: item.customerReviews?.count || 0,
      },
      availability: listing?.availability?.message,
      isAmazonDirect: listing?.merchantInfo?.name === 'Amazon.co.jp',
      brand: item.itemInfo?.byLineInfo?.brand?.displayValue || item.itemInfo?.manufactureInfo?.brand?.displayValue,
      loyaltyPoints: listing?.loyaltyPoints?.points ?? undefined,
      dealBadge: listing?.dealDetails?.dealBadge,
      savingsPercentage: listing?.price?.savings?.percentage ?? undefined,
    };

    if (item.parentASIN) product.parentAsin = item.parentASIN;

    return product;
  }

  private parseProductDetail(item: CreatorsAPIItem): ProductDetail {
    const product = this.parseProduct(item);
    const itemInfo = item.itemInfo;
    return {
      ...product,
      features: itemInfo?.features?.displayValues || [],
      manufacturer: itemInfo?.byLineInfo?.manufacturer?.displayValue,
      model: itemInfo?.manufactureInfo?.model?.displayValue,
      releaseDate:
        itemInfo?.productInfo?.releaseDate?.displayValue || itemInfo?.contentInfo?.publicationDate?.displayValue,
    };
  }

  private extractPrice(item: CreatorsAPIItem): Product['price'] {
    const listing = item.offersV2?.listings?.[0];
    const summary = item.offersV2?.summaries?.[0];

    if (listing?.price?.money) {
      return {
        amount: listing.price.money.amount,
        currency: listing.price.money.currency,
        formatted: listing.price.money.displayAmount,
      };
    }
    if (summary?.lowestPrice?.money) {
      return {
        amount: summary.lowestPrice.money.amount,
        currency: summary.lowestPrice.money.currency,
        formatted: summary.lowestPrice.money.displayAmount,
      };
    }
    return { amount: 0, currency: 'JPY', formatted: '価格情報なし' };
  }

  private extractImages(item: CreatorsAPIItem): Product['images'] {
    const primary = item.images?.primary?.large?.url || item.images?.primary?.medium?.url || '';
    const thumbnails = item.images?.variants?.map((v) => v.large?.url).filter((u): u is string => !!u) || [];
    return { primary, thumbnails };
  }

  // Helpers
  private validateAuthentication(): void {
    if (!this.credentials) throw new Error('Not authenticated');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Mappers
  private mapCategoryToSearchIndex(cat: string): string {
    // Map internal category names to Creators API SearchIndex
    const mapping: Record<string, string> = {
      electronics: 'Electronics',
      computers: 'Computers',
      kitchen: 'HomeAndKitchen',
      home: 'HomeAndKitchen',
      appliances: 'Appliances',
      beauty: 'Beauty',
      fashion: 'Fashion',
      health: 'HealthPersonalCare',
      grocery: 'GroceryAndGourmetFood',
      toys: 'Toys',
      games: 'VideoGames',
      music: 'MusicalInstruments',
      books: 'Books',
      automotive: 'Automotive',
      diy: 'ToolsAndHomeImprovement',
    };

    // Check strict match first
    if (mapping[cat]) return mapping[cat];

    // Partial match fallback
    for (const [key, value] of Object.entries(mapping)) {
      if (cat.includes(key)) return value;
    }

    return 'All';
  }

  private inferIndexFromKeywords(_kw: string[]): string {
    return 'All';
  }

  private mapSortBy(sort: string): string {
    const mapping: Record<string, string> = {
      relevance: 'Relevance',
      price_low: 'Price:LowToHigh',
      price_high: 'Price:HighToLow',
      newest: 'Date:NewestToOldest',
      featured: 'Featured',
    };
    return mapping[sort] || 'Relevance';
  }

  // Category Parsing Logic
  private extractCategoryInfo(item: CreatorsAPIItem): {
    category: string;
    categoryInfo: { main: string; sub: string; browseNodeId?: string };
  } {
    const nodes = item.browseNodeInfo?.browseNodes || [];
    const normalized = CategoryNormalizer.selectBestCategory(nodes);
    const categoryInfo: { main: string; sub: string; browseNodeId?: string } = {
      main: normalized.main,
      sub: normalized.sub,
    };

    if (normalized.browseNodeId) {
      categoryInfo.browseNodeId = normalized.browseNodeId;
    }

    return {
      category: normalized.main,
      categoryInfo,
    };
  }

  private extractSpecifications(item: CreatorsAPIItem): Record<string, string> {
    const specs: Record<string, string> = {};
    const itemInfo = item.itemInfo;
    if (!itemInfo) return specs;

    this.extractProductInfoSpecs(itemInfo.productInfo, specs);
    this.extractTechnicalInfoSpecs(itemInfo.technicalInfo, specs);
    this.extractManufacturerInfoSpecs(itemInfo.manufactureInfo, specs);

    return specs;
  }

  private extractProductInfoSpecs(pInfo: ProductInfoType | undefined, specs: Record<string, string>): void {
    if (!pInfo) return;

    if (pInfo.color?.displayValue) specs['color'] = pInfo.color.displayValue;
    if (pInfo.size?.displayValue) specs['size'] = pInfo.size.displayValue;
    if (pInfo.unitCount?.displayValue) specs['unitCount'] = String(pInfo.unitCount.displayValue);

    this.extractDimensionSpecs(pInfo.itemDimensions, specs);
    this.extractArbitraryProductSpecs(pInfo, specs);
  }

  private extractDimensionSpecs(dims: ItemDimensionsType | undefined, specs: Record<string, string>): void {
    if (!dims) return;
    if (dims.height) specs['height'] = `${dims.height.displayValue} ${dims.height.unit}`;
    if (dims.width) specs['width'] = `${dims.width.displayValue} ${dims.width.unit}`;
    if (dims.length) specs['length'] = `${dims.length.displayValue} ${dims.length.unit}`;
    if (dims.weight) specs['weight'] = `${dims.weight.displayValue} ${dims.weight.unit}`;
  }

  private extractArbitraryProductSpecs(pInfo: ProductInfoType | undefined, specs: Record<string, string>): void {
    if (!pInfo) return;
    const knownKeys = new Set(['color', 'size', 'unitCount', 'itemDimensions']);
    for (const [key, value] of Object.entries(pInfo)) {
      if (knownKeys.has(key)) continue;
      if (value !== null && typeof value === 'object' && 'displayValue' in value) {
        specs[key] = String((value as Record<string, unknown>).displayValue);
      }
    }
  }

  private extractTechnicalInfoSpecs(tInfo: TechnicalInfoType | undefined, specs: Record<string, string>): void {
    if (!tInfo) return;

    for (const [key, value] of Object.entries(tInfo)) {
      if (value !== null && typeof value === 'object') {
        if ('displayValue' in value) {
          specs[key] = String((value as Record<string, unknown>).displayValue);
        } else if ('displayValues' in value && Array.isArray((value as Record<string, unknown>).displayValues)) {
          specs[key] = (value as { displayValues: unknown[] }).displayValues.join(', ');
        }
      }
    }
  }

  private extractManufacturerInfoSpecs(mInfo: ManufactureInfoType | undefined, specs: Record<string, string>): void {
    if (!mInfo) return;
    if (mInfo.brand?.displayValue) specs['brand'] = mInfo.brand.displayValue;
    if (mInfo.model?.displayValue) specs['model'] = mInfo.model.displayValue;
  }
}
