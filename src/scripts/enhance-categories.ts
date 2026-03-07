import * as path from 'node:path';
import { CategoryManager } from '../category/CategoryManager';
import { ProductCounter } from '../category/ProductCounter';

const categoryGroupsPath = path.resolve(process.cwd(), 'data/categorygroups.json');
const contentPath = path.resolve(process.cwd(), 'content');
const outJsonPath = path.resolve(process.cwd(), 'static/data/categorygroups.json');
const outYamlPath = path.resolve(process.cwd(), 'data/categories.yml');

function main(): void {
  try {
    console.log('Starting category enhancement...');
    const manager = new CategoryManager(categoryGroupsPath);
    manager.loadCategoryGroups();

    const counter = new ProductCounter(contentPath);
    counter.countProductsByCategory();
    const enhanced = manager.enhanceCategoryGroups(counter);

    manager.exportToJSON(outJsonPath);
    manager.exportToYAML(outYamlPath);

    const parentCategoryDir = path.join(contentPath, 'parent-category');
    manager.syncParentCategoryMarkdown(parentCategoryDir);

    console.log(`Successfully enhanced ${enhanced.length} parent categories and synced markdown files.`);
  } catch (e) {
    console.error('Error during category enhancement:', e);
    process.exit(1);
  }
}

main();
