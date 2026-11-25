import { extractAsinsFromTodayJson, loadRecentRecommendedAsins } from '../recommendation-history';

describe('recommendation-history', () => {
  it('extracts upper-cased ASINs from today.json content', () => {
    const raw = JSON.stringify({ recommendations: [{ asin: 'b0abc12345' }, { asin: 'B0DEF67890' }, {}] });
    expect(extractAsinsFromTodayJson(raw)).toEqual(['B0ABC12345', 'B0DEF67890']);
  });

  it('returns empty for invalid JSON', () => {
    expect(extractAsinsFromTodayJson('not json')).toEqual([]);
  });

  it('collects ASINs across commits and skips unreadable ones', () => {
    const runGit = (args: string[]): string => {
      if (args[0] === 'log') return 'sha1\nsha2\n';
      if (args[1] === 'sha1:data/recommendations/today.json')
        return JSON.stringify({ recommendations: [{ asin: 'AAAAAAAAAA' }] });
      throw new Error('bad object');
    };
    expect([...loadRecentRecommendedAsins(14, runGit)]).toEqual(['AAAAAAAAAA']);
  });

  it('falls back to an empty set when git fails (e.g. shallow clone / no git)', () => {
    const runGit = (): string => {
      throw new Error('not a git repository');
    };
    expect(loadRecentRecommendedAsins(14, runGit).size).toBe(0);
  });
});
