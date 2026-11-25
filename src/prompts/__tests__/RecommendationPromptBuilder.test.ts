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
    expect(prompt).not.toContain('graph.keepa.com');
    expect(prompt).not.toContain('Keepa価格推移グラフによる');
  });

  it('should include both candidate sections and the 4-slot mix rules', () => {
    const discoveryPath = path.join(tmpDir, 'discovery_candidates.json');
    fs.writeFileSync(
      dummyCandidatesPath,
      JSON.stringify({
        extractedAt: '',
        totalCandidates: 1,
        candidates: [
          {
            asin: 'SALEASIN01',
            title: '値下げ商品',
            category: '家電',
            price: { amount: 1500, currency: 'JPY', formatted: '￥1,500' },
            dealBadge: 'タイムセール',
            previousPrice: 2000,
            priceDropRate: 25,
            timestamp: Date.now(),
          },
        ],
      }),
    );
    fs.writeFileSync(
      discoveryPath,
      JSON.stringify({
        extractedAt: '',
        seed: '2026-11-25',
        totalCandidates: 1,
        candidates: [
          {
            asin: 'GEMASIN001',
            title: '発掘名品',
            score: 91,
            category: '充電器',
            group: 'PC周辺機器',
            articlePath: 'content/articles/gemasin001.md',
          },
        ],
      }),
    );

    const prompt = new RecommendationPromptBuilder(dummyCandidatesPath, 10, discoveryPath).build();

    expect(prompt).toContain('系統A');
    expect(prompt).toContain('系統B');
    expect(prompt).toContain('前回価格 ￥2,000');
    expect(prompt).toContain('GEMASIN001');
    expect(prompt).toContain('content/articles/gemasin001.md');
    expect(prompt).toContain('`deal`（本気の値下げ）**2品**');
    expect(prompt).toContain('`gem`（高スコア名品発掘）**3品**');
    expect(prompt).toContain('`seasonal`（季節・生活シーン）**3品**');
    expect(prompt).toContain('`niche`（ニッチ・課題解決）**2品**');
    expect(prompt).not.toContain('いつでも買える単なる定番品の選定禁止');
  });

  it('should define pickType and catchphrase in the output schema', () => {
    const prompt = new RecommendationPromptBuilder().build();

    expect(prompt).toContain('"pickType"');
    expect(prompt).toContain('"catchphrase"');
    expect(prompt).toContain('システム処理報告');
  });

  it('should include explicit prohibitions against coupon claims and require price discount wording', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();

    expect(prompt).toContain('「クーポン適用」「クーポン対象」等のクーポン表現の完全禁止');
    expect(prompt).toContain('※「クーポン」という表現は使用厳禁');
    expect(prompt).toContain('「クーポン」表記は禁止');
  });

  it('should require verified article existence and prohibit fake sale claims for regular products', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();

    expect(prompt).toContain('検証済み記事の存在が必須 (最重要)');
    expect(prompt).toContain('セールバッジのない通常商品へのセール表現の完全禁止 (最重要)');
    expect(prompt).toContain('セールバッジがない商品に「◯% OFF」は禁止');
  });

  it('should enforce autonomous finalization and prohibit before-finalize confirmation requests', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();

    expect(prompt).toContain('変更確定前（Before finalize）の事前確認・アドバイス要求の完全禁止 (最重要)');
    expect(prompt).toContain('Before I finalize these changes, do you have any additional advice');
    expect(prompt).toContain('完全自動・非同期バッチ実行環境（重要）');
    expect(prompt).toContain('セルフ検証完了後の自律的 Finalize（PR作成）義務');
    expect(prompt).toContain('人間に事前の確認やアドバイスを一切求めることなく、直ちに');
    expect(prompt).toContain('自律的に直接コミット・Pull Request作成まで完了（finalize）している');
  });

  it('should include instructions for valid price and image URL null fallback', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();

    expect(prompt).toContain('同一の画像URLを複数商品にコピペすることは厳禁');
    expect(prompt).toContain('必ず `null` とせよ');
    expect(prompt).toContain('price: 0');
  });
});
