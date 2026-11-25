import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PickupPoolItem } from '../extract-discovery-candidates';
import { extractDiscoveryCandidates, seededShuffle, selectDiscoveryCandidates } from '../extract-discovery-candidates';

const makePool = (): PickupPoolItem[] =>
  Array.from({ length: 60 }, (_, i) => ({
    asin: `ASIN${String(i).padStart(6, '0')}`,
    title: `商品${i}`,
    score: i % 10 === 0 ? 70 : 85,
    category: `cat${i % 12}`,
    group: `group${i % 6}`,
  }));

describe('extract-discovery-candidates', () => {
  it('shuffles deterministically per seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(items, '2026-11-25')).toEqual(seededShuffle(items, '2026-11-25'));
    expect(seededShuffle(items, '2026-11-25')).not.toEqual(seededShuffle(items, '2026-11-26'));
  });

  it('excludes ASINs, low scores and limits per group', () => {
    const exclude = new Set(['ASIN000001']);
    const picked = selectDiscoveryCandidates(makePool(), {
      seed: 's',
      excludeAsins: exclude,
      limit: 20,
      maxPerGroup: 2,
    });
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(12);
    expect(picked.some((p) => p.asin === 'ASIN000001')).toBe(false);
    expect(picked.every((p) => p.score >= 80)).toBe(true);
    const counts = new Map<string, number>();
    for (const p of picked) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it('writes output file and degrades to empty when pool is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
    const out = path.join(dir, 'discovery.json');
    const poolPath = path.join(dir, 'pool.json');
    fs.writeFileSync(poolPath, JSON.stringify(makePool()));

    const result = extractDiscoveryCandidates({ poolPath, outputPath: out, seed: 'x' });
    expect(result.candidates[0]?.articlePath).toMatch(/^content\/articles\/asin\d+\.md$/);
    expect(JSON.parse(fs.readFileSync(out, 'utf-8')).totalCandidates).toBe(result.totalCandidates);

    const empty = extractDiscoveryCandidates({ poolPath: path.join(dir, 'none.json'), outputPath: out, seed: 'x' });
    expect(empty.totalCandidates).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
