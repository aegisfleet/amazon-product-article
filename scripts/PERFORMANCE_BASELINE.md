# Performance Baseline: Manual Product Search

## Current Implementation (Sequential)
The current implementation of `searchByAsins` fetches product details for each ASIN sequentially in a `for` loop.

- **Request Type**: `getProductDetails(asin)` (single ASIN)
- **Rate Limiting**: Manual `await this.sleep(200)` after each request.
- **Estimated Time for N ASINs**: `N * (API_Response_Time + 200ms)`

### Example (N = 20)
- Assuming API response time = 150ms
- Total time = `20 * (150 + 200) = 7,000ms` (7 seconds)

## Proposed Implementation (Batching)
The proposed implementation will chunk the input ASINs into batches of up to 10 and use `getMultipleProductDetails`.

- **Request Type**: `getMultipleProductDetails(asins)` (up to 10 ASINs)
- **Rate Limiting**: Managed internally by `CreatorsAPIClient.makeRequest` (0.8 requests per second).
- **Estimated Time for N ASINs**: `ceil(N/10) * (API_Response_Time + Internal_Rate_Limit_Wait)`

### Example (N = 20)
- Assuming API response time = 200ms (slightly longer for batch)
- Number of batches = 2
- Internal rate limit wait = ~1.25s (1000ms / 0.8)
- Total time = `2 * (200 + 1250) = 2,900ms` (2.9 seconds)

## Expected Improvement
For 20 ASINs, the expected improvement is a reduction from ~7 seconds to ~3 seconds, which is a **~58% decrease in total execution time**. The benefit increases as the number of ASINs grows.
