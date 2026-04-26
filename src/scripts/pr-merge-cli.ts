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
import type { PullRequest } from '../types/GitHubTypes';
import { GitCommandError, runGhCommand } from '../utils/GitCommandRunner';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

/**
 * リポジトリのブランチを削除する
 */
async function deleteBranch(octokit: Octokit, owner: string, repo: string, branch: string): Promise<void> {
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

interface CLIOptions {
  token: string;
  prNumber: number;
  prAuthor: string;
  owner: string;
  repo: string;
}

function getOptions(): CLIOptions {
  const token = process.env.GITHUB_TOKEN;
  const prNumber = Number.parseInt(process.env.PR_NUMBER || '0', 10);
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
    const codeBlockMatch = repaired.match(/^```json\n([\s\S]*?)```$/i);
    if (codeBlockMatch?.[1]) {
      repaired = codeBlockMatch[1].trim();
      modified = true;
    }
  }

  // 不正な日付形式の修正 (e.g., 2026-001-07 -> 2026-01-07)
  // 今回発生した 00X 形式の月を 0X に修正する
  const invalidDatePattern = /(\d{4}-)00(\d-\d{2})/g;
  if (invalidDatePattern.test(repaired)) {
    repaired = repaired.replaceAll(invalidDatePattern, '$10$2');
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
  sha: string,
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
  files: string[],
): Promise<{ passed: boolean; repaired?: boolean; message?: string }> {
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

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
            await repairAndPushContent(octokit, owner, repo, branch, file, repairedContent, data.sha);
            anyRepaired = true;
          } else {
            throw parseError; // 修復不能な場合はそのままエラースロー
          }
        }
      } else {
        return {
          passed: false,
          message: `Could not retrieve content for ${file}`,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        passed: false,
        message: `JSON syntax error in ${file}: ${errorMessage}`,
      };
    }
  }

  if (anyRepaired) {
    return {
      passed: false, // 修復が行われた場合、一度処理を中断して再試行されるのを待つ（またはエラー通知で知らせる）
      repaired: true,
      message: 'Invalid JSON was found and automatically repaired.',
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
  files: string[],
): Promise<{ passed: boolean; repaired?: boolean; message?: string }> {
  const mdFiles = files.filter((f) => f.endsWith('.md'));

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
            await repairAndPushContent(octokit, owner, repo, branch, file, repairedContent, data.sha);
            anyRepaired = true;
          } else {
            return {
              passed: false,
              message: `Invalid date format in ${file} that could not be auto-repaired.`,
            };
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        passed: false,
        message: `Error validating ${file}: ${errorMessage}`,
      };
    }
  }

  if (anyRepaired) {
    return {
      passed: false,
      repaired: true,
      message: 'Invalid date formats were found and automatically repaired.',
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
      state: prData.state,
      draft: prData.draft || false,
      changedFiles: filesData.map((f) => f.filename),
      labels: prData.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
      createdAt: new Date(prData.created_at),
      updatedAt: new Date(prData.updated_at),
    };

    logger.info(`PR title: ${pr.title}`);
    logger.info(`Changed files: ${pr.changedFiles.length}`);
    logger.info(`Draft status: ${pr.draft}`);

    // ドラフトPRの場合は、ready状態に変換
    if (pr.draft) {
      logger.info('PR is a draft, converting to ready for review...');

      try {
        runGhCommand(['pr', 'ready', options.prNumber.toString()], {
          stdio: 'pipe',
          env: { ...process.env, GH_TOKEN: options.token },
        });
        logger.info('Successfully converted draft PR to ready for review');

        // 状態が更新されるまで待機
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
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

      // GitHub APIが安定するまで追加で待機
      logger.info('Waiting for GitHub API to stabilize after draft conversion...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // 変更ファイルがない場合はPRをクローズ
    if (pr.changedFiles.length === 0) {
      logger.warn('PR has no changed files, closing...');
      await octokit.pulls.update({
        owner: options.owner,
        repo: options.repo,
        pull_number: options.prNumber,
        state: 'closed',
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
    const jsonValidation = await validateJsonFiles(octokit, options.owner, options.repo, pr.head, pr.changedFiles);

    if (!jsonValidation.passed) {
      if (jsonValidation.repaired) {
        logger.info('Auto-repair completed for JSON. PR will be reconsidered in the next trigger.');

        // 修復成功のコメントを残す
        await octokit.issues.createComment({
          owner: options.owner,
          repo: options.repo,
          issue_number: options.prNumber,
          body: `🛠 **Data Auto-Repair Completed**\n\n不正な形式の JSON または日付が検出されましたが、自動的に修復して更新しました。次回の実行をお待ちください。`,
        });

        process.exit(0);
      }

      logger.error(`JSON validation failed: ${jsonValidation.message}`);

      // コメントを残して異常終了
      await octokit.issues.createComment({
        owner: options.owner,
        repo: options.repo,
        issue_number: options.prNumber,
        body: `❌ **JSON Validation Failed**\n\n${jsonValidation.message}\n\nこのエラーを修正するまで自動マージは行われません。`,
      });

      process.exit(1);
    }

    // Markdownファイルの日付をチェック
    const mdValidation = await validateMarkdownFiles(octokit, options.owner, options.repo, pr.head, pr.changedFiles);

    if (!mdValidation.passed) {
      if (mdValidation.repaired) {
        logger.info('Auto-repair completed for Markdown. PR will be reconsidered in the next trigger.');

        await octokit.issues.createComment({
          owner: options.owner,
          repo: options.repo,
          issue_number: options.prNumber,
          body: `🛠 **Markdown Auto-Repair Completed**\n\n日付形式の異常が検出されましたが、自動的に修復して更新しました。次回の実行をお待ちください。`,
        });

        process.exit(0);
      }

      logger.error(`Markdown validation failed: ${mdValidation.message}`);
      await octokit.issues.createComment({
        owner: options.owner,
        repo: options.repo,
        issue_number: options.prNumber,
        body: `❌ **Markdown Validation Failed**\n\n${mdValidation.message}`,
      });
      process.exit(1);
    }

    // PRを自動マージに設定
    // GitHub CLI (gh) を使用して auto-merge を有効化
    // 検証が済んでいるので、後はGitHubプラットフォームに任せる
    logger.info('Enabling auto-merge for the PR...');

    const maxRetries = 10;
    const retryDelayMs = 10000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // gh pr merge <number> --squash --auto --delete-branch --subject "<title>"
        // Note: GITHUB_TOKEN is usually automatically picked up by gh if set in env as GH_TOKEN or GITHUB_TOKEN
        // We ensure GH_TOKEN is set to options.token

        // Capture output to detect specific GraphQL errors
        runGhCommand(
          [
            'pr',
            'merge',
            options.prNumber.toString(),
            '--squash',
            '--auto',
            '--delete-branch',
            '--subject',
            prData.title,
          ],
          {
            stdio: 'pipe',
            env: { ...process.env, GH_TOKEN: options.token },
          },
        );

        logger.info(`Auto-merge enabled for PR #${options.prNumber}`);
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const stderr = error instanceof GitCommandError ? error.stderr : '';

        // Check for "Protected branch rules not configured" error
        // This happens when auto-merge is requested but no protection rules exist on the base branch.
        // In this case, we can safely fallback to immediate merge since we've already done our own validation.
        if (stderr.includes('Protected branch rules not configured')) {
          logger.warn('Auto-merge is not available because no branch protection rules are configured.');
          logger.info('Falling back to immediate merge...');

          try {
            runGhCommand(
              ['pr', 'merge', options.prNumber.toString(), '--squash', '--delete-branch', '--subject', prData.title],
              {
                stdio: 'inherit',
                env: { ...process.env, GH_TOKEN: options.token },
              },
            );
            logger.info(`PR #${options.prNumber} merged immediately (fallback)`);
            lastError = null;
            break;
          } catch (mergeError) {
            logger.error('Fallback immediate merge failed:', mergeError);
            lastError = mergeError instanceof Error ? mergeError : new Error(String(mergeError));
          }
        }

        if (attempt < maxRetries) {
          logger.warn(`Auto-merge failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    if (lastError) {
      logger.error('Failed to enable auto-merge after retries:', lastError);
      // 失敗しても検証自体はパスしているので、プロセスは成功として終了させるか検討の余地があるが
      // マージ設定ができないのはCIとしては失敗なので exit 1 とする
      process.exit(1);
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
