/**
 * Amazon Creators API types and interfaces
 * Updated for Creators API (camelCase response)
 */

export interface CreatorsAPICredentials {
  applicationId?: string; // Optional for OAuth
  credentialId: string;
  credentialSecret: string;
  partnerTag: string;
}

export interface CreatorsAPIRequest {
  operation?: string; // Not sent in body for Creators API, but used internally
  partnerTag: string;
  partnerType: string;
  marketplace: string;
  resources: string[];
  [key: string]: any;
}

export interface CreatorsAPIResponse {
  searchResult?: {
    items?: CreatorsAPIItem[];
    totalResultCount?: number;
  };
  itemsResult?: {
    items?: CreatorsAPIItem[];
  };
  errors?: CreatorsAPIError[];
}

export interface CreatorsAPIItem {
  asin: string;
  detailPageURL: string;
  itemInfo?: {
    title?: {
      displayValue: string;
    };
    features?: {
      displayValues: string[];
    };
    manufactureInfo?: {
      brand?: {
        displayValue: string;
      };
      model?: {
        displayValue: string;
      };
    };
    byLineInfo?: {
      brand?: {
        displayValue: string;
        locale: string;
      };
      manufacturer?: {
        displayValue: string;
        locale: string;
      };
      contributors?: Array<{
        name: string;
        role: string;
        locale: string;
      }>;
    };
    contentInfo?: {
      edition?: {
        displayValue: string;
        locale: string;
      };
      languages?: {
        displayValues: Array<{
          displayValue: string;
          type: string;
        }>;
      };
      pagesCount?: {
        displayValue: number;
      };
      publicationDate?: {
        displayValue: string;
      };
    };
    technicalInfo?: {
      formats?: {
        displayValues: string[];
      };
      energyEfficiencyClass?: {
        displayValue: string;
      };
    };
    productInfo?: {
      color?: {
        displayValue: string;
      };
      itemDimensions?: {
        height?: {
          displayValue: number;
          unit: string;
        };
        length?: {
          displayValue: number;
          unit: string;
        };
        width?: {
          displayValue: number;
          unit: string;
        };
        weight?: {
          displayValue: number;
          unit: string;
        };
      };
      size?: {
        displayValue: string;
      };
      unitCount?: {
        displayValue: number;
        type: string;
      };
    };
    externalIds?: {
      eans?: {
        displayValues: string[];
      };
      isbns?: {
        displayValues: string[];
      };
      upcs?: {
        displayValues: string[];
      };
    };
  };
  images?: {
    primary?: {
      large?: {
        url: string;
        height: number;
        width: number;
      };
      medium?: {
        url: string;
        height: number;
        width: number;
      };
    };
    variants?: Array<{
      large?: {
        url: string;
        height: number;
        width: number;
      };
    }>;
  };
  // Creators API uses offersV2 (in camelCase context, though field name might be offersV2)
  offersV2?: {
    listings?: Array<{
      price?: {
        money?: {
          amount: number;
          currency: string;
          displayAmount: string;
        };
      };
      availability?: {
        message: string;
      };
      deliveryInfo?: {
        isPrimeEligible: boolean;
      };
    }>;
    summaries?: Array<{
      highestPrice?: {
        money?: {
          amount: number;
          currency: string;
          displayAmount: string;
        };
      };
      lowestPrice?: {
        money?: {
          amount: number;
          currency: string;
          displayAmount: string;
        };
      };
    }>;
  };
  // Deprecated Offers for backward compatibility if needed, but likely unused
  offers?: any;

  browseNodeInfo?: {
    browseNodes?: Array<{
      id: string;
      displayName: string;
      contextFreeName: string;
      isRoot?: boolean;
      salesRank?: number;
      ancestor?: any; // Recursive definition simplified
    }>;
  };
  parentASIN?: string;
  customerReviews?: {
    count?: number;
    starRating?: number;
  };
}

export interface CreatorsAPIError {
  code: string;
  message: string;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstLimit: number;
  retryDelay: number;
  maxRetries: number;
}

// Legacy aliases for backward compatibility during refactor
export type PAAPICredentials = CreatorsAPICredentials;
export type PAAPIRequest = CreatorsAPIRequest;
export type PAAPIResponse = CreatorsAPIResponse;
export type PAAPIItem = CreatorsAPIItem;
export type PAAPIError = CreatorsAPIError;