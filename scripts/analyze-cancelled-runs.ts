#!/usr/bin/env ts-node
/**
 * deploy-articles ワークフローのキャンセルされた実行（run）を分析・分類するスクリプト
 *
 * 使用例:
 *   pnpm ts-node scripts/analyze-cancelled-runs.ts
 */

import { execFileSync } from 'node:child_process';

interface Step {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: Step[];
}

interface Run {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  event: string;
  head_sha: string;
  display_title: string;
}

function ghApi(endpoint: string): any {
  const out = execFileSync('gh', ['api', endpoint], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out);
}

function durationSec(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
}

async function main() {
  console.log('Fetching runs for deploy-articles.yml...');
  const runsResp = ghApi('repos/aegisfleet/amazon-product-article/actions/workflows/deploy-articles.yml/runs?per_page=100');
  const allRuns: Run[] = runsResp.workflow_runs || [];

  const cancelledRuns = allRuns.filter((r) => r.conclusion === 'cancelled');
  if (cancelledRuns.length < 80) {
    const runsResp2 = ghApi(
      'repos/aegisfleet/amazon-product-article/actions/workflows/deploy-articles.yml/runs?per_page=100&page=2',
    );
    const page2Runs: Run[] = runsResp2.workflow_runs || [];
    for (const r of page2Runs) {
      allRuns.push(r);
      if (r.conclusion === 'cancelled') {
        cancelledRuns.push(r);
      }
    }
  }

  const targetCancelled = cancelledRuns.slice(0, 100);
  console.log(`Analyzing ${targetCancelled.length} cancelled runs...`);

  const categories = {
    a_not_started: [] as any[],
    b_generate_cancelled_commit_success: [] as any[],
    c_generate_cancelled_commit_lost: [] as any[],
    d_after_commit_cancelled: [] as any[],
  };

  const commitDurations: number[] = [];

  for (const run of targetCancelled) {
    const jobsResp = ghApi(`repos/aegisfleet/amazon-product-article/actions/runs/${run.id}/jobs`);
    const jobs: Job[] = jobsResp.jobs || [];
    const buildJob = jobs.find((j) => j.name === 'build');

    if (!buildJob?.steps || buildJob.steps.length === 0 || buildJob.steps.every((s) => s.conclusion === 'skipped' || s.conclusion === null)) {
      categories.a_not_started.push({ runId: run.id, created_at: run.created_at, jobConclusion: buildJob?.conclusion });
      continue;
    }

    const checkoutStep = buildJob.steps.find((s) => s.name.includes('Checkout') || s.number === 2);
    const generateStep = buildJob.steps.find((s) => s.name === 'Generate articles');
    const prepareStep = buildJob.steps.find((s) => s.name === 'Prepare static data');
    const commitStep = buildJob.steps.find((s) => s.name.includes('Commit build artifacts') || s.name.includes('Commit fetched cache'));
    const hugoStep = buildJob.steps.find((s) => s.name === 'Build site with Hugo');

    const commitDur = commitStep ? durationSec(commitStep.started_at, commitStep.completed_at) : null;
    if (commitStep?.conclusion === 'success' && commitDur !== null) {
      commitDurations.push(commitDur);
    }

    const info = {
      runId: run.id,
      created_at: run.created_at,
      event: run.event,
      checkout: checkoutStep?.conclusion,
      generate: generateStep?.conclusion,
      prepare: prepareStep?.conclusion,
      commit: commitStep?.conclusion,
      commitDur,
      hugo: hugoStep?.conclusion,
    };

    if (!generateStep || generateStep.conclusion === 'skipped' || (generateStep.conclusion === 'cancelled' && !generateStep.started_at)) {
      if (commitStep?.conclusion === 'failure') {
        categories.c_generate_cancelled_commit_lost.push({ ...info, reason: 'before_generate_commit_failed' });
      } else {
        categories.a_not_started.push({ ...info, reason: 'cancelled_before_generate' });
      }
      continue;
    }

    if (generateStep.conclusion === 'cancelled' || prepareStep?.conclusion === 'cancelled') {
      if (commitStep?.conclusion === 'success') {
        categories.b_generate_cancelled_commit_success.push(info);
      } else {
        categories.c_generate_cancelled_commit_lost.push(info);
      }
    } else if (commitStep?.conclusion === 'success') {
      categories.d_after_commit_cancelled.push(info);
    } else {
      categories.c_generate_cancelled_commit_lost.push(info);
    }
  }

  console.log('\n=== Classification Summary ===');
  console.log(`Total analyzed cancelled runs: ${targetCancelled.length}`);
  console.log(`a. Not started / Before Generate (No loss): ${categories.a_not_started.length}`);
  console.log(`b. Cancelled during Generate/Prepare -> Commit success: ${categories.b_generate_cancelled_commit_success.length}`);
  console.log(`c. Cancelled -> Commit failure / skipped / cancelled (LOST): ${categories.c_generate_cancelled_commit_lost.length}`);
  console.log(`d. Cancelled after Commit completed (Hugo / deploy): ${categories.d_after_commit_cancelled.length}`);

  const validRunsTotal = categories.b_generate_cancelled_commit_success.length + categories.c_generate_cancelled_commit_lost.length + categories.d_after_commit_cancelled.length;
  const successTotal = categories.b_generate_cancelled_commit_success.length + categories.d_after_commit_cancelled.length;
  const successRate = validRunsTotal > 0 ? ((successTotal / validRunsTotal) * 100).toFixed(1) : 'N/A';

  console.log(`\nCommit Success Rate (excluding category a): ${successRate}% (${successTotal}/${validRunsTotal})`);
}

main().catch(console.error);
