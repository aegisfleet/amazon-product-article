#!/usr/bin/env ts-node
/**
 * Today's Recommendation CLI Script
 * 本日のおすすめ商品を調査する Jules セッションを開始する
 */

import 'dotenv/config';
import { JulesInvestigator } from '../jules/JulesInvestigator';
import type { JulesCredentials, SourceContext } from '../types/JulesTypes';
import { setGitHubOutput } from '../utils/github-actions';
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
    throw new Error('Missing required environment variable: JULES_API_KEY');
  }

  if (!source) {
    throw new Error('Missing required environment variable: JULES_SOURCE (e.g., sources/github/owner/repo)');
  }

  return {
    apiKey,
    source,
    startingBranch,
  };
}

async function main(): Promise<void> {
  logger.info("Starting Today's Recommendation investigation CLI...");

  try {
    const options = getOptions();
    logger.info(`Source: ${options.source}`);
    logger.info(`Starting Branch: ${options.startingBranch}`);

    // Jules Investigator を初期化
    const credentials: JulesCredentials = {
      apiKey: options.apiKey,
    };
    const investigator = new JulesInvestigator(credentials);

    // ソースコンテキストを作成
    const sourceContext: SourceContext = {
      source: options.source,
      githubRepoContext: {
        startingBranch: options.startingBranch,
      },
    };

    // 調査セッションを開始
    logger.info("Requesting Jules to find today's recommended products...");
    const sessionInfo = await investigator.startRecommendationInvestigation(sourceContext);

    logger.info(`Recommendation investigation session started: ${sessionInfo.sessionId}`);
    logger.info(`Session Name: ${sessionInfo.sessionName}`);

    // GitHub Actions 出力を設定
    await setGitHubOutput('session-id', sessionInfo.sessionId);
    await setGitHubOutput('session-name', sessionInfo.sessionName);

    logger.info('Jules will now search for recommended products and create a PR asynchronously.');
    process.exit(0);
  } catch (error) {
    logger.error("Today's recommendation investigation failed:", error);
    process.exit(1);
  }
}

// CommonJS環境では最上位でのawaitが使用できないため、Promiseチェーンを使用
// eslint-disable-next-line @typescript-eslint/no-floating-promises, sonarjs/prefer-top-level-await
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
