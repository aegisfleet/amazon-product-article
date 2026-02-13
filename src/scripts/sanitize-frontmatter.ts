import * as fs from 'fs';
import * as path from 'path';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'articles');

/**
 * Escapes internal double quotes within a YAML string value.
 * For example: `"Lenovo Legion Tab (8.8", 3)"` becomes `"Lenovo Legion Tab (8.8\", 3)"`
 */
function escapeQuotesInYamlValue(value: string): string {
    // If the value is wrapped in double quotes, we need to escape internal quotes
    if (value.startsWith('"') && value.endsWith('"')) {
        const inner = value.slice(1, -1);
        // Escape any unescaped double quotes inside
        const escaped = inner.replace(/(?<!\\)"/g, '\\"');
        return `"${escaped}"`;
    }
    return value;
}

/**
 * Sanitize a single frontmatter line
 */
function sanitizeFrontmatterLine(line: string): string {
    // Match key: "value" pattern
    const match = line.match(/^(\s*\w+:\s*)(".*)$/);
    if (match) {
        // Explicitly handle potential undefined checks for array access
        const prefix = match[1];
        const value = match[2];
        if (prefix !== undefined && value !== undefined) {
            return prefix + escapeQuotesInYamlValue(value);
        }
    }
    return line;
}

/**
 * Process a single markdown file
 */
function processFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
        return false;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Check if file starts with frontmatter
    const firstLine = lines[0];
    if (firstLine === undefined || firstLine.trim() !== '---') {
        return false;
    }

    // Find the end of frontmatter
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line !== undefined && line.trim() === '---') {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        console.warn(`Warning: No closing frontmatter delimiter in ${filePath}`);
        return false;
    }

    // Sanitize frontmatter lines
    let modified = false;
    for (let i = 1; i < endIndex; i++) {
        const original = lines[i];
        if (original === undefined) continue;

        const sanitized = sanitizeFrontmatterLine(original);
        if (sanitized !== original) {
            lines[i] = sanitized;
            modified = true;
            console.log(`Fixed: ${path.basename(filePath)} line ${i + 1}`);
            console.log(`  Before: ${original}`);
            console.log(`  After:  ${sanitized}`);
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    }

    return modified;
}

/**
 * Main function
 */
function main(): void {
    console.log('Sanitizing frontmatter in content/articles...');

    if (!fs.existsSync(CONTENT_DIR)) {
        console.log('No content/articles directory found, skipping.');
        return;
    }

    const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
    let fixedCount = 0;

    for (const file of files) {
        const filePath = path.join(CONTENT_DIR, file);
        if (processFile(filePath)) {
            fixedCount++;
        }
    }

    console.log(`Sanitization complete. Fixed ${fixedCount} file(s).`);
}

main();
