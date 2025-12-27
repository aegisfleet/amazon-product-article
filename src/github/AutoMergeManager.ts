/**
 * Auto_Merge_Manager - JulesプルリクエストのCondutional自動マージ
 */

import {
    DEFAULT_MERGE_CONDITIONS,
    MergeConditions,
    MergeDecision,
    MergeResult,
    PullRequest,
    ValidationResult
} from '../types/GitHubTypes';
import { Logger } from '../utils/Logger';

export class AutoMergeManager {
    private logger: Logger;
    private conditions: MergeConditions;

    constructor(conditions?: Partial<MergeConditions>) {
        this.logger = Logger.getInstance();
        this.conditions = {
            ...DEFAULT_MERGE_CONDITIONS,
            ...conditions
        };
    }

    /**
     * プルリクエストを検証
     */
    validatePullRequest(pr: PullRequest): MergeDecision {
        this.logger.info(`Validating PR #${pr.number}: ${pr.title}`);

        const validationResults: ValidationResult[] = [];

        // 作成者チェック
        const authorCheck = this.verifyJulesAuthor(pr);
        validationResults.push({
            check: 'author',
            passed: authorCheck,
            message: authorCheck
                ? `Author ${pr.author} is authorized`
                : `Author ${pr.author} is not authorized (expected: ${this.conditions.requiredAuthor})`
        });

        // ファイルパスチェック
        const pathCheck = this.checkFilePathRestrictions(pr.changedFiles);
        validationResults.push({
            check: 'file-paths',
            passed: pathCheck,
            message: pathCheck
                ? 'All changed files are in allowed paths'
                : 'Some changed files are in restricted paths'
        });

        // PR状態チェック
        const stateCheck = pr.state === 'open';
        validationResults.push({
            check: 'pr-state',
            passed: stateCheck,
            message: stateCheck ? 'PR is open' : 'PR is not open'
        });

        // 最終決定
        const shouldMerge = validationResults.every(r => r.passed);
        const failedChecks = validationResults.filter(r => !r.passed);

        return {
            shouldMerge,
            reason: shouldMerge
                ? 'All validation checks passed'
                : `Failed checks: ${failedChecks.map(c => c.check).join(', ')}`,
            validationResults,
            pathCheck,
            authorCheck
        };
    }

    /**
     * ファイルパスの制限をチェック
     */
    checkFilePathRestrictions(changedFiles: string[]): boolean {
        if (changedFiles.length === 0) {
            this.logger.warn('No changed files to check');
            return false;
        }

        for (const file of changedFiles) {
            // 除外パスにマッチする場合は拒否
            if (this.matchesAnyPath(file, this.conditions.excludedPaths)) {
                this.logger.warn(`File ${file} is in excluded path`);
                return false;
            }

            // 許可パスにマッチしない場合は拒否
            if (!this.matchesAnyPath(file, this.conditions.allowedPaths)) {
                this.logger.warn(`File ${file} is not in allowed paths`);
                return false;
            }
        }

        this.logger.info('All file paths are valid');
        return true;
    }

    /**
     * Jules作成者かどうかを確認
     */
    verifyJulesAuthor(pr: PullRequest): boolean {
        const isJules = pr.author === this.conditions.requiredAuthor ||
            pr.author.toLowerCase().includes('jules') ||
            pr.author === 'jules[bot]';

        if (isJules) {
            this.logger.info(`PR author ${pr.author} is verified as Jules`);
        } else {
            this.logger.warn(`PR author ${pr.author} is not Jules`);
        }

        return isJules;
    }

    /**
     * マージを実行（実際のGitHub API呼び出しをシミュレート）
     */
    async executeMerge(prNumber: number): Promise<MergeResult> {
        this.logger.info(`Executing merge for PR #${prNumber}`);

        // 実際の実装ではGitHub APIを使用
        // ここではシミュレーション
        try {
            // GitHub API呼び出しのシミュレーション
            await this.simulateApiCall();

            return {
                success: true,
                prNumber,
                mergedAt: new Date(),
                sha: this.generateMockSha()
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to merge PR #${prNumber}: ${errorMessage}`);

            return {
                success: false,
                prNumber,
                error: errorMessage
            };
        }
    }

    /**
     * 必須チェックを検証
     */
    verifyRequiredChecks(checkStatuses: Record<string, 'success' | 'failure' | 'pending'>): ValidationResult {
        const allPassed = this.conditions.requiredChecks.every(
            check => checkStatuses[check] === 'success'
        );

        const missingChecks = this.conditions.requiredChecks.filter(
            check => !checkStatuses[check] || checkStatuses[check] !== 'success'
        );

        return {
            check: 'required-checks',
            passed: allPassed,
            message: allPassed
                ? 'All required checks passed'
                : `Missing or failed checks: ${missingChecks.join(', ')}`
        };
    }

    /**
     * マージ条件を更新
     */
    updateConditions(conditions: Partial<MergeConditions>): void {
        this.conditions = { ...this.conditions, ...conditions };
        this.logger.info('Merge conditions updated');
    }

    /**
     * 現在のマージ条件を取得
     */
    getConditions(): MergeConditions {
        return { ...this.conditions };
    }

    // === Private methods ===

    /**
     * パスがいずれかのパターンにマッチするかチェック
     */
    private matchesAnyPath(file: string, patterns: string[]): boolean {
        return patterns.some(pattern => {
            // パターンが / で終わる場合はディレクトリプレフィックスマッチ
            if (pattern.endsWith('/')) {
                return file.startsWith(pattern);
            }
            // 完全マッチまたはglobマッチ
            return file === pattern || file.startsWith(pattern);
        });
    }

    /**
     * API呼び出しのシミュレーション
     */
    private async simulateApiCall(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * モックSHAの生成
     */
    private generateMockSha(): string {
        return Math.random().toString(36).substring(2, 42).padStart(40, '0');
    }
}
