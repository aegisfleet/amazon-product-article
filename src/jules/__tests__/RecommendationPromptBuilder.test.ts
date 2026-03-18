import { RecommendationPromptBuilder } from '../RecommendationPromptBuilder';

describe('RecommendationPromptBuilder', () => {
  it('should build a non-empty prompt', () => {
    const builder = new RecommendationPromptBuilder();
    const prompt = builder.build();

    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });
});
