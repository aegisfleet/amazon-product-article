import * as fs from 'node:fs';
import * as path from 'node:path';

interface CategoryData {
  [key: string]: {
    categories?: string[];
    [key: string]: unknown;
  };
}

const filePath = path.join(process.cwd(), 'data', 'categorygroups.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CategoryData;

for (const key in data) {
  if (Object.hasOwn(data, key)) {
    const group = data[key];
    if (group?.categories && Array.isArray(group.categories)) {
      group.categories.sort((a, b) => a.localeCompare(b));
    }
  }
}

fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
console.log('Successfully sorted categories using Node.js');
