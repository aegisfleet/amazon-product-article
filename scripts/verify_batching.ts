
import { ProductSearcher } from '../src/search/ProductSearcher';
import { CreatorsAPIClient } from '../src/api/CreatorsAPIClient';

async function verifyBatching() {
  console.log('--- Verifying Batching Logic ---');

  let callCount = 0;
  const capturedBatches: string[][] = [];

  // Mock CreatorsAPIClient
  const mockClient = {
    getMultipleProductDetails: async (asins: string[]) => {
      callCount++;
      capturedBatches.push(asins);
      const results = new Map();
      for (const asin of asins) {
        results.set(asin, { asin, title: `Product ${asin}` });
      }
      return { results, permanentFailures: new Set() };
    }
  } as unknown as CreatorsAPIClient;

  // Mock Logger and other dependencies for ProductSearcher
  const searcher = new ProductSearcher(mockClient);
  // Override private methods that write to disk
  (searcher as any).saveCategoryResults = async () => {};
  (searcher as any).saveSearchSession = async () => {};
  (searcher as any).generateSessionId = () => 'test-session';

  // Test with 25 ASINs (should result in 3 batches: 10, 10, 5)
  const testAsins = Array.from({ length: 25 }, (_, i) => `ASIN${i.toString().padStart(3, '0')}`);

  console.log(`Testing with ${testAsins.length} ASINs...`);
  const session = await searcher.searchByAsins(testAsins);

  console.log(`Total API calls: ${callCount}`);
  console.log(`Total products found: ${session.totalProducts}`);

  let success = true;
  if (callCount !== 3) {
    console.error(`FAILED: Expected 3 API calls, but got ${callCount}`);
    success = false;
  }

  if (session.totalProducts !== 25) {
    console.error(`FAILED: Expected 25 products, but got ${session.totalProducts}`);
    success = false;
  }

  if (capturedBatches[0].length !== 10 || capturedBatches[1].length !== 10 || capturedBatches[2].length !== 5) {
    console.error('FAILED: Batch sizes are incorrect');
    console.error('Batches:', capturedBatches.map(b => b.length));
    success = false;
  }

  if (success) {
    console.log('SUCCESS: Batching logic verified successfully!');
  } else {
    process.exit(1);
  }
}

verifyBatching().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
