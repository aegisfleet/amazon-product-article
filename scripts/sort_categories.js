const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'data', 'categorygroups.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

for (const key in data) {
    if (data[key].categories) {
        data[key].categories.sort();
    }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
console.log('Successfully sorted categories using Node.js');
