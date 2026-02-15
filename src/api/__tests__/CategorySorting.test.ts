import { readFileSync } from 'fs';
import { join } from 'path';

describe('Category Groups Sorting', () => {
    const filePath = join(process.cwd(), 'data', 'categorygroups.json');

    it('should have all categories sorted by Unicode code point within each group', () => {
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        for (const [groupName, groupData] of Object.entries(data)) {
            const categories = (groupData as any).categories;
            if (Array.isArray(categories)) {
                const sortedCategories = [...categories].sort();
                try {
                    expect(categories).toEqual(sortedCategories);
                } catch (_error) {
                    throw new Error(`Group "${groupName}" is not sorted correctly.\nExpected: ${JSON.stringify(sortedCategories, null, 2)}\nActual: ${JSON.stringify(categories, null, 2)}`, { cause: _error });
                }
            }
        }
    });
});
