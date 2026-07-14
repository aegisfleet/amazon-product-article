import type { CreatorsAPIItem } from '../../types/CreatorsAPITypes';
import { CreatorsAPIClient } from '../CreatorsAPIClient';

describe('CreatorsAPIClient Parsing Tests', () => {
  let client: CreatorsAPIClient;

  beforeEach(() => {
    client = new CreatorsAPIClient();
    // 認証済み状態にする（バリデーション回避のため）
    client.authenticate('app-id', 'cred-id', 'cred-secret', 'tag-22');
  });

  describe('extractSpecifications', () => {
    it('should extract specifications from productInfo and technicalInfo', () => {
      const mockItem: any = {
        asin: 'B0CHYRJN4M',
        itemInfo: {
          title: { displayValue: 'Test Product' },
          productInfo: {
            color: { displayValue: 'Black' },
            size: { displayValue: 'Large' },
            itemDimensions: {
              height: { displayValue: 10, unit: 'cm' },
              weight: { displayValue: 200, unit: 'g' },
            },
            material: { displayValue: 'Plastic' },
          },
          technicalInfo: {
            formats: { displayValues: ['Digital', 'Physical'] },
            voltage: { displayValue: '100V' },
          },
          manufactureInfo: {
            model: { displayValue: 'TM-2000' },
          },
        },
      };

      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.specifications).toEqual({
        color: 'Black',
        size: 'Large',
        height: '10 cm',
        weight: '200 g',
        material: 'Plastic',
        formats: 'Digital, Physical',
        voltage: '100V',
        model: 'TM-2000',
      });
    });

    it('should return empty object if itemInfo is missing', () => {
      const mockItem: any = { asin: 'B0CHYRJN4M' };
      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.specifications).toEqual({});
    });
  });

  describe('dealBadge parsing and normalization', () => {
    it('should parse normal dealBadge', () => {
      const mockItem: any = {
        asin: 'B0CHYRJN4M',
        offersV2: {
          listings: [
            {
              dealDetails: {
                badge: '特選タイムセール',
                accessType: 'ALL',
              },
            },
          ],
        },
      };
      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.dealBadge).toBe('特選タイムセール');
    });

    it('should normalize PRIME_EXCLUSIVE dealBadge when badge is missing or "プライムで"', () => {
      const mockItem1: any = {
        asin: 'B0CHYRJN4M',
        offersV2: {
          listings: [
            {
              dealDetails: {
                accessType: 'PRIME_EXCLUSIVE',
              },
            },
          ],
        },
      };
      const product1 = (client as any).parseProduct(mockItem1 as CreatorsAPIItem);
      expect(product1.dealBadge).toBe('プライム会員限定セール');

      const mockItem2: any = {
        asin: 'B0CHYRJN4M',
        offersV2: {
          listings: [
            {
              dealDetails: {
                badge: 'プライムで',
                accessType: 'PRIME_EXCLUSIVE',
              },
            },
          ],
        },
      };
      const product2 = (client as any).parseProduct(mockItem2 as CreatorsAPIItem);
      expect(product2.dealBadge).toBe('プライム会員限定セール');
    });

    it('should normalize incomplete time-limit badge like "終了まで: " or "終了まで" to "限定タイムセール"', () => {
      const mockItem1: any = {
        asin: 'B0CHYRJN4M',
        offersV2: {
          listings: [
            {
              dealDetails: {
                badge: '終了まで: ',
                accessType: 'ALL',
              },
            },
          ],
        },
      };
      const product1 = (client as any).parseProduct(mockItem1 as CreatorsAPIItem);
      expect(product1.dealBadge).toBe('限定タイムセール');

      const mockItem2: any = {
        asin: 'B0CHYRJN4M',
        offersV2: {
          listings: [
            {
              dealDetails: {
                badge: '終了まで:',
                accessType: 'ALL',
              },
            },
          ],
        },
      };
      const product2 = (client as any).parseProduct(mockItem2 as CreatorsAPIItem);
      expect(product2.dealBadge).toBe('限定タイムセール');

      const mockItem3: any = {
        asin: 'B0CHYRJN4M',
        offersV2: {
          listings: [
            {
              dealDetails: {
                badge: '終了まで',
                accessType: 'ALL',
              },
            },
          ],
        },
      };
      const product3 = (client as any).parseProduct(mockItem3 as CreatorsAPIItem);
      expect(product3.dealBadge).toBe('限定タイムセール');
    });
  });
});
