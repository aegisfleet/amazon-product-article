import type { TechnicalSpecs } from '../../types/JulesTypes';
import { normalizeTechnicalSpecs } from '../specNormalizer';

describe('normalizeTechnicalSpecs', () => {
  it('should extract structured fields from other string array', () => {
    const rawSpecs: TechnicalSpecs = {
      dimensions: {
        height: '1734.2mm',
        width: '61.8mm',
        depth: '2512.2mm',
      },
      weight: '485g',
      capacity: '8GB RAM / 128GB ROM',
      material: 'フルメタルユニボディ',
      other: [
        'SoC: Snapdragon 8s Gen 4',
        'ディスプレイ: 28.4cm 3.2K (アスペクト比 3:2), リフレッシュレート144Hz, 輝度800nits',
        'バッテリー: 9200mAh, 45W急速充電対応',
        'オーディオ: クワッドスピーカー, Dolby Vision対応',
        'OS: Xiaomi HyperOS 3 (AI機能・Google Gemini搭載)',
        'カラー: グレー',
      ],
    };

    const normalized = normalizeTechnicalSpecs(rawSpecs);

    expect(normalized.cpu).toBe('Snapdragon 8s Gen 4');
    expect(normalized.os).toBe('Xiaomi HyperOS 3 (AI機能・Google Gemini搭載)');
    expect(normalized.display?.size).toBe('28.4cm');
    expect(normalized.display?.resolution).toBe('3.2K');
    expect(normalized.display?.refreshRate).toBe('144Hz');
    expect(normalized.battery?.capacity).toBe('9200mAh');
    expect(normalized.battery?.charging).toBe('45W急速充電対応');
    expect(normalized.color).toBe('グレー');

    // remaining other should only contain audio
    expect(normalized.other).toEqual(['オーディオ: クワッドスピーカー, Dolby Vision対応']);

    // sanitized dimensions
    expect(normalized.dimensions?.height).toBe('173.4mm');
    expect(normalized.dimensions?.depth).toBe('251.2mm');
  });

  it('should not overwrite existing structured fields', () => {
    const rawSpecs: TechnicalSpecs = {
      cpu: 'Existing CPU',
      os: 'Existing OS',
      other: ['SoC: Other CPU', 'OS: Other OS'],
    };

    const normalized = normalizeTechnicalSpecs(rawSpecs);

    expect(normalized.cpu).toBe('Existing CPU');
    expect(normalized.os).toBe('Existing OS');
    expect(normalized.other).toEqual([]);
  });

  it('should handle undefined or null specs gracefully', () => {
    expect(normalizeTechnicalSpecs(undefined)).toEqual({});
    expect(normalizeTechnicalSpecs(null)).toEqual({});
  });
});
