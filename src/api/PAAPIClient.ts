/**
 * Amazon Product Advertising API v5 Client
 * Handles authentication, rate limiting, and product data retrieval
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import crypto from 'crypto';
import {
  PAAPICredentials,
  PAAPIItem,
  PAAPIRequest,
  PAAPIResponse,
  RateLimitConfig
} from '../types/PAAPITypes';
import { CategoryInfo, Product, ProductDetail, ProductSearchParams, ProductSearchResult } from '../types/Product';
import { Logger } from '../utils/Logger';

interface PAAPIErrorData {
  Errors?: Array<{ Code: string; Message: string }>;
  __type?: string;
  [key: string]: unknown;
}

export class PAAPIClient {
  private logger = Logger.getInstance();
  private credentials?: PAAPICredentials;
  private httpClient: AxiosInstance;
  private rateLimitConfig: RateLimitConfig;
  private lastRequestTime = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor() {
    this.rateLimitConfig = {
      requestsPerSecond: 1, // PA-API v5 limit
      burstLimit: 5,
      retryDelay: 1000,
      maxRetries: 3
    };

    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'amazon-product-research-system/1.0.0'
      }
    });
  }

  /**
   * Authenticate with Amazon PA-API v5 (Japan marketplace)
   */
  authenticate(accessKey: string, secretKey: string, partnerTag: string): void {
    if (!accessKey || !secretKey || !partnerTag) {
      throw new Error('Missing required PA-API credentials');
    }

    this.credentials = {
      accessKey,
      secretKey,
      partnerTag,
      region: 'us-west-2' // Fixed: Japan uses us-west-2
    };

    this.logger.info('PA-API client authenticated successfully (Japan marketplace)');
  }

  /**
   * Search for products by category and keywords
   */
  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    this.validateAuthentication();

    const request: PAAPIRequest = {
      Operation: 'SearchItems',
      PartnerTag: this.credentials!.partnerTag,
      PartnerType: 'Associates',
      Marketplace: this.getMarketplace(),
      Keywords: params.keywords.join(' '),
      SearchIndex: this.mapCategoryToSearchIndex(params.category),
      ItemCount: Math.min(params.maxResults, 10), // PA-API limit
      Resources: [
        'Images.Primary.Large',
        'Images.Primary.Medium',
        'Images.Variants.Large',
        'ItemInfo.Title',
        'ItemInfo.Features',
        'ItemInfo.ManufactureInfo',
        'ItemInfo.ProductInfo',
        'Offers.Listings.Price',
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice',
        'ParentASIN'
      ]
    };

    if (params.minPrice) {
      request.MinPrice = params.minPrice * 100; // Convert to cents
    }
    if (params.maxPrice) {
      request.MaxPrice = params.maxPrice * 100; // Convert to cents
    }
    if (params.sortBy) {
      request.SortBy = this.mapSortBy(params.sortBy);
    }

    const response = await this.makeRequest(request);
    const products = this.parseSearchResponse(response);

    return {
      products,
      totalResults: response.SearchResult?.TotalResultCount || 0,
      searchParams: params,
      timestamp: new Date()
    };
  }

  /**
   * Get detailed product information by ASIN
   */
  async getProductDetails(asin: string): Promise<ProductDetail> {
    this.validateAuthentication();

    const request: PAAPIRequest = {
      Operation: 'GetItems',
      PartnerTag: this.credentials!.partnerTag,
      PartnerType: 'Associates',
      Marketplace: this.getMarketplace(),
      ItemIds: [asin],
      Resources: [
        'Images.Primary.Large',
        'Images.Primary.Medium',
        'Images.Variants.Large',
        'ItemInfo.Title',
        'ItemInfo.Features',
        'ItemInfo.ManufactureInfo',
        'ItemInfo.ProductInfo',
        'ItemInfo.ByLineInfo',
        'ItemInfo.ContentInfo',
        'ItemInfo.TechnicalInfo',
        'ItemInfo.ExternalIds',
        'Offers.Listings.Price',
        'Offers.Listings.Availability.Message',
        'Offers.Listings.DeliveryInfo.IsPrimeEligible',
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice',
        'BrowseNodeInfo.BrowseNodes',
        'ParentASIN'
      ]
    };

    const response = await this.makeRequest(request);

    if (!response.ItemsResult?.Items?.[0]) {
      throw new Error(`Product with ASIN ${asin} not found`);
    }

    return this.parseProductDetail(response.ItemsResult.Items[0]);
  }

  /**
   * Get detailed product information for multiple ASINs (up to 10)
   * Returns a Map where keys are ASINs and values are ProductDetail objects
   * Failed lookups are silently omitted from the result
   * If batch request fails (e.g., due to invalid ASINs), falls back to individual requests
   */
  async getMultipleProductDetails(asins: string[]): Promise<Map<string, ProductDetail>> {
    this.validateAuthentication();

    const result = new Map<string, ProductDetail>();

    if (asins.length === 0) {
      return result;
    }

    // PA-API allows max 10 items per request
    const validAsins = asins.filter(asin => /^[A-Z0-9]{10}$/.test(asin)).slice(0, 10);

    if (validAsins.length === 0) {
      this.logger.warn('No valid ASINs provided for batch lookup');
      return result;
    }

    const request: PAAPIRequest = {
      Operation: 'GetItems',
      PartnerTag: this.credentials!.partnerTag,
      PartnerType: 'Associates',
      Marketplace: this.getMarketplace(),
      ItemIds: validAsins,
      Resources: [
        'Images.Primary.Large',
        'Images.Primary.Medium',
        'Images.Variants.Large',
        'ItemInfo.Title',
        'ItemInfo.Features',
        'ItemInfo.ManufactureInfo',
        'ItemInfo.ProductInfo',
        'ItemInfo.ByLineInfo',
        'ItemInfo.ContentInfo',
        'ItemInfo.TechnicalInfo',
        'ItemInfo.ExternalIds',
        'Offers.Listings.Price',
        'Offers.Listings.Availability.Message',
        'Offers.Listings.DeliveryInfo.IsPrimeEligible',
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice',
        'BrowseNodeInfo.BrowseNodes',
        'ParentASIN'
      ]
    };

    let batchFailed = false;

    try {
      const response = await this.makeRequest(request);

      if (response.ItemsResult?.Items) {
        for (const item of response.ItemsResult.Items) {
          try {
            const detail = this.parseProductDetail(item);
            result.set(item.ASIN, detail);
          } catch (error) {
            this.logger.warn(`Failed to parse product detail for ASIN ${item.ASIN}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      this.logger.info(`Successfully fetched ${result.size}/${validAsins.length} competitor product details`);

      // Log which ASINs were not found
      const foundAsins = new Set(result.keys());
      const notFoundAsins = validAsins.filter(asin => !foundAsins.has(asin));
      if (notFoundAsins.length > 0) {
        this.logger.warn(`The following ASINs were not found via PA-API: ${notFoundAsins.join(', ')}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Batch request failed: ${errorMessage}`);

      // Check if the error is due to invalid ASIN(s) - fall back to individual requests
      if (errorMessage.includes('InvalidParameterValue') || errorMessage.includes('ItemIds')) {
        batchFailed = true;
        this.logger.info('Falling back to individual ASIN requests...');
      }
    }

    // Fallback: If batch failed due to invalid ASINs, try fetching each ASIN individually
    if (batchFailed) {
      for (const asin of validAsins) {
        try {
          const detail = await this.getProductDetails(asin);
          result.set(asin, detail);
          this.logger.debug(`Successfully fetched product detail for ASIN ${asin}`);
        } catch (error) {
          // Individual ASIN not found or invalid - skip silently
          this.logger.debug(`ASIN ${asin} not available: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.logger.info(`Fallback completed: fetched ${result.size}/${validAsins.length} competitor product details`);
    }

    return result;
  }

  /**
   * Handle rate limiting with queue management
   */
  async handleRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.rateLimitConfig.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      this.logger.debug(`Rate limiting: waiting ${delay}ms`);
      await this.sleep(delay);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Make authenticated request to PA-API
   */
  private async makeRequest(request: PAAPIRequest): Promise<PAAPIResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await this.handleRateLimit();

          const host = this.getHost();
          const endpoint = request.Operation === 'GetItems' ? '/paapi5/getitems' : '/paapi5/searchitems';
          const url = `https://${host}${endpoint}`;

          // Determine the correct target based on operation
          const target = request.Operation === 'GetItems'
            ? 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems'
            : 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

          const headers = this.createAuthHeaders(request, host, endpoint, target);

          let lastError: Error | null = null;

          for (let attempt = 1; attempt <= this.rateLimitConfig.maxRetries; attempt++) {
            try {
              this.logger.debug(`Making PA-API request (attempt ${attempt}/${this.rateLimitConfig.maxRetries})`);

              const response: AxiosResponse<PAAPIResponse> = await this.httpClient.post(url, request, { headers });

              if (response.data.Errors && response.data.Errors.length > 0) {
                const error = response.data.Errors[0];
                if (error) {
                  throw new Error(`PA-API Error: ${error.Code} - ${error.Message}`);
                }
              }

              return resolve(response.data);
            } catch (error: unknown) {
              // Log detailed error information for debugging
              if (axios.isAxiosError(error) && error.response) {
                const errorData = error.response.data as PAAPIErrorData;
                const errorInfo = errorData?.Errors?.[0] || errorData?.__type || errorData;
                this.logger.debug(`PA-API Response Error: ${JSON.stringify(errorInfo)}`);
              }

              lastError = error as Error;

              if (attempt < this.rateLimitConfig.maxRetries) {
                const delay = this.rateLimitConfig.retryDelay * Math.pow(2, attempt - 1);
                this.logger.warn(`Request failed (attempt ${attempt}), retrying in ${delay}ms: ${lastError.message}`);
                await this.sleep(delay);
              }
            }
          }

          reject(new Error(`PA-API request failed after ${this.rateLimitConfig.maxRetries} attempts: ${lastError?.message}`));
        } catch (error) {
          reject(error as Error);
        }
      });

      void this.processQueue();
    });
  }

  /**
   * Process request queue to maintain rate limits
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        await request();
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Create AWS Signature Version 4 headers
   * Matches official paapi5-nodejs-sdk implementation
   * Signs: content-encoding, content-type, host, x-amz-date, x-amz-target (alphabetical order)
   */
  private createAuthHeaders(request: PAAPIRequest, host: string, endpoint: string, target: string): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    // Request headers to be signed (must match official SDK)
    const requestHeaders: Record<string, string> = {
      'content-encoding': 'amz-1.0',
      'content-type': 'application/json; charset=utf-8',
      'host': host,
      'x-amz-date': amzDate,
      'x-amz-target': target
    };

    // Create canonical headers (sorted alphabetically by header name)
    const sortedHeaderNames = Object.keys(requestHeaders).sort();
    const canonicalHeaders = sortedHeaderNames
      .map(name => `${name.toLowerCase()}:${requestHeaders[name]}\n`)
      .join('');

    const signedHeaders = sortedHeaderNames.map(name => name.toLowerCase()).join(';');

    // Payload hash
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');

    const canonicalRequest = [
      'POST',
      endpoint,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.credentials!.region}/ProductAdvertisingAPI/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    const signingKey = this.getSignatureKey(this.credentials!.secretKey, dateStamp, this.credentials!.region, 'ProductAdvertisingAPI');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorizationHeader = `${algorithm} Credential=${this.credentials!.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'Authorization': authorizationHeader,
      'Content-Encoding': 'amz-1.0',
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'X-Amz-Date': amzDate,
      'X-Amz-Target': target
    };
  }

  /**
   * Generate AWS signature key
   */
  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }

  /**
   * Parse search response into Product objects
   */
  private parseSearchResponse(response: PAAPIResponse): Product[] {
    if (!response.SearchResult?.Items) {
      return [];
    }

    return response.SearchResult.Items.map(item => this.parseProduct(item));
  }

  /**
   * Parse PA-API item into Product object
   */
  private parseProduct(item: PAAPIItem): Product {
    const price = this.extractPrice(item);
    const images = this.extractImages(item);
    const rating = this.extractRating(item);
    const categoryInfo = this.extractCategoryInfo(item);

    return {
      asin: item.ASIN,
      title: item.ItemInfo?.Title?.DisplayValue || 'Unknown Title',
      category: categoryInfo.main, // 後方互換性のためメインカテゴリを設定
      categoryInfo,
      price,
      images,
      specifications: this.extractSpecifications(item),
      rating,
      detailPageUrl: item.DetailPageURL
    };
  }

  /**
   * Parse PA-API item into ProductDetail object
   */
  private parseProductDetail(item: PAAPIItem): ProductDetail {
    const product = this.parseProduct(item);

    const result: ProductDetail = {
      ...product,
      features: item.ItemInfo?.Features?.DisplayValues || []
    };

    // Only add optional properties if they exist
    const manufacturer = item.ItemInfo?.ManufactureInfo?.Brand?.DisplayValue;
    if (manufacturer) {
      result.manufacturer = manufacturer;
    }

    const model = item.ItemInfo?.ManufactureInfo?.Model?.DisplayValue;
    if (model) {
      result.model = model;
    }

    // ByLineInfo: ブランド情報（より詳細）
    const brand = item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue;
    if (brand) {
      result.brand = brand;
    }

    // ContentInfo: 発売日、言語情報
    const releaseDate = item.ItemInfo?.ContentInfo?.PublicationDate?.DisplayValue;
    if (releaseDate) {
      result.releaseDate = releaseDate;
    }

    const languages = item.ItemInfo?.ContentInfo?.Languages?.DisplayValues;
    if (languages && languages.length > 0) {
      result.languages = languages.map(lang => lang.DisplayValue);
    }

    // ByLineInfo: Contributors（著者、出演者等）
    const contributors = item.ItemInfo?.ByLineInfo?.Contributors;
    if (contributors && contributors.length > 0) {
      result.contributors = contributors.map(c => ({
        name: c.Name,
        role: c.Role
      }));
    }

    // ExternalIds: EAN, ISBN, UPC
    const externalIds = item.ItemInfo?.ExternalIds;
    if (externalIds) {
      result.externalIds = {};
      if (externalIds.EANs?.DisplayValues?.[0]) {
        result.externalIds.ean = externalIds.EANs.DisplayValues[0];
      }
      if (externalIds.ISBNs?.DisplayValues?.[0]) {
        result.externalIds.isbn = externalIds.ISBNs.DisplayValues[0];
      }
      if (externalIds.UPCs?.DisplayValues?.[0]) {
        result.externalIds.upc = externalIds.UPCs.DisplayValues[0];
      }
    }

    // Offers: 在庫状況、Prime対応
    const listing = item.Offers?.Listings?.[0];
    if (listing) {
      if (listing.Availability?.Message) {
        result.availability = listing.Availability.Message;
      }
      if (listing.DeliveryInfo?.IsPrimeEligible !== undefined) {
        result.isPrimeEligible = listing.DeliveryInfo.IsPrimeEligible;
      }
    }

    return result;
  }

  /**
   * Extract price information from PA-API item
   */
  private extractPrice(item: PAAPIItem): Product['price'] {
    const listing = item.Offers?.Listings?.[0];
    const summary = item.Offers?.Summaries?.[0];

    if (listing?.Price) {
      return {
        amount: listing.Price.Amount / 100, // Convert from cents
        currency: listing.Price.Currency,
        formatted: listing.Price.DisplayAmount
      };
    }

    if (summary?.LowestPrice) {
      return {
        amount: summary.LowestPrice.Amount / 100,
        currency: summary.LowestPrice.Currency,
        formatted: summary.LowestPrice.DisplayAmount
      };
    }

    return {
      amount: 0,
      currency: 'JPY',
      formatted: '価格情報なし'
    };
  }

  /**
   * Extract image information from PA-API item
   */
  private extractImages(item: PAAPIItem): Product['images'] {
    const primary = item.Images?.Primary?.Large?.URL || item.Images?.Primary?.Medium?.URL || '';
    const thumbnails = item.Images?.Variants?.map(variant => variant.Large?.URL).filter(Boolean) || [];

    return {
      primary,
      thumbnails: thumbnails as string[]
    };
  }

  /**
   * Extract rating information from PA-API item
   * Note: CustomerReviews resource is not available in PA-API v5
   */
  private extractRating(_item: PAAPIItem): Product['rating'] {
    // CustomerReviews resource is not available in PA-API v5
    return {
      average: 0,
      count: 0
    };
  }

  /**
   * Check if a browse node name is a valid product category
   * Filters out promotional, shipping, and store-related nodes
   */
  private isValidCategoryNode(displayName: string): boolean {
    const invalidPatterns = [
      /ブラックフライデー/i,
      /サイバーマンデー/i,
      /プライムデー/i,
      /セール/i,
      /Deal/i,
      /AmazonGlobal/i,
      /free shipping/i,
      /新商品$/,
      /^yobi$/i,
      /特集/,
      /おすすめ/,
      /キャンペーン/,
      /父の日/,
      /母の日/,
      /^カテゴリー別$/,  // Amazon navigation node
      /Amazonビジネス/,
      /法人価格/,
      /^SnS /i,  // Exclude all categories starting with "SnS" (e.g., SnS Engagement Test, SnS May Promo Code Campaign)
      /Grocery_over2000_BFW24/,
      /Winter Sale/i,
      /Big Sale/i,
      /Favorites/i,
      /ストア$/i,
      /[0-9]+[%％](\s*以上)?\s*OFF/i,
      /^Panasonic-HA-PersonalCare$/i,
      /^Amazon/i,
      /^Customers/i,
      /^服$/,
      /^HPC/i,  // Exclude all categories starting with "HPC" (e.g., HPC Recommendation Widget, HPC_CreatorInfoHub_xxx)
      /ネイチャーメイド/i,
      /大塚HPC_イオンサンプリング/i,
      /3P HPC/i,
      /Coupon/i,  // Exclude all categories containing "Coupon" (e.g., "プロテイン・サプリメント祭り | Coupon | 大塚製薬")
      /スポーツプレイヤーのサポートアイテム/,
      /（サービス紐づけ用）/,
      /予約注文における注意事項/,
      /_\d{4}$/,  // Exclude categories ending with "_" followed by 4 digits (e.g., "B637c621-7397-4d82-A4ba-A3e8942deb88_4401")
      /_\d{3}$/,  // Exclude categories ending with "_" followed by 3 digits (e.g., "B637c621-7397-4d82-A4ba-A3e8942deb88_701
      /万円台$/,  // Exclude price-range categories (e.g., "1万円台", "2万円台")
      /万円以上$/,
      /円~.*円$/,  // Exclude price range categories (e.g., "10,001円~15,000円")
      /ASIN$/,  // Exclude categories ending with "ASIN" (e.g., "Logicool壁紙配信対象ASIN")
      /Test$/,
      /テスト$/,
      /選び方$/,
      /祝い$/i,
    ];

    return !invalidPatterns.some(pattern => pattern.test(displayName));
  }

  /**
   * Normalize category name to fix variations from PA-API
   * e.g., "スポーツ＆アウトドア" → "スポーツ・アウトドア"
   */
  private normalizeCategoryName(name: string): string {
    // Replace full-width ampersand with middle dot for consistency
    return name.replace(/＆/g, '・');
  }

  /**
   * Extract hierarchical category info from PA-API BrowseNodes
   * BrowseNodes are typically ordered from specific (child) to general (parent)
   * Filters out promotional and non-category nodes
   */
  private extractCategoryInfo(item: PAAPIItem): CategoryInfo {
    const browseNodes = item.BrowseNodeInfo?.BrowseNodes || [];

    // Filter to only valid category nodes
    const validNodes = browseNodes.filter(node =>
      node.DisplayName && this.isValidCategoryNode(node.DisplayName)
    );

    if (validNodes.length === 0) {
      // Fall back to ContextFreeName if DisplayName is invalid
      const contextFreeNode = browseNodes.find(node =>
        node.ContextFreeName && this.isValidCategoryNode(node.ContextFreeName)
      );
      if (contextFreeNode) {
        return {
          main: this.normalizeCategoryName(contextFreeNode.ContextFreeName),
          browseNodeId: contextFreeNode.Id
        };
      }
      return { main: 'その他' };
    }

    if (validNodes.length === 1) {
      const firstNode = validNodes[0]!;
      return {
        main: this.normalizeCategoryName(firstNode.DisplayName),
        browseNodeId: firstNode.Id
      };
    }

    // 複数ノードがある場合: [0]=詳細(サブ), [1]=上位(メイン)
    const firstNode = validNodes[0]!;
    const secondNode = validNodes[1];
    return {
      main: this.normalizeCategoryName(secondNode?.DisplayName || firstNode.DisplayName),
      sub: this.normalizeCategoryName(firstNode.DisplayName),
      browseNodeId: firstNode.Id
    };
  }

  /**
   * Extract category from PA-API item (backward compatibility)
   */
  private extractCategory(item: PAAPIItem): string {
    return this.extractCategoryInfo(item).main;
  }

  /**
   * Extract specifications from PA-API item
   */
  private extractSpecifications(item: PAAPIItem): Record<string, string> {
    const specs: Record<string, string> = {};

    if (item.ItemInfo?.ManufactureInfo?.Brand?.DisplayValue) {
      specs.brand = item.ItemInfo.ManufactureInfo.Brand.DisplayValue;
    }

    if (item.ItemInfo?.ManufactureInfo?.Model?.DisplayValue) {
      specs.model = item.ItemInfo.ManufactureInfo.Model.DisplayValue;
    }

    return specs;
  }

  /**
   * Utility methods
   */
  private validateAuthentication(): void {
    if (!this.credentials) {
      throw new Error('PA-API client not authenticated. Call authenticate() first.');
    }
  }

  private getHost(): string {
    // Japan marketplace uses us-west-2 region
    return 'webservices.amazon.co.jp';
  }

  private getMarketplace(): string {
    // Japan marketplace
    return 'www.amazon.co.jp';
  }

  private mapCategoryToSearchIndex(category: string): string {
    // Japan-specific SearchIndex values
    // See: https://webservices.amazon.co.jp/paapi5/documentation/locale-reference/japan.html
    const categoryMap: Record<string, string> = {
      'electronics': 'Electronics',
      'books': 'Books',
      'clothing': 'Fashion',
      'home': 'HomeAndKitchen',
      'sports': 'SportsAndOutdoors',
      'toys': 'Toys',
      'automotive': 'Automotive',
      'beauty': 'Beauty',
      'health': 'HealthPersonalCare',
      'kitchen': 'HomeAndKitchen',
      'garden': 'ToolsAndHomeImprovement',
      'computers': 'Computers',
      'music': 'Music',
      'videogames': 'VideoGames'
    };

    return categoryMap[category.toLowerCase()] || 'All';
  }

  private mapSortBy(sortBy: string): string {
    const sortMap: Record<string, string> = {
      'relevance': 'Relevance',
      'price': 'Price:LowToHigh',
      'rating': 'AvgCustomerReviews'
    };

    return sortMap[sortBy] || 'Relevance';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}