import * as fs from 'node:fs';
import * as path from 'node:path';

describe('TOC ScrollSpy functionality (static/js/toc.js)', () => {
  let tocJsContent: string;

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../../static/js/toc.js');
    tocJsContent = fs.readFileSync(filePath, 'utf8');
  });

  test('toc.js includes correctly formatted selectors for all TOC containers', () => {
    // インライン、サイドバー、モーダルのすべてのコンテナが含まれていること
    expect(tocJsContent).toContain('.table-of-contents a, .toc-sidebar-body a, .toc-modal-body a');
  });

  test('toc.js includes decodeURIComponent for handling encoded Japanese IDs', () => {
    expect(tocJsContent).toContain('decodeURIComponent');
  });

  test('toc.js uses getBoundingClientRect for scroll position calculation', () => {
    expect(tocJsContent).toContain('getBoundingClientRect');
  });

  test('toc.js supports container scrollIntoView for active link visibility', () => {
    expect(tocJsContent).toContain('scrollIntoView');
    expect(tocJsContent).toContain('scrollActiveLinkIntoView');
  });

  test('toc.js sets aria-current attribute for active TOC link accessibility', () => {
    expect(tocJsContent).toContain("l.setAttribute('aria-current', 'true')");
    expect(tocJsContent).toContain("l.removeAttribute('aria-current')");
  });

  test('toc.js filters headings to only those present in TOC to maintain active state across sub-sections', () => {
    expect(tocJsContent).toContain('tocTargetIds');
    expect(tocJsContent).toContain('allHeadings.filter');
  });
});
