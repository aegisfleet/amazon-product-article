import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/Logger';

/**
 * Amazon Review Verifier
 * PA-API Limitations workaround: Scrapes product page to get actual review count/rating
 */
export class ReviewVerifier {
    private logger = Logger.getInstance();
    private httpClient: AxiosInstance;

    constructor() {
        this.httpClient = axios.create({
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3'
            }
        });
    }

    /**
     * Verify actual review count and rating for a product
     * @param asin Product ASIN
     * @returns Object with count and rating, or null if verification failed
     */
    async verifyReviews(asin: string): Promise<{ count: number; rating: number } | null> {
        const url = `https://www.amazon.co.jp/dp/${asin}`;

        try {
            this.logger.debug(`Verifying reviews for ASIN: ${asin} via scraping`);

            const response = await this.httpClient.get(url);
            const html = response.data as string;

            // Extract rating (e.g., "5つ星のうち4.6")
            const ratingMatch = html.match(/5つ星のうち([0-9.]+)/);
            const rating = (ratingMatch && ratingMatch[1]) ? parseFloat(ratingMatch[1]) : 0;

            // Extract review count
            // Patterns: "1,234 global ratings", "1,234個の評価"
            // Note: This is fragile and depends on Amazon's DOM/Text
            const countMatch = html.match(/([0-9,]+)\s*(?:global ratings|個の評価)/i);
            let count = 0;

            if (countMatch && countMatch[1]) {
                count = parseInt(countMatch[1].replace(/,/g, ''), 10);
            } else {
                // Fallback: look for "customer reviews" pattern which might look different
                // Trying a regex for the specific span ID often used
                const specificSpanMatch = html.match(/id="acrCustomerReviewText"[^>]*>([0-9,]+)/);
                if (specificSpanMatch && specificSpanMatch[1]) {
                    count = parseInt(specificSpanMatch[1].replace(/,/g, ''), 10);
                }
            }

            if (rating > 0 || count > 0) {
                this.logger.info(`Verified reviews for ${asin}: Rating=${rating}, Count=${count}`);
                return { count, rating };
            }

            this.logger.warn(`Could not extract review data for ${asin}`);
            return null;

        } catch (error) {
            this.logger.warn(`Review verification failed for ${asin}:`, error instanceof Error ? error.message : error);
            return null;
        }
    }
}
