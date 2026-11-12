import { GeminiDecisionClassifier } from '../GeminiDecisionClassifier';
import { GeminiDecisionClient } from '../GeminiDecisionClient';

jest.mock('../GeminiDecisionClient');
const MockedClient = GeminiDecisionClient as jest.MockedClass<typeof GeminiDecisionClient>;

describe('GeminiDecisionClassifier', () => {
  let mockDecide: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDecide = jest.fn();
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

  test('should set needsReview: true when confidence is below threshold and route child to zz-other', async () => {
    // Stage 1: Parent confidence 0.85 (Pass)
    mockDecide.mockResolvedValueOnce({
      answers: {
        parent_category: {
          choice: 'pc-workstation',
          confidence: 0.85,
        },
      },
    });

    // Stage 2: Child confidence 0.55 (Below 0.70 threshold)
    mockDecide.mockResolvedValueOnce({
      answers: {
        child_category: {
          choice: 'storage-drives',
          confidence: 0.55,
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
});
