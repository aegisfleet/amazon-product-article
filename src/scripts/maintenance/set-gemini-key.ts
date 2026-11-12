import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

/**
 * Gemini API Key Registration Script
 * Safely updates or appends GEMINI_API_KEY in .env file
 */

function maskKey(key: string): string {
  if (key.length <= 8) {
    return '***';
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function updateEnvFile(apiKey: string): void {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = '';

  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  const geminiRegex = /^GEMINI_API_KEY=.*$/m;
  let newContent: string;

  if (geminiRegex.test(content)) {
    newContent = content.replace(geminiRegex, `GEMINI_API_KEY=${apiKey}`);
  } else {
    const trailingNewline = content.endsWith('\n') || content.length === 0 ? '' : '\n';
    newContent = `${content}${trailingNewline}\n# Gemini API Configuration (Decisions API: gemini-decision-1)\nGEMINI_API_KEY=${apiKey}\n`;
  }

  fs.writeFileSync(envPath, newContent, 'utf8');
  console.log(`\n[SUCCESS] .env に GEMINI_API_KEY (${maskKey(apiKey)}) を登録・保存しました。`);
  console.log('検証を実行するには、以下のコマンドを実行してください:');
  console.log('  pnpm run verify:gemini-key\n');
}

async function promptForApiKey(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Gemini APIキーを入力してください (Google AI Studio発行のキー): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const argKey = process.argv[2]?.trim();

  let apiKey = argKey;
  if (!apiKey) {
    apiKey = await promptForApiKey();
  }

  if (!apiKey) {
    console.error('[ERROR] APIキーが指定されていません。処理を中止しました。');
    process.exit(1);
  }

  updateEnvFile(apiKey);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[ERROR] 登録処理中にエラーが発生しました:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
