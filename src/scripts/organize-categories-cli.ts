#!/usr/bin/env ts-node
/**
 * Category Organization CLI Script
 * GitHub Actions (hosted runner) から実行されるカテゴリ整理プロンプト生成スクリプト
 *
 * 「その他／全般」に分類されている（categorygroups.jsonに未登録の）カテゴリを検出し、
 * Antigravity CLI (agy) 用のプロンプトファイルを data/prompts/organize-categories-prompt.txt に出力する。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { JulesCategoryOrganizer } from '../jules/JulesCategoryOrganizer';
import { setGitHubOutput } from '../utils/github-actions';
import { Logger } from '../utils/Logger';

const logger = Logger.getInstance();

async function main(): Promise<void> {
  logger.info('Starting category organization prompt generation CLI...');

  try {
    const organizer = new JulesCategoryOrganizer();

    // 未登録カテゴリの確認
    const unregisteredCategories = await organizer.getUnregisteredCategories();

    if (unregisteredCategories.length === 0) {
      logger.info('No unregistered categories found. Nothing to organize.');
      await setGitHubOutput('categories-found', '0');
      await setGitHubOutput('has-prompt', 'false');
      process.exit(0);
    }

    logger.info(`Found ${unregisteredCategories.length} unregistered categories:`);
    for (const category of unregisteredCategories.slice(0, 20)) {
      logger.info(`  - ${category}`);
    }
    if (unregisteredCategories.length > 20) {
      logger.info(`  ... and ${unregisteredCategories.length - 20} more`);
    }

    const prompt = organizer.formatOrganizationPrompt(unregisteredCategories);
    const promptPath = path.join(process.cwd(), 'data', 'prompts', 'organize-categories-prompt.txt');
    await fs.mkdir(path.dirname(promptPath), { recursive: true });
    await fs.writeFile(promptPath, prompt, 'utf-8');

    await setGitHubOutput('categories-found', unregisteredCategories.length.toString());
    await setGitHubOutput('has-prompt', 'true');

    logger.info(`Category organization prompt generated at ${promptPath}`);
    logger.info(`Categories to organize: ${unregisteredCategories.length}`);
    process.exit(0);
  } catch (error) {
    logger.error('Category organization prompt generation failed:', error);
    await setGitHubOutput('categories-found', '0');
    await setGitHubOutput('has-prompt', 'false');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
