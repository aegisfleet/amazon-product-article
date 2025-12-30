#!/usr/bin/env ts-node
/**
 * Maintenance Script: Find Oldest Investigated Product
 * data/investigations 配下のJSONから lastInvestigated が最も古いファイルを特定し、
 * そのASINを出力する (GitHub Actionsで利用するため)
 */

import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

interface InvestigationData {
    analysis: {
        lastInvestigated: string; // YYYY-MM-DD
    };
}

async function main(): Promise<void> {
    const investigationsDir = path.join(process.cwd(), 'data', 'investigations');

    try {
        const files = await fs.readdir(investigationsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            logger.warn('No investigation files found.');
            return;
        }

        let oldestAsin: string | null = null;
        let oldestDate: Date | null = null;

        for (const file of jsonFiles) {
            const filePath = path.join(investigationsDir, file);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const data = JSON.parse(content) as InvestigationData;

                if (data.analysis && data.analysis.lastInvestigated) {
                    const date = new Date(data.analysis.lastInvestigated);

                    if (!oldestDate || date < oldestDate) {
                        oldestDate = date;
                        oldestAsin = path.basename(file, '.json');
                    }
                }
            } catch (err) {
                logger.error(`Failed to read or parse ${file}:`, err);
            }
        }

        if (oldestAsin) {
            // GitHub Actions のステップ出力用にASINのみを標準出力に出力
            console.log(oldestAsin);
            // ログは標準エラー出力に出して、標準出力を汚さないようにする
            console.error(`Found oldest product: ${oldestAsin} (Last investigated: ${oldestDate?.toISOString().split('T')[0]})`);
        } else {
            logger.warn('No valid investigation data found.');
        }

    } catch (error) {
        logger.error('Failed to scan investigations directory:', error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
