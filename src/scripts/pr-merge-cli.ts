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

// リトライ設定
const MAX_MERGE_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000;  // 2秒

/**
 * 指定時間待機する
 */
async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Base branch変更エラーかどうかを判定
 */
function isBaseBranchModifiedError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = String((error as { message: string }).message);
        return message.includes('Base branch was modified');
    }
    return false;
}

/**
 * PRブランチをbase branchから更新する
 */
async function updatePullRequestBranch(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number
): Promise<boolean> {
    try {
        logger.info(`Updating PR branch from base branch...`);
        await octokit.pulls.updateBranch({
            owner,
            repo,
            pull_number: pullNumber,
        });
        logger.info('PR branch updated successfully');
        return true;
    } catch (error) {
        logger.warn('Failed to update PR branch:', error);
        return false;
    }
}

/**
 * リトライ付きでPRをマージする
 */
async function mergeWithRetry(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number,
    commitTitle: string
): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_MERGE_RETRIES; attempt++) {
        try {
            logger.info(`Attempting to merge PR (attempt ${attempt}/${MAX_MERGE_RETRIES})...`);
            await octokit.pulls.merge({
                owner,
                repo,
                pull_number: pullNumber,
                merge_method: 'squash',
                commit_title: commitTitle,
            });
            logger.info(`PR #${pullNumber} merged successfully`);
            return;
        } catch (error) {
            lastError = error;

            if (isBaseBranchModifiedError(error)) {
                logger.warn(`Merge failed: Base branch was modified (attempt ${attempt}/${MAX_MERGE_RETRIES})`);

                if (attempt < MAX_MERGE_RETRIES) {
                    // 指数バックオフで待機
                    const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    logger.info(`Waiting ${delayMs}ms before retry...`);
                    await sleep(delayMs);

                    // PRブランチを更新
                    const updated = await updatePullRequestBranch(octokit, owner, repo, pullNumber);
                    if (!updated) {
                        logger.warn('Branch update failed, but will still retry merge');
                    }

                    // 更新後の状態が安定するまで待機
                    await sleep(1000);
                }
            } else {
                // Base branch変更以外のエラーはリトライしない
                throw error;
            }
        }
    }

    // 全リトライ失敗
    throw lastError;
}

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

        // PRをマージ（リトライ付き）
        await mergeWithRetry(
            octokit,
            options.owner,
            options.repo,
            options.prNumber,
            `[Jules] ${prData.title}`
        );

        // マージ完了後、ブランチを削除（GitHubの設定で自動削除されない場合の保険）
        try {
            logger.info(`Deleting head branch: ${pr.head}...`);
            await octokit.git.deleteRef({
                owner: options.owner,
                repo: options.repo,
                ref: `heads/${pr.head}`,
            });
            logger.info(`Head branch ${pr.head} deleted successfully`);
        } catch (error) {
            // ブランチ削除の失敗は致命的ではないため、ログを出力して続行
            // GitHubの設定ですでに削除されている場合などが考えられる
            logger.warn(`Failed to delete head branch ${pr.head}:`, error);
        }
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
