import * as path from 'path';
import { CategoryManager } from '../category/CategoryManager';
import { ProductCounter } from '../category/ProductCounter';

const categoryGroupsPath = path.resolve(process.cwd(), 'data/categorygroups.json');
const contentPath = path.resolve(process.cwd(), 'content');
const outJsonPath = path.resolve(process.cwd(), 'static/data/categorygroups.json');
const outYamlPath = path.resolve(process.cwd(), 'data/categories.yml');

function main() {
    try {
        console.log('Starting category enhancement...');
        const manager = new CategoryManager(categoryGroupsPath);
        manager.loadCategoryGroups();

        const counter = new ProductCounter(contentPath);
        counter.countProductsByCategory();
        const enhanced = manager.enhanceCategoryGroups(counter);

        manager.exportToJSON(outJsonPath);
        manager.exportToYAML(outYamlPath);

        console.log(`Successfully enhanced ${enhanced.length} parent categories.`);
    } catch (e) {
        console.error('Error during category enhancement:', e);
        process.exit(1);
    }
}

main();
