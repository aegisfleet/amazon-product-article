import axios from 'axios';
import { google } from 'googleapis';
import { parseStringPromise } from 'xml2js';

// Environment variable check
const keyContent = process.env.GCP_SA_KEY;
if (!keyContent) {
    console.error('Error: GCP_SA_KEY environment variable is missing.');
    process.exit(1);
}

let key;
try {
    key = JSON.parse(keyContent);
} catch (error) {
    console.error('Error: Failed to parse GCP_SA_KEY. Ensure it is valid JSON.', error);
    process.exit(1);
}

const jwtClient = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/indexing'],
});

const batch = async () => {
    try {
        await jwtClient.authorize();
        console.log('Successfully authorized with Google Indexing API.');

        const urls: string[] = [];

        // Example of fetching URLs from command line arguments
        const args = process.argv.slice(2);
        if (args.length > 0) {
            urls.push(...args);
        }

        // --- Sitemap Parsing ---
        const sitemapUrl = 'https://aegisfleet.github.io/amazon-product-article/sitemap.xml';
        try {
            console.log(`Fetching sitemap from: ${sitemapUrl}`);
            const response = await axios.get(sitemapUrl);
            const result = await parseStringPromise(response.data);
            if (result.urlset && result.urlset.url) {
                const sitemapUrls = result.urlset.url.map((entry: any) => entry.loc[0]);
                console.log(`Found ${sitemapUrls.length} URLs in sitemap.`);
                urls.push(...sitemapUrls);
            }
        } catch (error: any) {
            console.error(`Warning: Failed to fetch or parse sitemap: ${error.message}`);
        }

        if (urls.length === 0) {
            console.log('No URLs provided for indexing.');
            return;
        }

        // Filter duplicates
        const uniqueUrls = [...new Set(urls)];

        for (const url of uniqueUrls) {
            console.log(`Requesting indexing for: ${url}`);
            try {
                const result = await google.indexing('v3').urlNotifications.publish({
                    auth: jwtClient,
                    requestBody: {
                        url: url,
                        type: 'URL_UPDATED',
                    },
                });
                console.log(`Success: ${result.status}`);
            } catch (err: any) {
                console.error(`Error indexing ${url}:`, err.message);
                if (err.response) {
                    console.error(err.response.data);
                }
            }
        }
    } catch (error: any) {
        console.error('Fatal Error:', error.message);
        process.exit(1);
    }
};

await batch();
