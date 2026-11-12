import * as dotenv from 'dotenv';
import { GeminiDecisionClient } from '../../category/classifier/GeminiDecisionClient';

// .env を明示的に読み込む
dotenv.config();

/**
 * Gemini API Key Verification Script
 * Validates the registered GEMINI_API_KEY with Gemini Decision 1 (Decisions API)
 */

async function verify(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.error('\n[ERROR] GEMINI_API_KEY が設定されていません。');
    console.error('.env ファイルに GEMINI_API_KEY を記述するか、以下のコマンドで登録してください:');
    console.error('  pnpm run set:gemini-key <あなたのAPIキー>\n');
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(` Gemini Decision 1 (Decisions API) 疎通検証`);
  console.log(`======================================================`);
  console.log('使用APIキー: 設定確認済み');
  console.log(`対象モデル: gemini-decision-1`);
  console.log(`エンドポイント: https://generativelanguage.googleapis.com/v1beta/decisions\n`);

  console.log('テスト判定リクエストを送信中...');
  const testInput = 'Anker 511 Charger (Nano 3, 30W) USB-C 急速充電器 / 超小型急速充電器 / 折たたみ式プラグ';

  const client = new GeminiDecisionClient({
    apiKey,
    maxRetries: 1,
  });

  const startTime = Date.now();

  try {
    const response = await client.decide({
      model: 'gemini-decision-1',
      input: testInput,
      questions: {
        parent_category: {
          type: 'choice',
          instructions: 'この商品が属する最も適切な親カテゴリを選択してください。',
          criteria: {
            'mobile-accessories':
              'モバイルバッテリー、充電器、USBケーブル、スマホケース、保護フィルム、車載ホルダーなどスマートフォンの周辺機器・アクセサリ。',
            'pc-workstation':
              'PC本体、モニター、キーボード、マウス、外付けSSD/HDD、USBハブ・ドッキングステーションなどパソコン周辺機器。',
            'zz-others': '上記いずれにも該当しないその他商品。',
          },
        },
      },
    });

    const elapsedMs = Date.now() - startTime;
    const answer = response.answers?.parent_category;

    console.log(`\n✅ [SUCCESS] Decisions API との通信・認証に成功しました！ (${elapsedMs} ms)`);
    console.log(`------------------------------------------------------`);
    console.log(`テスト商品: ${testInput}`);
    console.log(`判定結果: ${answer?.choice}`);
    console.log(`確信度 (Confidence): ${(answer?.confidence ?? 0).toFixed(4)}`);

    if (answer?.probabilities) {
      console.log(`確率分布:`);
      for (const [key, prob] of Object.entries(answer.probabilities)) {
        const barLength = Math.round(prob * 20);
        const bar = '█'.repeat(barLength).padEnd(20, ' ');
        console.log(`  - ${key.padEnd(20, ' ')}: ${(prob * 100).toFixed(1).padStart(5, ' ')}% [${bar}]`);
      }
    }
    console.log(`------------------------------------------------------\n`);
    console.log('Gemini Decision 1 は正常に稼働しており、カテゴリ再設計の検証を進める準備が整いました。\n');
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    console.error(`\n❌ [FAILED] Decisions API の検証に失敗しました (${elapsedMs} ms)`);
    console.error('エラー詳細:', error instanceof Error ? error.message : error);
    console.error('\n【確認事項】');
    console.error('1. APIキーが Google AI Studio で正しく発行されているか確認してください。');
    console.error('2. APIキーが「Generative Language API」へのアクセスを許可しているか確認してください。');
    console.error('3. 課金（Paid Tier）が有効になっているプロジェクトのキーであることを確認してください。\n');
    process.exit(1);
  }
}

if (require.main === module) {
  verify().catch((err) => {
    console.error('[ERROR] 予期せぬエラーが発生しました:', err);
    process.exit(1);
  });
}
