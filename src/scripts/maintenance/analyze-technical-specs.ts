/**
 * technicalSpecs フィールドの分析スクリプト
 * data/investigations 配下のJSONファイルからtechnicalSpecsのパラメータを集計
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface SpecAnalysis {
  fieldName: string;
  count: number;
  examples: string[];
  types: Set<string>;
}

interface NestedFieldAnalysis {
  parentField: string;
  childFields: Map<string, SpecAnalysis>;
}

const investigationsDir = path.join(__dirname, '../../../data/investigations');

// 集計結果
const fieldStats: Map<string, SpecAnalysis> = new Map();
const nestedStats: Map<string, NestedFieldAnalysis> = new Map();
let totalFilesWithSpecs = 0;
let totalFiles = 0;

// 未定義のフィールドを追跡（JulesTypes.tsにないフィールド）
const undefinedFields: Map<string, { count: number; examples: string[]; files: string[] }> = new Map();

// JulesTypes.tsで定義済みのTechnicalSpecsフィールド
const definedFields = new Set([
  // スマートフォン・タブレット・PC
  'os',
  'cpu',
  'gpu',
  'ram',
  'storage',
  'display',
  'battery',
  'camera',
  'dimensions',
  'connectivity',
  // イヤホン・ヘッドホン
  'driver',
  'codec',
  'noiseCancel',
  // 家電・その他
  'power',
  'capacity',
  'other',
  // 靴（シューズ）
  'width',
  'weight',
  'material',
  'midsole',
  'cushioningTech',
  'heelCounter',
  'modelNumber',
  'model',
  'category',
  // 素材の詳細
  'upperMaterial',
  'midsoleMaterial',
  'outsoleMaterial',
  'outerSole',
  'insoleMaterial',
  'innerSole',
  'insole',
  // その他
  'countryOfOrigin',
  'heelHeight',
  'loadCapacity',
  'attachments',
]);

// ネストされたオブジェクト内で定義済みのフィールド
const nestedDefinedFields: Record<string, Set<string>> = {
  display: new Set(['size', 'resolution', 'type', 'refreshRate']),
  battery: new Set(['capacity', 'charging', 'playbackTime']),
  camera: new Set(['main', 'ultrawide', 'telephoto', 'front']),
  dimensions: new Set(['height', 'width', 'depth', 'weight']),
  material: new Set(['upper', 'outsole', 'insole']),
};

function analyzeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function analyzeField(fieldName: string, value: unknown, fileName: string): void {
  const existing = fieldStats.get(fieldName) || {
    fieldName,
    count: 0,
    examples: [],
    types: new Set<string>(),
  };

  existing.count++;
  existing.types.add(analyzeValue(value));

  // サンプル値を保存（最大3件）
  if (existing.examples.length < 3 && value !== null && value !== undefined) {
    const strValue = JSON.stringify(value);
    if (!existing.examples.includes(strValue)) {
      existing.examples.push(strValue);
    }
  }

  fieldStats.set(fieldName, existing);

  // 未定義フィールドの追跡
  if (!definedFields.has(fieldName)) {
    const undefinedInfo = undefinedFields.get(fieldName) || { count: 0, examples: [], files: [] };
    undefinedInfo.count++;
    if (undefinedInfo.examples.length < 3 && value !== null && value !== undefined) {
      const strValue = JSON.stringify(value);
      if (!undefinedInfo.examples.includes(strValue)) {
        undefinedInfo.examples.push(strValue);
      }
    }
    if (!undefinedInfo.files.includes(fileName)) {
      undefinedInfo.files.push(fileName);
    }
    undefinedFields.set(fieldName, undefinedInfo);
  }
}

function analyzeNestedField(parentField: string, childField: string, value: unknown, fileName: string): void {
  const parent = nestedStats.get(parentField) || {
    parentField,
    childFields: new Map<string, SpecAnalysis>(),
  };

  const existing = parent.childFields.get(childField) || {
    fieldName: childField,
    count: 0,
    examples: [],
    types: new Set<string>(),
  };

  existing.count++;
  existing.types.add(analyzeValue(value));

  if (existing.examples.length < 3 && value !== null && value !== undefined) {
    const strValue = JSON.stringify(value);
    if (!existing.examples.includes(strValue)) {
      existing.examples.push(strValue);
    }
  }

  parent.childFields.set(childField, existing);
  nestedStats.set(parentField, parent);

  // ネストされた未定義フィールドの追跡
  const nestedDefined = nestedDefinedFields[parentField];
  if (!nestedDefined || !nestedDefined.has(childField)) {
    const undefinedKey = `${parentField}.${childField}`;
    const undefinedInfo = undefinedFields.get(undefinedKey) || { count: 0, examples: [], files: [] };
    undefinedInfo.count++;
    if (undefinedInfo.examples.length < 3 && value !== null && value !== undefined) {
      const strValue = JSON.stringify(value);
      if (!undefinedInfo.examples.includes(strValue)) {
        undefinedInfo.examples.push(strValue);
      }
    }
    if (!undefinedInfo.files.includes(fileName)) {
      undefinedInfo.files.push(fileName);
    }
    undefinedFields.set(undefinedKey, undefinedInfo);
  }
}

function processFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    totalFiles++;

    const technicalSpecs = data.analysis?.technicalSpecs;
    if (!technicalSpecs) return;

    totalFilesWithSpecs++;
    const fileName = path.basename(filePath);

    for (const [key, value] of Object.entries(technicalSpecs)) {
      analyzeField(key, value, fileName);

      // ネストされたオブジェクトの分析
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
          analyzeNestedField(key, childKey, childValue, fileName);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

function printTopLevelFields(): void {
  console.log('📋 トップレベルフィールドの出現頻度（降順）');
  console.log('============================================\n');

  const sortedFields = Array.from(fieldStats.values()).sort((a, b) => b.count - a.count);

  for (const field of sortedFields) {
    const isDefined = definedFields.has(field.fieldName) ? '✓' : '✗';
    const typesStr = Array.from(field.types).join(', ');
    console.log(`  ${isDefined} ${field.fieldName}: ${field.count}件`);
    console.log(`      型: ${typesStr}`);
    console.log(`      例: ${field.examples.slice(0, 2).join(', ')}`);
    console.log('');
  }
}

function printNestedFields(): void {
  if (nestedStats.size === 0) return;

  console.log('\n📋 ネストされたフィールドの詳細');
  console.log('================================\n');

  for (const [parentField, parent] of nestedStats.entries()) {
    console.log(`  🔹 ${parentField}:`);
    const sortedChildren = Array.from(parent.childFields.values()).sort((a, b) => b.count - a.count);
    for (const child of sortedChildren) {
      const nestedDefined = nestedDefinedFields[parentField];
      const isDefined = nestedDefined?.has(child.fieldName) ? '✓' : '✗';
      console.log(`      ${isDefined} ${child.fieldName}: ${child.count}件`);
      console.log(`          例: ${child.examples.slice(0, 2).join(', ')}`);
    }
    console.log('');
  }
}

function printUndefinedFields(): void {
  if (undefinedFields.size === 0) return;

  console.log('\n⚠️  JulesTypes.ts で未定義のフィールド');
  console.log('=====================================\n');

  const sortedUndefined = Array.from(undefinedFields.entries()).sort((a, b) => b[1].count - a[1].count);

  for (const [fieldName, info] of sortedUndefined) {
    console.log(`  ❌ ${fieldName}: ${info.count}件`);
    console.log(`      例: ${info.examples.slice(0, 2).join(', ')}`);
    console.log(`      ファイル: ${info.files.slice(0, 3).join(', ')}${info.files.length > 3 ? '...' : ''}`);
    console.log('');
  }
}

function printUnusedFields(): void {
  console.log('\n📊 定義済みだが未使用のフィールド');
  console.log('==================================\n');
  const usedFields = new Set(fieldStats.keys());
  const unusedFields = Array.from(definedFields).filter((f) => !usedFields.has(f));
  if (unusedFields.length > 0) {
    console.log(`  ${unusedFields.join(', ')}`);
  } else {
    console.log('  なし');
  }
}

function main(): void {
  console.log('================================================================================');
  console.log('  technicalSpecs フィールド分析レポート');
  console.log('================================================================================\n');

  // 全JSONファイルを処理
  const files = fs.readdirSync(investigationsDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    processFile(path.join(investigationsDir, file));
  }

  console.log(`📊 基本統計`);
  console.log(`-----------`);
  console.log(`  総ファイル数: ${totalFiles}`);
  console.log(`  technicalSpecs を含むファイル: ${totalFilesWithSpecs}`);
  console.log(`  ユニークフィールド数: ${fieldStats.size}`);
  console.log('');

  printTopLevelFields();
  printNestedFields();
  printUndefinedFields();
  printUnusedFields();
}

main();
