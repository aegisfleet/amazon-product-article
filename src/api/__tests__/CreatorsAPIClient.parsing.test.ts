import { CreatorsAPIClient } from '../CreatorsAPIClient';
import type { CreatorsAPIItem } from '../../types/CreatorsAPITypes';

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
                name: 'Amazon.co.jp'
              }
            }
          ]
        }
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
                name: 'Other Marketplace Seller'
              }
            }
          ]
        }
      };

      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.isPrimeEligible).toBe(false);
    });

    it('should set isPrimeEligible: false when merchantInfo is missing', () => {
      const mockItem: Partial<CreatorsAPIItem> = {
        asin: 'B09VXJ3V1R',
        offersV2: {
          listings: [
            {}
          ]
        }
      };

      const product = (client as any).parseProduct(mockItem as CreatorsAPIItem);
      expect(product.isPrimeEligible).toBe(false);
    });
  });
});
