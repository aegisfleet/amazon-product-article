import axios from 'axios';
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
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

const STATE_FILE = path.join(process.cwd(), 'data', 'indexing-state.json');

interface IndexingState {
    lastIndexed: { [url: string]: string }; // ISO date string
}

const loadState = (): IndexingState => {
    if (fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        } catch (e) {
            console.warn('Failed to parse state file, starting fresh.', e);
        }
    }
    return { lastIndexed: {} };
};

const pruneState = (state: IndexingState) => {
    const now = new Date();
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    let prunedCount = 0;

    for (const url in state.lastIndexed) {
        const lastIndexedStr = state.lastIndexed[url];
        if (lastIndexedStr) {
            const lastIndexed = new Date(lastIndexedStr).getTime();
            if ((now.getTime() - lastIndexed) > NINETY_DAYS_MS) {
                delete state.lastIndexed[url];
                prunedCount++;
            }
        }
    }
    if (prunedCount > 0) {
        console.log(`Pruned ${prunedCount} old entries from indexing state.`);
    }
};

const saveState = (state: IndexingState) => {
    try {
        pruneState(state);
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save state file.', e);
    }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Sort URLs by staleness (least recently indexed first)
// URLs never indexed will appear first (undefined date < any date)
const getCandidateUrls = (urls: string[], state: IndexingState): string[] => {
    const uniqueUrls = [...new Set(urls)];
    const now = new Date();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    uniqueUrls.sort((a, b) => {
        const dateA = state.lastIndexed[a] ? new Date(state.lastIndexed[a]).getTime() : 0;
        const dateB = state.lastIndexed[b] ? new Date(state.lastIndexed[b]).getTime() : 0;
        return dateA - dateB;
    });
    const sortedUrls = uniqueUrls;

    // Filter out recently indexed URLs
    return sortedUrls.filter(url => {
        const lastIndexedStr = state.lastIndexed[url];
        if (!lastIndexedStr) return true;
        const lastIndexed = new Date(lastIndexedStr).getTime();
        return (now.getTime() - lastIndexed) > THREE_DAYS_MS;
    });
};

const fetchSitemapUrls = async (): Promise<string[]> => {
    const sitemapUrl = 'https://amazon-hikaku.com/sitemap.xml';
    const urls: string[] = [];
    try {
        console.log(`Fetching sitemap from: ${sitemapUrl}`);
        const response = await axios.get(sitemapUrl);
        const result = await parseStringPromise(response.data);
        const sitemapUrls = result?.urlset?.url?.map((entry: any) => entry.loc[0]);
        if (sitemapUrls) {
            console.log(`Found ${sitemapUrls.length} URLs in sitemap.`);
            urls.push(...sitemapUrls);
        }
    } catch (error: any) {
        console.error(`Warning: Failed to fetch or parse sitemap: ${error.message}`);
    }
    return urls;
};

const processUrl = async (jwtClient: any, url: string): Promise<'SUCCESS' | 'QUOTA_EXCEEDED' | 'SKIPPED' | 'FAILED'> => {
    let retries = 3;
    while (retries > 0) {
        try {
            const result = await google.indexing('v3').urlNotifications.publish({
                auth: jwtClient,
                requestBody: { url: url, type: 'URL_UPDATED' },
            });
            console.log(`Success: ${result.status}`);
            return 'SUCCESS';
        } catch (err: any) {
            const status = err.code || err.response?.status;
            const message = err.message || JSON.stringify(err.response?.data);

            console.error(`Error indexing ${url}: ${status} - ${message}`);

            if (status === 429) {
                if (message.includes('Publish requests per day')) {
                    console.error('Daily quota exceeded. Stopping execution.');
                    return 'QUOTA_EXCEEDED';
                }
                console.log(`Rate limit exceeded (backoff). Retrying... (${retries} left)`);
                await sleep(2000 * (4 - retries));
            } else if (status >= 500) {
                console.log(`Server error ${status}. Retrying... (${retries} left)`);
                await sleep(2000 * (4 - retries));
            } else {
                console.error(`Non-retriable error for ${url}. Skipping.`);
                return 'SKIPPED';
            }
        }
        retries--;
    }
    return 'FAILED';
};

const batch = async () => {
    try {
        await jwtClient.authorize();
        console.log('Successfully authorized with Google Indexing API.');

        const urls: string[] = [];
        const args = process.argv.slice(2);
        if (args.length > 0) {
            urls.push(...args);
        }

        const sitemapUrls = await fetchSitemapUrls();
        urls.push(...sitemapUrls);

        if (urls.length === 0) {
            console.log('No URLs provided for indexing.');
            return;
        }

        const state = loadState();
        const candidates = getCandidateUrls(urls, state);
        console.log(`Candidates for indexing (older than 3 days or new): ${candidates.length}`);

        const batchSize = 180;
        const toIndex = candidates.slice(0, batchSize);

        if (toIndex.length === 0) {
            console.log('No URLs need indexing at this time.');
            return;
        }

        console.log(`Processing top ${toIndex.length} URLs...`);

        for (const url of toIndex) {
            console.log(`Requesting indexing for: ${url}`);
            const result = await processUrl(jwtClient, url);

            if (result === 'SUCCESS') {
                state.lastIndexed[url] = new Date().toISOString();
                await sleep(1500);
            } else if (result === 'QUOTA_EXCEEDED') {
                saveState(state);
                return;
            }
        }

        saveState(state);
        console.log('Batch processing complete.');

    } catch (error: any) {
        console.error('Fatal Error:', error.message);
        process.exit(1);
    }
};

try {
    await batch();
} catch (error) {
    console.error(error);
    process.exit(1);
}
