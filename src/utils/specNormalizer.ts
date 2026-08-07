import type { BatterySpec, DisplaySpec, TechnicalSpecs } from '../types/JulesTypes';

/**
 * technicalSpecs 内の `other` 配列等に一括格納されたテキスト（例: "SoC: Snapdragon...", "OS: HyperOS..."）を
 * 構造化された個別キー（cpu, os, ram, storage, display, battery等）へ自動的に解析・昇格する
 */
export function normalizeTechnicalSpecs(specs: TechnicalSpecs | undefined | null): TechnicalSpecs {
  if (!specs) {
    return {};
  }

  // ディープコピー風にシャロー複製を作成
  const normalized: TechnicalSpecs = { ...specs };

  const otherItems: string[] = [];
  if (Array.isArray(specs.other)) {
    otherItems.push(...specs.other.map((item) => String(item).trim()));
  } else if (typeof specs.other === 'string' && specs.other.trim().length > 0) {
    // スラッシュ区切りや改行区切りの文字列を分割
    const splitItems = specs.other.split(/[/,\n]/).map((item) => item.trim());
    otherItems.push(...splitItems);
  }

  const remainingOther: string[] = [];

  for (const item of otherItems) {
    if (!item) continue;

    // SoC / CPU / プロセッサ
    const cpuMatch = item.match(/^(?:SoC|CPU|プロセッサ|プロセッサー|チップセット)\s*[:：]\s*(.+)$/i);
    const cpuVal = cpuMatch?.[1];
    if (cpuVal) {
      if (!normalized.cpu && !normalized.processor) {
        normalized.cpu = cpuVal.trim();
      }
      continue;
    }

    // OS / オペレーティングシステム
    const osMatch = item.match(/^(?:OS|オペレーティングシステム)\s*[:：]\s*(.+)$/i);
    const osVal = osMatch?.[1];
    if (osVal) {
      if (!normalized.os) {
        normalized.os = osVal.trim();
      }
      continue;
    }

    // RAM / メモリ
    const ramMatch = item.match(/^(?:RAM|メモリ)\s*[:：]\s*(.+)$/i);
    const ramVal = ramMatch?.[1];
    if (ramVal) {
      if (!normalized.ram && !normalized.memory) {
        normalized.ram = ramVal.trim();
      }
      continue;
    }

    // ROM / ストレージ
    const storageMatch = item.match(/^(?:ROM|ストレージ)\s*[:：]\s*(.+)$/i);
    const storageVal = storageMatch?.[1];
    if (storageVal) {
      if (!normalized.storage) {
        normalized.storage = storageVal.trim();
      }
      continue;
    }

    // ディスプレイ / 画面
    const displayMatch = item.match(/^(?:ディスプレイ|画面|液晶|モニター)\s*[:：]\s*(.+)$/i);
    const displayVal = displayMatch?.[1];
    if (displayVal) {
      if (!normalized.display) {
        normalized.display = parseDisplaySpec(displayVal.trim());
      }
      continue;
    }

    // バッテリー / 電池
    const batteryMatch = item.match(/^(?:バッテリー|電池)\s*[:：]\s*(.+)$/i);
    const batteryVal = batteryMatch?.[1];
    if (batteryVal) {
      if (!normalized.battery) {
        normalized.battery = parseBatterySpec(batteryVal.trim());
      }
      continue;
    }

    // カラー / 色
    const colorMatch = item.match(/^(?:カラー|色)\s*[:：]\s*(.+)$/i);
    const colorVal = colorMatch?.[1];
    if (colorVal) {
      if (!normalized.color) {
        normalized.color = colorVal.trim();
      }
      continue;
    }

    // 重量の誤混入パターン (例: "重量: 485g")
    const weightMatch = item.match(/^(?:重量|重さ)\s*[:：]\s*(.+)$/i);
    const weightVal = weightMatch?.[1];
    if (weightVal) {
      if (!normalized.weight) {
        normalized.weight = weightVal.trim();
      }
      continue;
    }

    // マッチしなかった項目はその他のまま残す
    remainingOther.push(item);
  }

  // dimensions の異常値クレンジング（例: "1734.2mm" -> "173.4mm" や、幅・高さの不自然な桁ずれ）
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

  // サイズ抽出 (例: 28.4cm, 11.2インチ)
  const sizeMatch = val.match(/(\d+(?:\.\d+)?\s*(?:cm|mm|インチ))/i);
  const sizeVal = sizeMatch?.[1];
  if (sizeVal) {
    spec.size = sizeVal;
  }

  // 解像度抽出 (例: 3.2K, 3200×2136, 1920x1080)
  const resMatch = val.match(/(\d+(?:\.\d+)?K|\d{3,4}\s*[\u00D7xX\u2715]\s*\d{3,4})/i);
  const resVal = resMatch?.[1];
  if (resVal) {
    spec.resolution = resVal;
  }

  // リフレッシュレート抽出 (例: 144Hz, 120Hz)
  const refreshMatch = val.match(/(\d+\s*Hz)/i);
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

  // 容量 (例: 9200mAh)
  const capMatch = val.match(/(\d+\s*mAh)/i);
  const capVal = capMatch?.[1];
  if (capVal) {
    spec.capacity = capVal;
  } else {
    spec.capacity = val;
  }

  // 充電 (例: 45W急速充電対応, 67W充電)
  const chargeMatch = val.match(/(\d+\s*W\s*(?:急速)?充電[^\s,]*)/i);
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
    const match = val.match(/^(\d+(?:\.\d+)?)\s*(mm|cm)$/i);
    const numStr = match?.[1];
    const unitStr = match?.[2];
    if (!numStr || !unitStr) return val;

    const num = parseFloat(numStr);
    const unit = unitStr.toLowerCase();

    if (unit === 'mm' && num > 1000) {
      // 例: 1734.2mm -> 173.4mm (小数点の付け間違い)
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
