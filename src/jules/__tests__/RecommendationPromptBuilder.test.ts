import { RecommendationPromptBuilder } from '../RecommendationPromptBuilder';

describe('RecommendationPromptBuilder', () => {
  it('should build a prompt containing today\'s date', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();
    
    // 日付形式 (YYYY-MM-DD) が含まれているか確認
    const today = new Date()
      .toLocaleDateString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replaceAll('/', '-');
    
    expect(prompt).toContain(today);
  });

  it('should contain specific instruction keywords', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();
    
    expect(prompt).toContain('creators_search_items.py');
    expect(prompt).toContain('creators_get_item.py');
    expect(prompt).toContain('data/recommendations/today.json');
    expect(prompt).toContain('【ミッション：本日のおすすめ商品調査】');
  });
});
