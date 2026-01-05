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
    ByLineInfo?: {
      Brand?: {
        DisplayValue: string;
        Locale: string;
      };
      Manufacturer?: {
        DisplayValue: string;
        Locale: string;
      };
      Contributors?: Array<{
        Name: string;
        Role: string;
        Locale: string;
      }>;
    };
    ContentInfo?: {
      Edition?: {
        DisplayValue: string;
        Locale: string;
      };
      Languages?: {
        DisplayValues: Array<{
          DisplayValue: string;
          Type: string;
        }>;
      };
      PagesCount?: {
        DisplayValue: number;
      };
      PublicationDate?: {
        DisplayValue: string;
      };
    };
    TechnicalInfo?: {
      Formats?: {
        DisplayValues: string[];
      };
      EnergyEfficiencyClass?: {
        DisplayValue: string;
      };
    };
    ProductInfo?: {
      Color?: {
        DisplayValue: string;
      };
      ItemDimensions?: {
        Height?: {
          DisplayValue: number;
          Unit: string;
        };
        Length?: {
          DisplayValue: number;
          Unit: string;
        };
        Width?: {
          DisplayValue: number;
          Unit: string;
        };
        Weight?: {
          DisplayValue: number;
          Unit: string;
        };
      };
      Size?: {
        DisplayValue: string;
      };
      UnitCount?: {
        DisplayValue: number;
        Type: string;
      };
    };
    ExternalIds?: {
      EANs?: {
        DisplayValues: string[];
      };
      ISBNs?: {
        DisplayValues: string[];
      };
      UPCs?: {
        DisplayValues: string[];
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
      DeliveryInfo?: {
        IsPrimeEligible: boolean;
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
      IsRoot?: boolean;
      SalesRank?: number;
    }>;
  };
  ParentASIN?: string;
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