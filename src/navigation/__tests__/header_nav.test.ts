import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Header Global Navigation', () => {
  let headerHtml: string;

  beforeAll(() => {
    const headerPath = path.join(__dirname, '../../../layouts/partials/header.html');
    headerHtml = fs.readFileSync(headerPath, 'utf8');
  });

  it('contains site-header-nav and all primary links', () => {
    expect(headerHtml).toContain('class="site-header-nav"');
    expect(headerHtml).toContain('class="header-nav-list"');
    expect(headerHtml).toContain('href="{{ `` | relURL }}"');
    expect(headerHtml).toContain('href="{{ `deals/` | relURL }}"');
    expect(headerHtml).toContain('href="{{ `bargain/` | relURL }}"');
    expect(headerHtml).toContain('href="{{ `brand/` | relURL }}"');
    expect(headerHtml).toContain('href="{{ `recommendations/` | relURL }}"');
    expect(headerHtml).toContain('href="{{ `low-scores/` | relURL }}"');

    // リンクの並び順が統一されていることを検証
    const navMatch = headerHtml.match(/<ul class="header-nav-list">([\s\S]*?)<\/ul>/);
    expect(navMatch).not.toBeNull();
    const navListContent = navMatch?.[1] ?? '';
    const linkOrder = [
      'href="{{ `` | relURL }}"',
      'href="{{ `recommendations/` | relURL }}"',
      'href="{{ `bargain/` | relURL }}"',
      'href="{{ `deals/` | relURL }}"',
      'href="{{ `brand/` | relURL }}"',
      'href="{{ `low-scores/` | relURL }}"',
    ];
    let lastIndex = -1;
    for (const link of linkOrder) {
      const currentIndex = navListContent.indexOf(link);
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    }
  });

  it('contains active navigation highlight script', () => {
    expect(headerHtml).toContain('highlightActiveHeaderNav');
    expect(headerHtml).toContain('aria-current');
  });
});
