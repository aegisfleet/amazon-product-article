#!/usr/bin/env ts-node
/**
 * PR Merge CLI Script
 * GitHub Actions から実行されるPRマージスクリプト
 * 
 * 環境変数:
 *   GITHUB_TOKEN - GitHub トークン
 *   PR_NUMBER - マージ対象のPR番号
 *   PR_AUTHOR - PRの作成者
 */

import { Octokit } from '@octokit/rest';
import { AutoMergeManager } from '../github/AutoMergeManager';
import { PullRequest } from '../types/GitHubTypes';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

interface CLIOptions {
    token: string;
    prNumber: number;
    prAuthor: string;
    owner: string;
    repo: string;
}

function getOptions(): CLIOptions {
    const token = process.env.GITHUB_TOKEN;
    const prNumber = parseInt(process.env.PR_NUMBER || '0', 10);
    const prAuthor = process.env.PR_AUTHOR || '';
    const repository = process.env.GITHUB_REPOSITORY || '';

    if (!token) {
        throw new Error('Missing required environment variable: GITHUB_TOKEN');
    }

    if (!prNumber) {
        throw new Error('Missing required environment variable: PR_NUMBER');
    }

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
        throw new Error('Invalid GITHUB_REPOSITORY format');
    }

    return {
        token,
        prNumber,
        prAuthor,
        owner,
        repo,
    };
}

async function main(): Promise<void> {
    logger.info('Starting PR merge CLI...');

    try {
        const options = getOptions();
        logger.info(`Processing PR #${options.prNumber} by ${options.prAuthor}`);

        // GitHub API クライアントを初期化
        const octokit = new Octokit({ auth: options.token });

        // PR情報を取得
        const { data: prData } = await octokit.pulls.get({
            owner: options.owner,
            repo: options.repo,
            pull_number: options.prNumber,
        });

        // 変更ファイル一覧を取得
        const { data: filesData } = await octokit.pulls.listFiles({
            owner: options.owner,
            repo: options.repo,
            pull_number: options.prNumber,
        });

        const pr: PullRequest = {
            number: prData.number,
            title: prData.title,
            body: prData.body || '',
            head: prData.head.ref,
            base: prData.base.ref,
            author: prData.user?.login || '',
            state: prData.state as 'open' | 'closed' | 'merged',
            changedFiles: filesData.map(f => f.filename),
            labels: prData.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
            createdAt: new Date(prData.created_at),
            updatedAt: new Date(prData.updated_at),
        };

        logger.info(`PR title: ${pr.title}`);
        logger.info(`Changed files: ${pr.changedFiles.length}`);

        // AutoMergeManager で検証
        const mergeManager = new AutoMergeManager();
        const decision = mergeManager.validatePullRequest(pr);

        logger.info(`Merge decision: ${decision.shouldMerge ? 'APPROVE' : 'REJECT'}`);
        logger.info(`Reason: ${decision.reason}`);

        if (!decision.shouldMerge) {
            logger.warn('PR validation failed, skipping merge');
            for (const result of decision.validationResults) {
                logger.info(`  ${result.check}: ${result.passed ? 'PASSED' : 'FAILED'} - ${result.message}`);
            }
            process.exit(0);
        }

        // PRをマージ
        logger.info('Attempting to merge PR...');
        await octokit.pulls.merge({
            owner: options.owner,
            repo: options.repo,
            pull_number: options.prNumber,
            merge_method: 'squash',
            commit_title: `[Jules] ${prData.title}`,
        });

        logger.info(`PR #${options.prNumber} merged successfully`);
        process.exit(0);

    } catch (error) {
        logger.error('PR merge failed:', error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
