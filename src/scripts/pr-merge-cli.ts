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
            draft: prData.draft || false,
            changedFiles: filesData.map(f => f.filename),
            labels: prData.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
            createdAt: new Date(prData.created_at),
            updatedAt: new Date(prData.updated_at),
        };

        logger.info(`PR title: ${pr.title}`);
        logger.info(`Changed files: ${pr.changedFiles.length}`);
        logger.info(`Draft status: ${pr.draft}`);

        // ドラフトPRの場合は、ready状態に変換
        if (pr.draft) {
            logger.info('PR is a draft, converting to ready for review...');

            const { execSync } = await import('child_process');
            try {
                execSync(`gh pr ready ${options.prNumber}`, {
                    stdio: 'pipe',
                    env: { ...process.env, GH_TOKEN: options.token }
                });
                logger.info('Successfully converted draft PR to ready for review');

                // 状態が更新されるまで待機
                let attempts = 0;
                const maxAttempts = 3;
                while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    const { data: updatedPr } = await octokit.pulls.get({
                        owner: options.owner,
                        repo: options.repo,
                        pull_number: options.prNumber,
                    });
                    if (!updatedPr.draft) {
                        logger.info('PR is now ready for review');
                        break;
                    }
                    attempts++;
                    logger.info(`Waiting for PR to be ready (attempt ${attempts}/${maxAttempts})...`);
                }
            } catch (error) {
                logger.error('Failed to convert draft PR to ready:', error);
                throw error;
            }
        }

        // 変更ファイルがない場合はPRをクローズ
        if (pr.changedFiles.length === 0) {
            logger.warn('PR has no changed files, closing...');
            await octokit.pulls.update({
                owner: options.owner,
                repo: options.repo,
                pull_number: options.prNumber,
                state: 'closed'
            });
            logger.info(`PR #${options.prNumber} closed successfully`);
            process.exit(0);
        }

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
