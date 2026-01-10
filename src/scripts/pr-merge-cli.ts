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
 * リポジトリのブランチを削除する
 */
async function deleteBranch(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string
): Promise<void> {
    try {
        logger.info(`Deleting head branch: ${branch}...`);
        await octokit.git.deleteRef({
            owner,
            repo,
            ref: `heads/${branch}`,
        });
        logger.info(`Head branch ${branch} deleted successfully`);
    } catch (error) {
        // ブランチ削除の失敗は致命的ではないため、ログを出力して続行
        // GitHubの設定ですでに削除されている場合などが考えられる
        logger.warn(`Failed to delete head branch ${branch}:`, error);
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

/**
 * コンテンツの修復を試みる（JSON/日付形式など）
 */
function tryRepairContent(content: string, fileName: string): string | null {
    let repaired = content.trim();
    let modified = false;

    // JSON かつ Markdownコードブロックに含まれている場合の除去
    if (fileName.endsWith('.json')) {
        const codeBlockMatch = repaired.match(/^```json\s*([\s\S]*?)\s*```$/i);
        if (codeBlockMatch && codeBlockMatch[1]) {
            repaired = codeBlockMatch[1].trim();
            modified = true;
        }
    }

    // 不正な日付形式の修正 (e.g., 2026-001-07 -> 2026-01-07)
    // 今回発生した 00X 形式の月を 0X に修正する
    const invalidDatePattern = /(\d{4}-)00(\d-\d{2})/g;
    if (invalidDatePattern.test(repaired)) {
        repaired = repaired.replace(invalidDatePattern, '$10$2');
        modified = true;
    }

    // JSONの場合は最後にパースチェック
    if (fileName.endsWith('.json')) {
        try {
            JSON.parse(repaired);
        } catch {
            return null;
        }
    }

    return modified ? repaired : null;
}

/**
 * 修正されたコンテンツをリポジトリにPushする
 */
async function repairAndPushContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    content: string,
    sha: string
): Promise<void> {
    logger.info(`  Repairing ${path}...`);
    await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `chore: repair invalid format/date in ${path} [skip ci]`,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha,
    });
    logger.info(`  Successfully repaired and pushed: ${path}`);
}

/**
 * PRに含まれるJSONファイルの妥当性を検証（および必要に応じて修復）する
 */
async function validateJsonFiles(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
    files: string[]
): Promise<{ passed: boolean; repaired?: boolean; message?: string }> {
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
        return { passed: true };
    }

    logger.info(`Validating ${jsonFiles.length} JSON file(s)...`);

    let anyRepaired = false;

    for (const file of jsonFiles) {
        try {
            logger.info(`  Checking: ${file}`);
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: file,
                ref: branch,
            });

            if ('content' in data && typeof data.content === 'string') {
                const content = Buffer.from(data.content, 'base64').toString('utf-8');

                try {
                    JSON.parse(content);
                } catch (parseError) {
                    // 自動修復を試みる
                    const repairedContent = tryRepairContent(content, file);

                    if (repairedContent) {
                        await repairAndPushContent(
                            octokit,
                            owner,
                            repo,
                            branch,
                            file,
                            repairedContent,
                            data.sha
                        );
                        anyRepaired = true;
                    } else {
                        throw parseError; // 修復不能な場合はそのままエラースロー
                    }
                }
            } else {
                return {
                    passed: false,
                    message: `Could not retrieve content for ${file}`
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                passed: false,
                message: `JSON syntax error in ${file}: ${errorMessage}`
            };
        }
    }

    if (anyRepaired) {
        return {
            passed: false, // 修復が行われた場合、一度処理を中断して再試行されるのを待つ（またはエラー通知で知らせる）
            repaired: true,
            message: 'Invalid JSON was found and automatically repaired.'
        };
    }

    logger.info('All JSON files are valid');
    return { passed: true };
}

/**
 * PRに含まれるMarkdownファイルの日付妥当性を検証（および必要に応じて修復）する
 */
