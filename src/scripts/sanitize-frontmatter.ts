import * as fs from 'node:fs';
import * as path from 'node:path';

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
    const escaped = inner.replaceAll(/(?<!\\)"/g, String.raw`\"`);
    return `"${escaped}"`;
  }
  return value;
}

function processArrayValue(prefix: string, value: string): string | null {
  if (!value.startsWith('["') || !value.endsWith('"]')) return null;
  const inner = value.slice(1, -1);
  const parts = inner.split(/,\s*/);
  const fixedParts = parts.map((p) => {
    if (p.startsWith('"') && p.endsWith('"') && p.length >= 2) {
      return escapeQuotesInYamlValue(p);
    }
    return p;
  });
  return `${prefix}[${fixedParts.join(', ')}]`;
}

function processStringValue(prefix: string, value: string): string | null {
  if (!value.startsWith('"')) return null;
  const lastQuoteIdx = value.lastIndexOf('"');
  if (lastQuoteIdx > 0) {
    const actualValue = value.substring(0, lastQuoteIdx + 1);
    const trailing = value.substring(lastQuoteIdx + 1);
    return prefix + escapeQuotesInYamlValue(actualValue) + trailing;
  }
  return null;
}

function sanitizeFrontmatterLine(line: string): string {
  // Simple key: "value" match (allowing trailing characters or comments)
  const simpleMatch = /^(\s*-?\s*\w*:\s*)(".*)$/.exec(line);
  const prefix = simpleMatch?.[1];
  const value = simpleMatch?.[2];

  if (prefix && value) {
    const arrayResult = processArrayValue(prefix, value);
    if (arrayResult) return arrayResult;

    const stringResult = processStringValue(prefix, value);
    if (stringResult) return stringResult;
  }

  // Fallback for list items like `  - "value"`
  const listMatch = /^(\s*-\s*)(".*)$/.exec(line);
  const listPrefix = listMatch?.[1];
  const listValue = listMatch?.[2];

  if (listPrefix && listValue) {
    const stringResult = processStringValue(listPrefix, listValue);
    if (stringResult) return stringResult;
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
  if (lines[0]?.trim() !== '---') {
    return false;
  }

  // Find the end of frontmatter
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line?.trim() === '---') {
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

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
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
