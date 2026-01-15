/**
 * Tests for mobile app filtering in PAAPIClient
 */

import { PAAPIItem } from '../../types/PAAPITypes';
import { PAAPIClient } from '../PAAPIClient';

describe('PAAPIClient Mobile App Filtering', () => {
    let client: PAAPIClient;

    beforeEach(() => {
        client = new PAAPIClient();
    });

    // Access the private method for testing
    const isMobileApp = (item: PAAPIItem): boolean => {
        return (client as any).isMobileApp(item);
    };

    describe('isMobileApp', () => {
        it('should identify mobile apps by availability message (most reliable)', () => {
            const mobileAppItem: PAAPIItem = {
                ASIN: 'B007XVSQL2L',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B007XVSQL2L',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'アイススラッシュ冷凍食品メーカー'
                    }
                },
                BrowseNodeInfo: {
                    BrowseNodes: [
                        {
                            Id: '4153099051',
                            DisplayName: '教育・学習',
                            ContextFreeName: 'Education'
                        }
                    ]
                },
                Offers: {
                    Listings: [
                        {
                            Availability: {
                                Message: '対応端末ですぐにご利用いただけます。'
                            },
                            Price: {
                                Amount: 323,
                                Currency: 'JPY',
                                DisplayAmount: '￥323'
                            }
                        }
                    ]
                }
            };

            expect(isMobileApp(mobileAppItem)).toBe(true);
        });

        it('should identify mobile apps by BrowseNode category name', () => {
            const mobileAppItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'Sample App'
                    }
                },
                BrowseNodeInfo: {
                    BrowseNodes: [
                        {
                            Id: '1234',
                            DisplayName: 'Androidアプリ',
                            ContextFreeName: 'Android Apps'
                        }
                    ]
                }
            };

            expect(isMobileApp(mobileAppItem)).toBe(true);
        });

        it('should identify mobile apps by ContextFreeName', () => {
            const mobileAppItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'Sample App'
                    }
                },
                BrowseNodeInfo: {
                    BrowseNodes: [
                        {
                            Id: '1234',
                            DisplayName: 'テスト',
                            ContextFreeName: 'Mobile Apps'
                        }
                    ]
                }
            };

            expect(isMobileApp(mobileAppItem)).toBe(true);
        });

        it('should identify mobile apps with title pattern [Androidアプリ]', () => {
            const mobileAppItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'ゲームアプリ名 [Androidアプリ]'
                    }
                }
            };

            expect(isMobileApp(mobileAppItem)).toBe(true);
        });

        it('should identify mobile apps with title pattern [iOSアプリ]', () => {
            const mobileAppItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'ゲームアプリ名 [iOSアプリ]'
                    }
                }
            };

            expect(isMobileApp(mobileAppItem)).toBe(true);
        });

        it('should identify mobile apps with title pattern (アプリ)', () => {
            const mobileAppItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'サンプルアプリ (アプリ)'
                    }
                }
            };

            expect(isMobileApp(mobileAppItem)).toBe(true);
        });

        it('should NOT exclude regular physical products', () => {
            const physicalProduct: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'ソニー ワイヤレスイヤホン WF-1000XM5'
                    }
                },
                BrowseNodeInfo: {
                    BrowseNodes: [
                        {
                            Id: '1234',
                            DisplayName: 'イヤホン・ヘッドホン',
                            ContextFreeName: 'Electronics'
                        }
                    ]
                }
            };

            expect(isMobileApp(physicalProduct)).toBe(false);
        });

        it('should NOT exclude products with "アプリ" in normal text context', () => {
            const productWithAppInDescription: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'スマートウォッチ 専用アプリ連携可能'
                    }
                },
                BrowseNodeInfo: {
                    BrowseNodes: [
                        {
                            Id: '1234',
                            DisplayName: 'スマートウォッチ',
                            ContextFreeName: 'Watches'
                        }
                    ]
                }
            };

            expect(isMobileApp(productWithAppInDescription)).toBe(false);
        });

        it('should handle items without BrowseNodeInfo', () => {
            const itemWithoutBrowseNode: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: '通常の商品'
                    }
                }
            };

            expect(isMobileApp(itemWithoutBrowseNode)).toBe(false);
        });

        it('should handle items without ItemInfo', () => {
            const itemWithoutItemInfo: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567'
            };

            expect(isMobileApp(itemWithoutItemInfo)).toBe(false);
        });

        it('should identify apps with "App" category', () => {
            const appItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'Some Game'
                    }
                },
                BrowseNodeInfo: {
                    BrowseNodes: [
                        {
                            Id: '1234',
                            DisplayName: 'アプリ',
                            ContextFreeName: 'App'
                        }
                    ]
                }
            };

            expect(isMobileApp(appItem)).toBe(true);
        });

        it('should identify apps with "Appストア" category', () => {
            const appItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: 'Some Game'
                    }
                },
                BrowseNodeInfo: {
                    BrowseNodes: [
                        {
                            Id: '1234',
                            DisplayName: 'Appストア',
                            ContextFreeName: 'App Store'
                        }
                    ]
                }
            };

            expect(isMobileApp(appItem)).toBe(true);
        });
    });

    // Access the private method for testing
    const isZeroPriceItem = (item: PAAPIItem): boolean => {
        return (client as any).isZeroPriceItem(item);
    };

    describe('isZeroPriceItem', () => {
        it('should identify zero-price items by listing price', () => {
            const freeItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: '無料アプリ'
                    }
                },
                Offers: {
                    Listings: [
                        {
                            Price: {
                                Amount: 0,
                                Currency: 'JPY',
                                DisplayAmount: '￥0'
                            }
                        }
                    ]
                }
            };

            expect(isZeroPriceItem(freeItem)).toBe(true);
        });

        it('should identify zero-price items by summary lowest price', () => {
            const freeItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: '無料コンテンツ'
                    }
                },
                Offers: {
                    Summaries: [
                        {
                            LowestPrice: {
                                Amount: 0,
                                Currency: 'JPY',
                                DisplayAmount: '￥0'
                            }
                        }
                    ]
                }
            };

            expect(isZeroPriceItem(freeItem)).toBe(true);
        });

        it('should NOT exclude items with non-zero price', () => {
            const paidItem: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: '有料商品'
                    }
                },
                Offers: {
                    Listings: [
                        {
                            Price: {
                                Amount: 298000, // 2,980円 (in cents)
                                Currency: 'JPY',
                                DisplayAmount: '￥2,980'
                            }
                        }
                    ]
                }
            };

            expect(isZeroPriceItem(paidItem)).toBe(false);
        });

        it('should NOT exclude items without price information', () => {
            const itemWithoutPrice: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: '価格情報なし商品'
                    }
                }
            };

            expect(isZeroPriceItem(itemWithoutPrice)).toBe(false);
        });

        it('should NOT exclude items with undefined offers', () => {
            const itemWithoutOffers: PAAPIItem = {
                ASIN: 'B001234567',
                DetailPageURL: 'https://www.amazon.co.jp/dp/B001234567',
                ItemInfo: {
                    Title: {
                        DisplayValue: '通常の商品'
                    }
                },
                Offers: {}
            };

            expect(isZeroPriceItem(itemWithoutOffers)).toBe(false);
        });
    });
});
