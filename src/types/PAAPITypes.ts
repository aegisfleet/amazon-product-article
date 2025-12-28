/**
 * Amazon PA-API v5 specific types and interfaces
 */

export interface PAAPICredentials {
  accessKey: string;
  secretKey: string;
  partnerTag: string;
  region: string;
}

export interface PAAPIRequest {
  Operation: string;
  PartnerTag: string;
  PartnerType: string;
  Marketplace: string;
  Resources: string[];
  [key: string]: any;
}

export interface PAAPIResponse {
  SearchResult?: {
    Items?: PAAPIItem[];
    TotalResultCount?: number;
  };
  ItemsResult?: {
    Items?: PAAPIItem[];
  };
  Errors?: PAAPIError[];
}

export interface PAAPIItem {
  ASIN: string;
  DetailPageURL: string;
  ItemInfo?: {
    Title?: {
      DisplayValue: string;
    };
    Features?: {
      DisplayValues: string[];
    };
    ManufactureInfo?: {
      Brand?: {
        DisplayValue: string;
      };
      Model?: {
        DisplayValue: string;
      };
    };
  };
  Images?: {
    Primary?: {
      Large?: {
        URL: string;
        Height: number;
        Width: number;
      };
      Medium?: {
        URL: string;
        Height: number;
        Width: number;
      };
    };
    Variants?: Array<{
      Large?: {
        URL: string;
        Height: number;
        Width: number;
      };
    }>;
  };
  Offers?: {
    Listings?: Array<{
      Price?: {
        Amount: number;
        Currency: string;
        DisplayAmount: string;
      };
      Availability?: {
        Message: string;
      };
    }>;
    Summaries?: Array<{
      HighestPrice?: {
        Amount: number;
        Currency: string;
        DisplayAmount: string;
      };
      LowestPrice?: {
        Amount: number;
        Currency: string;
        DisplayAmount: string;
      };
    }>;
  };
  CustomerReviews?: {
    StarRating?: {
      Value: number;
    };
    Count: number;
  };
  BrowseNodeInfo?: {
    BrowseNodes?: Array<{
      Id: string;
      DisplayName: string;
      ContextFreeName: string;
    }>;
  };
}

export interface PAAPIError {
  Code: string;
  Message: string;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstLimit: number;
  retryDelay: number;
  maxRetries: number;
}