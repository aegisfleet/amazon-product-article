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
import { Product, ProductDetail, ProductSearchParams, ProductSearchResult } from '../types/Product';
import { Logger } from '../utils/Logger';

export class PAAPIClient {
  private logger = Logger.getInstance();
  private credentials?: PAAPICredentials;
  private httpClient: AxiosInstance;
  private rateLimitConfig: RateLimitConfig;
  private lastRequestTime = 0;
  private requestQueue: Array<() => Promise<any>> = [];
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
  async authenticate(accessKey: string, secretKey: string, partnerTag: string): Promise<void> {
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
        'Offers.Listings.Availability.Type',
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice',
        'BrowseNodeInfo.BrowseNodes',
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
        'Offers.Listings.Price',
        'Offers.Listings.Availability.Type',
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
            } catch (error: any) {
              // Log detailed error information for debugging
              if (error.response) {
                const errorData = error.response.data;
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
          reject(error);
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

    return {
      asin: item.ASIN,
      title: item.ItemInfo?.Title?.DisplayValue || 'Unknown Title',
      category: this.extractCategory(item),
      price,
      images,
      specifications: this.extractSpecifications(item),
      availability: item.Offers?.Listings?.[0]?.Availability?.Message || 'Unknown',
      rating
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

    return result;
  }

  /**
   * Extract price information from PA-API item
   */
  private extractPrice(item: PAAPIItem) {
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
  private extractImages(item: PAAPIItem) {
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
  private extractRating(_item: PAAPIItem) {
    // CustomerReviews resource is not available in PA-API v5
    return {
      average: 0,
      count: 0
    };
  }

  /**
   * Extract category from PA-API item
   */
  private extractCategory(item: PAAPIItem): string {
    return item.BrowseNodeInfo?.BrowseNodes?.[0]?.DisplayName || 'Unknown';
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