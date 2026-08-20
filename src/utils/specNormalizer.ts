import type { BatterySpec, DisplaySpec, TechnicalSpecs } from '../types/JulesTypes';

interface SpecMatcher {
  pattern: RegExp;
  apply: (val: string, normalized: TechnicalSpecs) => void;
}

const SPEC_MATCHERS: SpecMatcher[] = [
  {
    pattern: /^(?:SoC|CPU|プロセッサ|プロセッサー|チップセット)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.cpu && !normalized.processor) {
        normalized.cpu = val;
      }
    },
  },
  {
    pattern: /^(?:OS|オペレーティングシステム)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.os) {
        normalized.os = val;
      }
    },
  },
  {
    pattern: /^(?:RAM|メモリ)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.ram && !normalized.memory) {
        normalized.ram = val;
      }
    },
  },
  {
    pattern: /^(?:ROM|ストレージ)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.storage) {
        normalized.storage = val;
      }
    },
  },
  {
    pattern: /^(?:ディスプレイ|画面|液晶|モニター)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.display) {
        normalized.display = parseDisplaySpec(val);
      }
    },
  },
  {
    pattern: /^(?:バッテリー|電池)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.battery) {
        normalized.battery = parseBatterySpec(val);
      }
    },
  },
  {
    pattern: /^(?:カラー|色)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.color) {
        normalized.color = val;
      }
    },
  },
  {
    pattern: /^(?:重量|重さ)\s*[:：]\s*(.+)$/i,
    apply: (val, normalized): void => {
      if (!normalized.weight) {
        normalized.weight = val;
      }
    },
  },
];

/**
 * `other` プロパティから文字列の配列を安全に抽出する
 */
function extractOtherItems(other: unknown): string[] {
  if (Array.isArray(other)) {
    return other.map((item) => String(item).trim());
  }
  if (typeof other === 'string' && other.trim().length > 0) {
    return other.split(/[/,\n]/).map((item) => item.trim());
  }
  return [];
}

/**
 * 1つの other アイテム文字列を登録済みマッチャーに照らし合わせて分類する
 */
function processOtherItem(item: string, normalized: TechnicalSpecs): boolean {
  for (const matcher of SPEC_MATCHERS) {
    const match = matcher.pattern.exec(item);
    const val = match?.[1]?.trim();
    if (val) {
      matcher.apply(val, normalized);
      return true;
    }
  }
  return false;
}

/**
 * technicalSpecs 内の `other` 配列等に一括格納されたテキスト（例: "SoC: Snapdragon...", "OS: HyperOS..."）を
 * 構造化された個別キー（cpu, os, ram, storage, display, battery等）へ自動的に解析・昇格する
 */
export function normalizeTechnicalSpecs(specs: TechnicalSpecs | undefined | null): TechnicalSpecs {
  if (!specs) {
    return {};
  }

  const normalized: TechnicalSpecs = { ...specs };
  const otherItems = extractOtherItems(specs.other);
  const remainingOther: string[] = [];

  for (const item of otherItems) {
    if (!item) continue;
    const handled = processOtherItem(item, normalized);
    if (!handled) {
      remainingOther.push(item);
    }
  }

  if (normalized.dimensions) {
    normalized.dimensions = sanitizeDimensions(normalized.dimensions);
  }

  normalized.other = remainingOther;
  return normalized;
}

/**
 * ディスプレイ文字列 (例: "28.4cm 3.2K (アスペクト比 3:2), リフレッシュレート144Hz, 輝度800nits") を解析
 */
function parseDisplaySpec(val: string): DisplaySpec {
  const spec: DisplaySpec = {
    type: val,
  };

  const sizeMatch = /(\d+(?:\.\d+)?\s*(?:cm|mm|インチ))/i.exec(val);
  const sizeVal = sizeMatch?.[1];
  if (sizeVal) {
    spec.size = sizeVal;
  }

  const resMatch = /(\d+(?:\.\d+)?K|\d{3,4}\s*[\u00D7xX\u2715]\s*\d{3,4})/i.exec(val);
  const resVal = resMatch?.[1];
  if (resVal) {
    spec.resolution = resVal;
  }

  const refreshMatch = /(\d+\s*Hz)/i.exec(val);
  const refreshVal = refreshMatch?.[1];
  if (refreshVal) {
    spec.refreshRate = refreshVal;
  }

  return spec;
}

/**
 * バッテリー文字列 (例: "9200mAh, 45W急速充電対応") を解析
 */
function parseBatterySpec(val: string): BatterySpec {
  const spec: BatterySpec = {};

  const capMatch = /(\d+\s*mAh)/i.exec(val);
  const capVal = capMatch?.[1];
  if (capVal) {
    spec.capacity = capVal;
  } else {
    spec.capacity = val;
  }

  const chargeMatch = /(\d+\s*W\s*(?:急速)?充電[^\s,]*)/i.exec(val);
  const chargeVal = chargeMatch?.[1];
  if (chargeVal) {
    spec.charging = chargeVal;
  }

  return spec;
}

/**
 * dimensions の異常値を判定・補正する
 */
function sanitizeDimensions(dim: NonNullable<TechnicalSpecs['dimensions']>): NonNullable<TechnicalSpecs['dimensions']> {
  const sanitized: NonNullable<TechnicalSpecs['dimensions']> = {};

  const sanitizeValue = (val?: string): string | undefined => {
    if (!val || val === '不明') return val;
    const match = /^(\d+(?:\.\d+)?)\s*(mm|cm)$/i.exec(val);
    const numStr = match?.[1];
    const unitStr = match?.[2];
    if (!numStr || !unitStr) return val;

    const num = parseFloat(numStr);
    const unit = unitStr.toLowerCase();

    if (unit === 'mm' && num > 1000) {
      const corrected = (num / 10).toFixed(1);
      return `${corrected}mm`;
    }
    return val;
  };

  if (dim.height !== undefined) {
    const h = sanitizeValue(dim.height);
    if (h !== undefined) sanitized.height = h;
  }
  if (dim.width !== undefined) {
    const w = sanitizeValue(dim.width);
    if (w !== undefined) sanitized.width = w;
  }
  if (dim.depth !== undefined) {
    const d = sanitizeValue(dim.depth);
    if (d !== undefined) sanitized.depth = d;
  }
  if (dim.weight !== undefined) {
    sanitized.weight = dim.weight;
  }

  return sanitized;
}
