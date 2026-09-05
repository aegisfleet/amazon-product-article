import type { CreatorsAPIClient } from '../../api/CreatorsAPIClient';
import { ProductSearcher } from '../../search/ProductSearcher';

// Mock CreatorsAPIClient
const mockClient = {
  getProductDetails: async (asin: string) => {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      asin,
      title: `Product ${asin}`,
      price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
      rating: { average: 4.5, count: 100 },
      images: { primary: '', thumbnails: [] },
      category: 'Test',
      specifications: {},
    };
  },

  getMultipleProductDetails: async (asins: string[]) => {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 150));
    const results = new Map();
    for (const asin of asins) {
      results.set(asin, {
        asin,
        title: `Product ${asin}`,
        price: { amount: 1000, currency: 'JPY', formatted: '¥1,000' },
        rating: { average: 4.5, count: 100 },
        images: { primary: '', thumbnails: [] },
        category: 'Test',
        specifications: {},
      });
    }
    return { results, permanentFailures: new Set() };
  },
} as unknown as CreatorsAPIClient;

async function benchmark() {
  const searcher = new ProductSearcher(mockClient);

  const asins = Array.from({ length: 10 }, (_, i) => `B00000000${i}`);

  console.log(`Starting benchmark with ${asins.length} ASINs...`);
  const start = Date.now();
  await searcher.searchByAsins(asins);
  const end = Date.now();

  console.log(`Total time: ${end - start}ms`);
  console.log(`Average time per ASIN: ${(end - start) / asins.length}ms`);
}

benchmark().catch((err) => {
  console.error(err);
});
