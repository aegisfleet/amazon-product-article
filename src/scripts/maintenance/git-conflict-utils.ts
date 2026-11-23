import { execSync } from 'node:child_process';

export interface ConflictStages {
  /** ステージ2 (:2:) = マージ元 (ours) の内容。存在しない場合は空文字 */
  ours: string;
  /** ステージ3 (:3:) = マージ先 (theirs) の内容。存在しない場合は空文字 */
  theirs: string;
}

// 既定の maxBuffer (1MB) を超える大容量ファイル (product-categories.json 等) が
// ENOBUFS で空文字扱いになりマージが失敗する問題を防ぐため、十分大きな上限を指定する。
const MAX_STAGE_BUFFER_BYTES = 256 * 1024 * 1024;

function readStage(stage: 2 | 3, filePath: string): string {
  try {
    return execSync(`git show :${stage}:"${filePath}"`, {
      encoding: 'utf-8',
      maxBuffer: MAX_STAGE_BUFFER_BYTES,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch {
    // ステージが存在しない（追加/削除のみのコンフリクト等）場合は空として扱う
    return '';
  }
}

/**
 * Git のコンフリクトステージ (:2: ours, :3: theirs) から内容を取得する。
 * マージ対象のファイルを汚染された作業ツリーからではなく、確実なインデックスから読むために使用する。
 */
export function readConflictStages(filePath: string): ConflictStages {
  return {
    ours: readStage(2, filePath),
    theirs: readStage(3, filePath),
  };
}
