import * as fs from 'fs';
import * as path from 'path';

interface CategoryData {
    [key: string]: {
        categories?: string[];
        [key: string]: unknown;
    };
}

const filePath = path.join(process.cwd(), 'data', 'categorygroups.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CategoryData;

for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
        const group = data[key];
        if (group && group.categories && Array.isArray(group.categories)) {
            group.categories.sort();
        }
    }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
console.log('Successfully sorted categories using Node.js');
