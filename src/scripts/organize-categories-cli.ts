#!/usr/bin/env ts-node
/**
 * Category Organization CLI Script
 * GitHub Actions から実行されるカテゴリ整理スクリプト
 *
 * 毎日18:00 JSTに実行され、「その他」に分類されているカテゴリを
 * JulesAPIを使って適切な親カテゴリに整理する
 *
 * 環境変数:
 *   JULES_API_KEY - Jules API キー
 *   JULES_SOURCE - Jules ソース名 (例: sources/github/owner/repo)
 *   JULES_STARTING_BRANCH - 開始ブランチ (デフォルト: main)
 */

import fs from 'fs/promises';
import path from 'path';
import { JulesCategoryOrganizer, OrganizationSession } from '../jules/JulesCategoryOrganizer';
import { JulesCredentials, SourceContext } from '../types/JulesTypes';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

interface CLIOptions {
    apiKey: string;
    source: string;
    startingBranch: string;
}

function getOptions(): CLIOptions {
    const apiKey = process.env.JULES_API_KEY;
    const source = process.env.JULES_SOURCE;
    const startingBranch = process.env.JULES_STARTING_BRANCH || 'main';

    if (!apiKey) {
        throw new Error('Missing required environment variable: JULES_API_KEY. Please set it in your .env file or environment.');
    }

    if (!source) {
        throw new Error('Missing required environment variable: JULES_SOURCE (e.g., sources/github/owner/repo). Please ensure it is correctly configured.');
    }

    return {
        apiKey,
        source,
        startingBranch,
    };
}

async function saveSessionInfo(session: OrganizationSession): Promise<void> {
    const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    const filename = `category-organization-${Date.now()}.json`;
    const filePath = path.join(sessionsDir, filename);

    await fs.writeFile(filePath, JSON.stringify({
        type: 'category-organization',
        session: {
            sessionId: session.sessionId,
            sessionName: session.sessionName,
        },
        unregisteredCategories: session.unregisteredCategories,
        status: 'started',
        startedAt: session.startedAt.toISOString(),
        timestamp: new Date().toISOString(),
    }, null, 2));

    logger.info(`Session info saved: ${filename}`);
}

async function setGitHubOutput(name: string, value: string): Promise<void> {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        await fs.appendFile(outputFile, `${name}=${value}\n`);
        logger.info(`Set GitHub output: ${name}=${value}`);
    } else {
        console.log(`::set-output name=${name}::${value}`);
    }
}

async function main(): Promise<void> {
    logger.info('Starting category organization CLI...');

    try {
        const options = getOptions();
        logger.info(`Source: ${options.source}`);
        logger.info(`Starting Branch: ${options.startingBranch}`);

        // Jules Category Organizer を初期化
        const credentials: JulesCredentials = {
            apiKey: options.apiKey,
        };
        const organizer = new JulesCategoryOrganizer(credentials);

        // 未登録カテゴリの確認
        const unregisteredCategories = organizer.getUnregisteredCategories();

        if (unregisteredCategories.length === 0) {
            logger.info('No unregistered categories found. Nothing to organize.');
            await setGitHubOutput('categories-found', '0');
            await setGitHubOutput('session-started', 'false');
            process.exit(0);
        }

        logger.info(`Found ${unregisteredCategories.length} unregistered categories:`);
        // 最初の20件を表示
        for (const category of unregisteredCategories.slice(0, 20)) {
            logger.info(`  - ${category}`);
        }
        if (unregisteredCategories.length > 20) {
            logger.info(`  ... and ${unregisteredCategories.length - 20} more`);
        }

        // ソースコンテキストを作成
        const sourceContext: SourceContext = {
            source: options.source,
            githubRepoContext: {
                startingBranch: options.startingBranch,
            },
        };

        // カテゴリ整理セッションを開始
        logger.info('Starting Jules category organization session...');
        const session = await organizer.startOrganization(sourceContext);

        await saveSessionInfo(session);

        // GitHub Actions 出力を設定
        await setGitHubOutput('categories-found', unregisteredCategories.length.toString());
        await setGitHubOutput('session-started', 'true');
        await setGitHubOutput('session-id', session.sessionId);

        logger.info(`Category organization session started successfully!`);
        logger.info(`Session ID: ${session.sessionId}`);
        logger.info(`Session Name: ${session.sessionName}`);
        logger.info(`Categories to organize: ${unregisteredCategories.length}`);
        logger.info('Note: Jules will create a PR asynchronously. Check GitHub for PR creation.');

        process.exit(0);

    } catch (error) {
        if (error instanceof Error && error.message === 'No unregistered categories to organize') {
            logger.info('No categories need organization. Exiting cleanly.');
            await setGitHubOutput('categories-found', '0');
            await setGitHubOutput('session-started', 'false');
            process.exit(0);
        }

        logger.error('Category organization failed:', error);
        await setGitHubOutput('categories-found', '0');
        await setGitHubOutput('session-started', 'false');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
