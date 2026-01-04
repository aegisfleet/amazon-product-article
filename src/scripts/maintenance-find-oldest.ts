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

    const args = process.argv.slice(2);
    const countIndex = args.indexOf('--count');
    const limitValue = countIndex !== -1 ? args[countIndex + 1] : undefined;
    const limit = limitValue ? parseInt(limitValue, 10) : 1;

    try {
        const files = await fs.readdir(investigationsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            logger.warn('No investigation files found.');
            return;
        }

        const entries: Array<{ asin: string, date: Date }> = [];

        for (const file of jsonFiles) {
            const filePath = path.join(investigationsDir, file);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const data = JSON.parse(content) as InvestigationData;

                if (data.analysis && data.analysis.lastInvestigated) {
                    const date = new Date(data.analysis.lastInvestigated);
                    entries.push({
                        asin: path.basename(file, '.json'),
                        date: date
                    });
                }
            } catch (err) {
                logger.error(`Failed to read or parse ${file}:`, err);
            }
        }

        if (entries.length > 0) {
            // 日付が古い順にソート
            entries.sort((a, b) => a.date.getTime() - b.date.getTime());

            // 指定された件数分取得
            const selectedEntries = entries.slice(0, limit);
            const asins = selectedEntries.map(e => e.asin);

            // GitHub Actions のステップ出力用にASINをカンマ区切りで標準出力に出力
            console.log(asins.join(','));

            // ログは標準エラー出力に出して、標準出力を汚さないようにする
            console.error(`Found ${asins.length} oldest products: ${asins.join(', ')}`);
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
