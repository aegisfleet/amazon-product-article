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
    const codeBlockMatch = /^```json\n([\s\S]*?)```$/i.exec(repaired);
    if (codeBlockMatch?.[1]) {
      repaired = codeBlockMatch[1].trim();
      modified = true;
    }
  }

  // 不正な日付形式の修正 (e.g., 2026-001-07 -> 2026-01-07)
  // 今回発生した 00X 形式の月を 0X に修正する
  const invalidDatePattern = /(\d{4}-)00(\d-\d{2})/g;
  if (invalidDatePattern.test(repaired)) {
    repaired = repaired.replaceAll(invalidDatePattern, (_, p1, p2) => `${p1}0${p2}`);
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
 * 単一のJSONファイルを検証し、必要に応じて修復する
 */
async function validateAndRepairSingleJson(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  file: string,
): Promise<{ passed: boolean; repaired?: boolean; message?: string }> {
  try {
    logger.info(`  Checking: ${file}`);
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: file,
      ref: branch,
    });

    if (!('content' in data && typeof data.content === 'string')) {
      return { passed: false, message: `Could not retrieve content for ${file}` };
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    try {
      JSON.parse(content);
      return { passed: true };
    } catch (parseError) {
      // 自動修復を試みる
      const repairedContent = tryRepairContent(content, file);
      if (repairedContent) {
        await repairAndPushContent(octokit, owner, repo, branch, file, repairedContent, data.sha);
        return { passed: false, repaired: true };
      }
      throw parseError; // 修復不能な場合はそのままエラースロー
    }
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 404) {
      logger.info(`  File ${file} not found (likely deleted in PR). Skipping validation.`);
      return { passed: true };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      message: `JSON syntax error in ${file}: ${errorMessage}`,
    };
  }
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
    const result = await validateAndRepairSingleJson(octokit, owner, repo, branch, file);
    if (!result.passed) {
      if (result.repaired) {
        anyRepaired = true;
        continue;
      }
      return result;
    }
  }

  if (anyRepaired) {
    return {
      passed: false,
      repaired: true,
      message: 'Invalid JSON was found and automatically repaired.',
    };
  }

  logger.info('All JSON files are valid');
  return { passed: true };
}

/**
 * 単一のMarkdownファイルを検証し、必要に応じて修復する
 */
async function validateAndRepairSingleMarkdown(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  file: string,
): Promise<{ passed: boolean; repaired?: boolean; message?: string }> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: file,
      ref: branch,
    });

    if (!('content' in data && typeof data.content === 'string')) {
      return { passed: true };
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const invalidDatePattern = /(\d{4}-)00(\d-\d{2})/;

    if (!invalidDatePattern.test(content)) {
      return { passed: true };
    }

    logger.warn(`  Invalid date detected in ${file}`);
    const repairedContent = tryRepairContent(content, file);

    if (repairedContent) {
      await repairAndPushContent(octokit, owner, repo, branch, file, repairedContent, data.sha);
      return { passed: false, repaired: true };
    }

    return {
      passed: false,
      message: `Invalid date format in ${file} that could not be auto-repaired.`,
    };
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 404) {
      logger.info(`  File ${file} not found (likely deleted in PR). Skipping validation.`);
      return { passed: true };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      message: `Error validating ${file}: ${errorMessage}`,
    };
  }
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
    const result = await validateAndRepairSingleMarkdown(octokit, owner, repo, branch, file);
    if (!result.passed) {
      if (result.repaired) {
        anyRepaired = true;
        continue;
      }
      return result;
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

/**
 * PR情報と変更ファイルリストを取得し、PullRequestオブジェクトを構築する
 */
async function fetchPullRequest(octokit: Octokit, options: CLIOptions): Promise<PullRequest> {
  const { data: prData } = await octokit.pulls.get({
    owner: options.owner,
    repo: options.repo,
    pull_number: options.prNumber,
  });

  const { data: filesData } = await octokit.pulls.listFiles({
    owner: options.owner,
    repo: options.repo,
    pull_number: options.prNumber,
  });

  return {
    number: prData.number,
    title: prData.title,
    body: prData.body || '',
    head: prData.head.ref,
    base: prData.base.ref,
    author: prData.user?.login || '',
    state: prData.state as 'open' | 'closed' | 'merged',
    draft: prData.draft || false,
    changedFiles: filesData.map((f) => f.filename),
    labels: prData.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
    createdAt: new Date(prData.created_at),
    updatedAt: new Date(prData.updated_at),
  };
}

/**
 * ドラフトPRを ready for review に変換し、APIが反映されるまで待機する
 */
async function handleDraftPr(octokit: Octokit, options: CLIOptions): Promise<void> {
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
        return;
      }
      attempts++;
      logger.info(`Waiting for PR to be ready (attempt ${attempts}/${maxAttempts})...`);
    }
  } catch (error) {
    logger.error('Failed to convert draft PR to ready:', error);
    throw error;
  }

  // 最終的な待機（API反映の安定化）
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

/**
 * 変更ファイルがない場合にPRをクローズし、ブランチを削除する
 */
async function handleNoChangedFiles(octokit: Octokit, options: CLIOptions, headBranch: string): Promise<void> {
  logger.warn('PR has no changed files, closing...');
  await octokit.pulls.update({
    owner: options.owner,
    repo: options.repo,
    pull_number: options.prNumber,
    state: 'closed',
  });
  logger.info(`PR #${options.prNumber} closed successfully`);

  await deleteBranch(octokit, options.owner, options.repo, headBranch);
}

/**
 * バリデーション結果に基づいてコメント投稿やプロセス終了を判断する
 */
