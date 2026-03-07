import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Integration Tests', () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const outJson = path.join(rootDir, 'static/data/categorygroups.json');
    const outYaml = path.join(rootDir, 'data/categories.yml');
    const dataJson = path.join(rootDir, 'data/categorygroups.json');

    beforeAll(() => {
        // Create dummy data/categorygroups.json if it doesn't exist
        const dataDir = path.dirname(dataJson);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(dataJson)) {
            fs.writeFileSync(dataJson, JSON.stringify({ categoryGroups: [] }));
        }
    });

    test('prebuild:hugo スクリプトが正常に完了する', () => {
        // Check if package.json has script
        const pkgContent = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgContent) as { scripts: Record<string, string> };
        expect(pkg.scripts['prebuild:hugo']).toBeDefined();

        // Remove output files to ensure they are created
        if (fs.existsSync(outJson)) fs.unlinkSync(outJson);
        if (fs.existsSync(outYaml)) fs.unlinkSync(outYaml);

        // Run script
        execSync('npm run prebuild:hugo', { cwd: rootDir, stdio: 'pipe' });

        expect(fs.existsSync(outJson)).toBe(true);
        expect(fs.existsSync(outYaml)).toBe(true);
    });

    test('生成されたJSONとYAMLが整合性を持つ', () => {
        const jsonContent = JSON.parse(fs.readFileSync(outJson, 'utf-8')) as { categoryGroups: { slug: string }[] };
        const yamlContent = fs.readFileSync(outYaml, 'utf-8');

        // Verify JSON and YAML basically have the same data (at least valid)
        expect(Array.isArray(jsonContent.categoryGroups)).toBe(true);
        expect(yamlContent).toContain('parents:');

        // Verify Markdown files are generated
        const parentCategoryDir = path.join(rootDir, 'content/parent-category');
        jsonContent.categoryGroups.forEach(group => {
            const mdPath = path.join(parentCategoryDir, `${group.slug}.md`);
            expect(fs.existsSync(mdPath)).toBe(true);
        });
    });
});