async function validateMarkdownFiles(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
    files: string[]
): Promise<{ passed: boolean; repaired?: boolean; message?: string }> {
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
        return { passed: true };
    }

    logger.info(`Validating ${mdFiles.length} Markdown file(s)...`);

    let anyRepaired = false;

    for (const file of mdFiles) {
        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: file,
                ref: branch,
            });

            if ('content' in data && typeof data.content === 'string') {
                const content = Buffer.from(data.content, 'base64').toString('utf-8');

                // 日付の形式チェック ( Hugo が受け付けない形式を検出 )
                // last_investigated: "2026-001-07" など
                const invalidDatePattern = /(\d{4}-)00(\d-\d{2})/;
                if (invalidDatePattern.test(content)) {
                    logger.warn(`  Invalid date detected in ${file}`);
                    const repairedContent = tryRepairContent(content, file);

                    if (repairedContent) {
                        await repairAndPushContent(
                            octokit,
                            owner,
                            repo,
                            branch,
                            file,
                            repairedContent,
                            data.sha
                        );
                        anyRepaired = true;
                    } else {
                        return {
                            passed: false,
                            message: `Invalid date format in ${file} that could not be auto-repaired.`
                        };
                    }
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                passed: false,
                message: `Error validating ${file}: ${errorMessage}`
            };
        }
    }

    if (anyRepaired) {
        return {
            passed: false,
            repaired: true,
            message: 'Invalid date formats were found and automatically repaired.'
        };
    }

    return { passed: true };
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

            // ブランチも削除
            await deleteBranch(octokit, options.owner, options.repo, pr.head);

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

        // JSONファイルの妥当性をチェック
        const jsonValidation = await validateJsonFiles(
            octokit,
            options.owner,
            options.repo,
            pr.head,
            pr.changedFiles
        );

        if (!jsonValidation.passed) {
            if (jsonValidation.repaired) {
                logger.info('Auto-repair completed for JSON. PR will be reconsidered in the next trigger.');

                // 修復成功のコメントを残す
                await octokit.issues.createComment({
                    owner: options.owner,
                    repo: options.repo,
                    issue_number: options.prNumber,
                    body: `🛠 **Data Auto-Repair Completed**\n\n不正な形式の JSON または日付が検出されましたが、自動的に修復して更新しました。次回の実行をお待ちください。`
                });

                process.exit(0);
            }

            logger.error(`JSON validation failed: ${jsonValidation.message}`);

            // コメントを残して異常終了
            await octokit.issues.createComment({
                owner: options.owner,
                repo: options.repo,
                issue_number: options.prNumber,
                body: `❌ **JSON Validation Failed**\n\n${jsonValidation.message}\n\nこのエラーを修正するまで自動マージは行われません。`
            });

            process.exit(1);
        }

        // Markdownファイルの日付をチェック
        const mdValidation = await validateMarkdownFiles(
            octokit,
            options.owner,
            options.repo,
            pr.head,
            pr.changedFiles
        );

        if (!mdValidation.passed) {
            if (mdValidation.repaired) {
                logger.info('Auto-repair completed for Markdown. PR will be reconsidered in the next trigger.');

                await octokit.issues.createComment({
                    owner: options.owner,
                    repo: options.repo,
                    issue_number: options.prNumber,
                    body: `🛠 **Markdown Auto-Repair Completed**\n\n日付形式の異常が検出されましたが、自動的に修復して更新しました。次回の実行をお待ちください。`
                });

                process.exit(0);
            }

            logger.error(`Markdown validation failed: ${mdValidation.message}`);
            await octokit.issues.createComment({
                owner: options.owner,
                repo: options.repo,
                issue_number: options.prNumber,
                body: `❌ **Markdown Validation Failed**\n\n${mdValidation.message}`
            });
            process.exit(1);
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
        await deleteBranch(octokit, options.owner, options.repo, pr.head);
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
