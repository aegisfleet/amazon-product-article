import type { CreatorsAPIItem } from '../../types/CreatorsAPITypes';
import { CreatorsAPIClient } from '../CreatorsAPIClient';

describe('CreatorsAPIClient Parsing Tests', () => {
  let client: CreatorsAPIClient;

  beforeEach(() => {
    client = new CreatorsAPIClient();
    // 認証済み状態にする（バリデーション回避のため）
    client.authenticate('app-id', 'cred-id', 'cred-secret', 'tag-22');
  });

  describe('parseProduct with Prime eligibility (Heuristic)', () => {
    it('should set isPrimeEligible: true when merchant is Amazon.co.jp', () => {
      const mockItem: Partial<CreatorsAPIItem> = {
        asin: 'B09VXJ3V1R',
        offersV2: {
          listings: [
            {
              merchantInfo: {
                id: 'AN1VRQENFRJN5',
                name: 'Amazon.co.jp',
              },
            },
          ],
        },
      };

      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.isPrimeEligible).toBe(true);
    });

    it('should set isPrimeEligible: false when merchant is NOT Amazon.co.jp', () => {
      const mockItem: Partial<CreatorsAPIItem> = {
        asin: 'B09VXJ3V1R',
        offersV2: {
          listings: [
            {
              merchantInfo: {
                id: 'OTHER_ID',
                name: 'Other Marketplace Seller',
              },
            },
          ],
        },
      };

      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.isPrimeEligible).toBe(false);
    });

    it('should set isPrimeEligible: false when merchantInfo is missing', () => {
      const mockItem: Partial<CreatorsAPIItem> = {
        asin: 'B09VXJ3V1R',
        offersV2: {
          listings: [{}],
        },
      };

      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.isPrimeEligible).toBe(false);
    });
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
});
