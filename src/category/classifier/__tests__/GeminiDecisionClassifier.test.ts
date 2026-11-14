import { GeminiDecisionClassifier } from '../GeminiDecisionClassifier';
import { GeminiDecisionClient } from '../GeminiDecisionClient';
import type { DecisionRequest, DecisionResponse } from '../types';

jest.mock('../GeminiDecisionClient');
const MockedClient = GeminiDecisionClient as jest.MockedClass<typeof GeminiDecisionClient>;

describe('GeminiDecisionClassifier', () => {
  let mockDecide: jest.Mock<Promise<DecisionResponse>, [DecisionRequest]>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDecide = jest.fn<Promise<DecisionResponse>, [DecisionRequest]>();
    MockedClient.prototype.decide = mockDecide;
  });

  test('should classify high-confidence product through Stage 1 and Stage 2 without review flag', async () => {
    // Stage 1 (Parent)
    mockDecide.mockResolvedValueOnce({
      answers: {
        parent_category: {
          choice: 'pc-workstation',
          confidence: 0.95,
          probabilities: {
            'pc-workstation': 0.95,
            'smartphone-accessories': 0.05,
          },
        },
      },
    });

    // Stage 2 (Child)
    mockDecide.mockResolvedValueOnce({
      answers: {
        child_category: {
          choice: 'monitors',
          confidence: 0.92,
          probabilities: {
            monitors: 0.92,
            laptops: 0.08,
          },
        },
      },
    });

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    const result = await classifier.classify({
      title: 'Dell 27インチ 4Kモニター U2720QM',
      brand: 'Dell',
      specsSummary: 'IPS非光沢 4K HDR USB-C 90W給電',
    });

    expect(result.parentSlug).toBe('pc-workstation');
    expect(result.childSlug).toBe('monitors');
    expect(result.parentConfidence).toBe(0.95);
    expect(result.childConfidence).toBe(0.92);
    expect(result.needsReview).toBe(false);
    expect(result.source).toBe('gemini-decision-1');
  });

  test('should set needsReview: true when confidence is below fallback threshold and route child to zz-other', async () => {
    // Stage 1: Parent confidence 0.85 (Pass)
    mockDecide.mockResolvedValueOnce({
      answers: {
        parent_category: {
          choice: 'pc-workstation',
          confidence: 0.85,
        },
      },
    });

    // Stage 2: Child confidence 0.35 (Below 0.40 fallback threshold)
    mockDecide.mockResolvedValueOnce({
      answers: {
        child_category: {
          choice: 'storage-drives',
          confidence: 0.35,
        },
      },
    });

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    const result = await classifier.classify({
      title: '謎のPCガジェット',
      brand: 'Unknown',
    });

    expect(result.parentSlug).toBe('pc-workstation');
    expect(result.childSlug).toBe('zz-pc-other');
    expect(result.needsReview).toBe(true);
  });

  test('should preserve concrete childSlug with needsReview: true when child confidence is between 0.40 and 0.70', async () => {
    // Stage 1: Parent confidence 0.85
    mockDecide.mockResolvedValueOnce({
      answers: {
        parent_category: {
          choice: 'pc-workstation',
          confidence: 0.85,
          probabilities: {
            'pc-workstation': 0.85,
            'smartphone-accessories': 0.15,
          },
        },
      },
    });

    // Stage 2: Child confidence 0.55 (>= 0.40, < 0.70)
    mockDecide.mockResolvedValueOnce({
      answers: {
        child_category: {
          choice: 'monitors',
          confidence: 0.55,
          probabilities: {
            monitors: 0.55,
            'monitor-arms-stands': 0.45,
          },
        },
      },
    });

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    const result = await classifier.classify({
      title: 'PCモニター周辺アクセサリ',
      brand: 'SampleBrand',
    });

    expect(result.parentSlug).toBe('pc-workstation');
    expect(result.childSlug).toBe('monitors');
    expect(result.needsReview).toBe(true);
    expect(result.source).toBe('gemini-decision-1');
  });

  test('should fallback to legacy map when API throws error', async () => {
    mockDecide.mockRejectedValue(new Error('Decisions API Network Error'));

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    const result = await classifier.classify(
      {
        title: 'Anker PowerCore 10000',
        brand: 'Anker',
      },
      'モバイルバッテリー', // legacy old category
    );

    expect(result.source).toBe('fallback-map');
    expect(result.needsReview).toBe(true);
    expect(result.parentSlug).toBe('smartphone-accessories');
    expect(result.childSlug).toBe('power-banks');
  });

  test('should include non-generic amazonCategory in input text and instruct zz-* as last resort in Stage 2', async () => {
    mockDecide
      .mockResolvedValueOnce({
        answers: {
          parent_category: {
            choice: 'audio-equipment',
            confidence: 0.95,
          },
        },
      })
      .mockResolvedValueOnce({
        answers: {
          child_category: {
            choice: 'wired-earphones-monitors',
            confidence: 0.9,
          },
        },
      });

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    await classifier.classify({
      title: 'KZ ZS10 Pro X',
      brand: 'Linsoul',
      amazonCategory: 'イヤホン',
    });

    expect(mockDecide).toHaveBeenCalledTimes(2);
    const stage1Req = mockDecide.mock.calls[0]?.[0];
    expect(stage1Req?.input).toContain('参考カテゴリ: イヤホン');

    const stage2Req = mockDecide.mock.calls[1]?.[0];
    expect(stage2Req?.input).toContain('参考カテゴリ: イヤホン');
    const childQuestion = stage2Req?.questions.child_category;
    expect(childQuestion?.instructions).toContain('最終手段としてのみ選択してください');
  });

  test('should exclude generic or numeric amazonCategory from input text', async () => {
    mockDecide
      .mockResolvedValueOnce({
        answers: {
          parent_category: {
            choice: 'supplements-medicine',
            confidence: 0.95,
          },
        },
      })
      .mockResolvedValueOnce({
        answers: {
          child_category: {
            choice: 'vitamins-minerals-supplements',
            confidence: 0.9,
          },
        },
      });

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    await classifier.classify({
      title: 'テストサプリ',
      amazonCategory: 'ドラッグストア',
    });

    const stage1Req = mockDecide.mock.calls[0]?.[0];
    expect(stage1Req?.input).not.toContain('参考カテゴリ:');

    mockDecide.mockClear();
    mockDecide
      .mockResolvedValueOnce({
        answers: {
          parent_category: { choice: 'books-media', confidence: 0.95 },
        },
      })
      .mockResolvedValueOnce({
        answers: {
          child_category: { choice: 'comics-manga', confidence: 0.9 },
        },
      });

    await classifier.classify({
      title: 'テスト書籍',
      amazonCategory: '7000',
    });

    const stage1NumericReq = mockDecide.mock.calls[0]?.[0];
    expect(stage1NumericReq?.input).not.toContain('参考カテゴリ:');
  });

  test('should proceed to Stage 2 even when parent confidence is below 0.60 instead of returning fallback-map', async () => {
    mockDecide
      .mockResolvedValueOnce({
        answers: {
          parent_category: {
            choice: 'smartphone-accessories',
            confidence: 0.52,
          },
        },
      })
      .mockResolvedValueOnce({
        answers: {
          child_category: {
            choice: 'power-banks',
            confidence: 0.88,
          },
        },
      });

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    const result = await classifier.classify(
      {
        title: 'Anker PowerCore 10000',
        amazonCategory: 'モバイルバッテリー',
      },
      'モバイルバッテリー',
    );

    expect(mockDecide).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('gemini-decision-1');
    expect(result.parentSlug).toBe('smartphone-accessories');
    expect(result.childSlug).toBe('power-banks');
    expect(result.needsReview).toBe(true);
  });

  test('should rescue Stage 1 others result using legacyMap parent when available and run Stage 2', async () => {
    mockDecide
      .mockResolvedValueOnce({
        answers: {
          parent_category: {
            choice: 'zz-others',
            confidence: 0.45,
          },
        },
      })
      .mockResolvedValueOnce({
        answers: {
          child_category: {
            choice: 'power-banks',
            confidence: 0.91,
          },
        },
      });

    const classifier = new GeminiDecisionClassifier({ apiKey: 'dummy-key' });
    const result = await classifier.classify(
      {
        title: '小型モバイルバッテリー',
        amazonCategory: 'モバイルバッテリー',
      },
      'モバイルバッテリー',
    );

    expect(mockDecide).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('gemini-decision-1');
    expect(result.parentSlug).toBe('smartphone-accessories');
    expect(result.childSlug).toBe('power-banks');
  });
});
