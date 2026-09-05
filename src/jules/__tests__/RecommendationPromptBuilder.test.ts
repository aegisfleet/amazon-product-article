import fs from 'node:fs';
import path from 'node:path';
import { RecommendationPromptBuilder } from '../RecommendationPromptBuilder';

describe('RecommendationPromptBuilder', () => {
  const tmpDir = path.join(process.cwd(), 'tmp/test_prompt_builder');
  const dummyCandidatesPath = path.join(tmpDir, 'sale_candidates.json');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should build a non-empty prompt', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();

    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should include sale candidates section when file exists and has candidates', () => {
    const dummyData = {
      extractedAt: new Date().toISOString(),
      totalCandidates: 1,
      candidates: [
        {
          asin: 'TESTASIN123',
          title: 'テストセール商品',
          category: '家電',
          price: { amount: 1500, currency: 'JPY', formatted: '￥1,500' },
          dealBadge: 'タイムセール',
          savingsPercentage: 25,
          timestamp: Date.now(),
        },
      ],
    };

    fs.writeFileSync(dummyCandidatesPath, JSON.stringify(dummyData, null, 2), 'utf-8');

    const builder = new RecommendationPromptBuilder(dummyCandidatesPath);
    const prompt = builder.build();

    expect(prompt).toContain('事前抽出された高品質・高スコア候補商品リスト');
    expect(prompt).toContain('TESTASIN123');
    expect(prompt).toContain('テストセール商品');
    expect(prompt).toContain('[タイムセール]');
    expect(prompt).toContain('(25% OFF)');
    expect(prompt).toContain('Keepa直近90日価格推移: https://graph.keepa.com/pricehistory.png?asin=TESTASIN123');
    expect(prompt).toContain('Keepa価格推移グラフによる「本当の値下げ」の実態判定');
  });

  it('should include explicit prohibitions against coupon claims and require price discount wording', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();

    expect(prompt).toContain('「クーポン適用」「クーポン対象」等のクーポン表現の完全禁止');
    expect(prompt).toContain('※「クーポン」という表現は使用厳禁');
    expect(prompt).toContain('「クーポン」表記は禁止');
  });
});