async function processValidationResult(
  octokit: Octokit,
  options: CLIOptions,
  result: { passed: boolean; repaired?: boolean; message?: string },
  type: 'JSON' | 'Markdown',
): Promise<boolean> {
  if (result.passed) return true;

  if (result.repaired) {
    logger.info(`Auto-repair completed for ${type}. PR will be reconsidered in the next trigger.`);
    await octokit.issues.createComment({
      owner: options.owner,
      repo: options.repo,
      issue_number: options.prNumber,
      body: `🛠 **${type} Auto-Repair Completed**\n\n不正な形式が検出されましたが、自動的に修復して更新しました。次回の実行をお待ちください。`,
    });
    return false;
  }

  logger.error(`${type} validation failed: ${result.message}`);
  await octokit.issues.createComment({
    owner: options.owner,
    repo: options.repo,
    issue_number: options.prNumber,
    body: `❌ **${type} Validation Failed**\n\n${result.message}\n\nこのエラーを修正するまで自動マージは行われません。`,
  });
  return false;
}

/**
 * ブランチ保護ルールがない場合の即時マージ（フォールバック）を実行する
 */
function tryImmediateMergeFallback(options: CLIOptions, prTitle: string): void {
  logger.warn('Auto-merge is not available because no branch protection rules are configured.');
  logger.info('Falling back to immediate merge...');

  try {
    runGhCommand(['pr', 'merge', options.prNumber.toString(), '--squash', '--delete-branch', '--subject', prTitle], {
      stdio: 'inherit',
      env: { ...process.env, GH_TOKEN: options.token },
    });
    logger.info(`PR #${options.prNumber} merged immediately (fallback)`);
  } catch (error) {
    logger.error('Fallback immediate merge failed:', error);
    throw error;
  }
}

/**
 * 1回分のマージ試行を実行する
 * @returns 成功（またはフォールバック成功）した場合は true
 */
function attemptMergeIteration(options: CLIOptions, prTitle: string): boolean {
  try {
    runGhCommand(
      ['pr', 'merge', options.prNumber.toString(), '--squash', '--auto', '--delete-branch', '--subject', prTitle],
      {
        stdio: 'pipe',
        env: { ...process.env, GH_TOKEN: options.token },
      },
    );

    logger.info(`Auto-merge enabled for PR #${options.prNumber}`);
    return true;
  } catch (error) {
    const stderr = error instanceof GitCommandError ? error.stderr : '';

    // ブランチ保護ルールがない場合は即時マージを試行
    if (stderr.includes('Protected branch rules not configured')) {
      tryImmediateMergeFallback(options, prTitle);
      return true;
    }

    throw error;
  }
}

/**
 * 自動マージの設定を試行する（リトライとフォールバック含む）
 */
async function enableAutoMergeWithRetry(_octokit: Octokit, options: CLIOptions, prTitle: string): Promise<void> {
  logger.info('Enabling auto-merge for the PR...');

  const maxRetries = 10;
  const retryDelayMs = 10000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attemptMergeIteration(options, prTitle)) {
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        logger.warn(`Auto-merge failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
}

/**
 * マージ可否判定の結果を処理する
 */
function handleMergeDecision(decision: {
  shouldMerge: boolean;
  reason?: string;
  validationResults: { check: string; passed: boolean; message?: string }[];
}): void {
  logger.info(`Merge decision: ${decision.shouldMerge ? 'APPROVE' : 'REJECT'}`);
  if (!decision.shouldMerge) {
    logger.warn(`PR validation failed: ${decision.reason}`);
    for (const r of decision.validationResults) {
      logger.info(`  ${r.check}: ${r.passed ? 'OK' : 'FAIL'} - ${r.message}`);
    }
    process.exit(0);
  }
}

/**
 * PR に含まれるコンテンツ（JSON、Markdown）の整合性を検証する
 */
async function validatePrContents(octokit: Octokit, options: CLIOptions, pr: PullRequest): Promise<void> {
  const jsonResult = await validateJsonFiles(octokit, options.owner, options.repo, pr.head, pr.changedFiles);
  if (!(await processValidationResult(octokit, options, jsonResult, 'JSON'))) {
    process.exit(jsonResult.repaired ? 0 : 1);
  }

  const mdResult = await validateMarkdownFiles(octokit, options.owner, options.repo, pr.head, pr.changedFiles);
  if (!(await processValidationResult(octokit, options, mdResult, 'Markdown'))) {
    process.exit(mdResult.repaired ? 0 : 1);
  }
}

async function main(): Promise<void> {
  logger.info('Starting PR merge CLI...');

  try {
    const options = getOptions();
    logger.info(`Processing PR #${options.prNumber} by ${options.prAuthor}`);

    const octokit = new Octokit({ auth: options.token });
    const pr = await fetchPullRequest(octokit, options);

    logger.info(`PR title: ${pr.title}`);
    logger.info(`Changed files: ${pr.changedFiles.length}`);
    logger.info(`Draft status: ${pr.draft}`);

    // ドラフトPRの処理
    if (pr.draft) {
      await handleDraftPr(octokit, options);
    }

    // 変更ファイルがない場合の処理
    if (pr.changedFiles.length === 0) {
      await handleNoChangedFiles(octokit, options, pr.head);
      process.exit(0);
    }

    // AutoMergeManager で検証
    const mergeManager = new AutoMergeManager();
    const decision = mergeManager.validatePullRequest(pr);
    handleMergeDecision(decision);

    // コンテンツのバリデーション
    await validatePrContents(octokit, options, pr);

    // 自動マージ有効化
    await enableAutoMergeWithRetry(octokit, options, pr.title);

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
