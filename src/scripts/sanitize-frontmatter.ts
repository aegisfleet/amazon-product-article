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
    const escaped = inner.replace(/(?<!\\)"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

function sanitizeFrontmatterLine(line: string): string {
  // Match key: "value" pattern, or list items: - "value"
  // 1. We match the start of the line up to the first double quote.
  // 2. We match the quoted string itself.
  // 3. We match any trailing characters (like `]`, `,`, etc).
  
  // Array items: `  - "value"` or `images: ["url1", "url2"]`
  // We can use a regex replacement to find any `"..."` and sanitize the inside,
  // but we must be careful not to break valid JSON/YAML.
  // A safer approach: find all substrings that start with `"` and end with `"`,
  // and manually escape inner quotes.
  
  // Let's use a regex that matches quoted strings where there might be unescaped quotes inside.
  // This is tricky because `"` is both the delimiter and the character we want to escape.
  // However, we know that frontmatter usually looks like `key: "val"`, `- "val"`, or `["val", "val"]`.
  
  // Here is a simpler approach that specifically targets the `key: "value"` pattern 
  // and the array pattern `images: ["...", "..."]` that broke Hugo earlier.
  
  // Simple key: "value" match (allowing trailing characters or comments)
  const kvMatch = line.match(/^(\s*-?\s*\w*:\s*)(".*)(".*)$/); // This might be too complex for simple regex.
  
  // Let's instead just use the existing regex for simple `key: "value"`
  const simpleMatch = line.match(/^(\s*-?\s*\w*:\s*)(".*)$/);
  if (simpleMatch) {
    const prefix = simpleMatch[1];
    let value = simpleMatch[2];
    
    if (prefix && value) {
        // If it looks like an array, e.g. `["val1", "val2"]`
        if (value.startsWith('["') && value.endsWith('"]')) {
           // We'll roughly assume no internal escaped `\"]` for now, just split by `, ` and fix each
           const inner = value.slice(1, -1);
           const parts = inner.split(/,\s*/);
           const fixedParts = parts.map(p => {
               if(p.startsWith('"') && p.endsWith('"') && p.length >= 2) {
                   return escapeQuotesInYamlValue(p);
               }
               return p;
           });
           return `${prefix}[${fixedParts.join(', ')}]`;
        }
        
        // Check if there's trailing brace or nothing
        if (value.startsWith('"')) {
             // Find the last quote
             const lastQuoteIdx = value.lastIndexOf('"');
             if (lastQuoteIdx > 0) {
                 const actualValue = value.substring(0, lastQuoteIdx + 1);
                 const trailing = value.substring(lastQuoteIdx + 1);
                 return prefix + escapeQuotesInYamlValue(actualValue) + trailing;
             }
        }
    }
  }
  
  // Fallback for list items like `  - "value"`
  const listMatch = line.match(/^(\s*-\s*)(".*)$/);
  if (listMatch && listMatch[1] && listMatch[2]) {
      const prefix = listMatch[1];
      const value = listMatch[2];
      
      const lastQuoteIdx = value.lastIndexOf('"');
      if (lastQuoteIdx > 0) {
            const actualValue = value.substring(0, lastQuoteIdx + 1);
            const trailing = value.substring(lastQuoteIdx + 1);
            return prefix + escapeQuotesInYamlValue(actualValue) + trailing;
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
