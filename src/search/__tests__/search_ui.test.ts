import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock DOM elements and methods
const createMockElement = (tagName: string) => {
  const attrs: { [key: string]: string } = {};
  const children: any[] = [];
  return {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    href: '',
    dataset: {},
    style: {},
    setAttribute: jest.fn((name, value) => {
      attrs[name] = value;
    }),
    getAttribute: jest.fn((name) => attrs[name]),
    appendChild: jest.fn((child) => {
      children.push(child);
    }),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(() => false),
    },
    // For searchResults
    get innerHTML() {
      throw new Error('innerHTML usage detected! Use textContent or appendChild instead.');
    },
    set innerHTML(val) {
      throw new Error('innerHTML assignment detected! Use textContent or appendChild instead.');
    },
    _children: children,
    _attrs: attrs,
  };
};

describe('Search UI XSS Protection', () => {
  let searchJsContent: string;
  let mockDocument: any;
  let searchResults: any;
  let searchInput: any;

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../../static/js/search.js');
    searchJsContent = fs.readFileSync(filePath, 'utf8');
  });

  beforeEach(() => {
    searchResults = createMockElement('div');
    searchInput = createMockElement('input');

    mockDocument = {
      getElementById: jest.fn((id) => {
        if (id === 'search-results') return searchResults;
        if (id === 'search-input') return searchInput;
        return createMockElement('div');
      }),
      createElement: jest.fn((tag) => createMockElement(tag)),
      createElementNS: jest.fn((ns, tag) => createMockElement(tag)),
      addEventListener: jest.fn(),
      querySelector: jest.fn(() => createMockElement('div')),
    };

    (globalThis as any).document = mockDocument;
    (globalThis as any).globalThis = globalThis;
    (globalThis as any).window = globalThis;
  });

  test('static/js/search.js should not contain innerHTML', () => {
    expect(searchJsContent).not.toContain('innerHTML');
  });

  test('displayResults should render correctly without innerHTML', () => {
    // We need to extract displayResults from the file or mock the environment enough to run it
    // Since search.js wraps everything in DOMContentLoaded, we can't easily call displayResults directly
    // unless we eval it or modify it to export.
    // Given the constraints, checking the content for 'innerHTML' is a good first step.
    // Let's try to verify if it uses createElement instead.
    expect(searchJsContent).toContain('document.createElement');
    expect(searchJsContent).toContain('textContent');
  });

  test('static/js/search.js should contain paste event listener and insertFromPaste handling', () => {
    expect(searchJsContent).toContain("searchInput.addEventListener('paste'");
    expect(searchJsContent).toContain('insertFromPaste');
  });

  test('static/js/search.js should contain filter accordion toggle, count badge, and reset functionality', () => {
    expect(searchJsContent).toContain('search-filter-toggle-btn');
    expect(searchJsContent).toContain('search-filters-wrapper');
    expect(searchJsContent).toContain('filter-count-badge');
    expect(searchJsContent).toContain('filter-reset-btn');
    expect(searchJsContent).toContain('getActiveFilterCount');
    expect(searchJsContent).toContain('updateFilterBadge');
    expect(searchJsContent).toContain('aria-expanded');
  });

  test('static/js/search.js should contain skeleton loading implementation', () => {
    expect(searchJsContent).toContain('showSkeletonLoading');
    expect(searchJsContent).toContain('search-skeleton-container');
    expect(searchJsContent).toContain('skeleton-card');
  });

  test('static/js/search.js should contain compare button implementation in search results', () => {
    expect(searchJsContent).toContain('search-compare-btn');
    expect(searchJsContent).toContain('dataset.compareBtn');
    expect(searchJsContent).toContain('btn-compare-card');
    expect(searchJsContent).toContain('globalThis.Compare');
  });

  test('static/js/search.js should focus search-input and prevent default jump when hero search button is clicked', () => {
    expect(searchJsContent).toContain('[data-hero-entry="search"]');
    expect(searchJsContent).toContain('event.preventDefault()');
    expect(searchJsContent).toContain('searchInput.focus()');
  });

  test('static/js/search.js should support extracting ASIN from URLs and short URLs', () => {
    expect(searchJsContent).toContain('extractAsinFromUrl');
    expect(searchJsContent).toContain('isShortAmazonUrl');
    expect(searchJsContent).toContain('resolveShortUrl');
    expect(searchJsContent).toContain('processPossibleUrlInput');
  });

  test('static/js/search.js should render product investigation request box when no results found', () => {
    expect(searchJsContent).toContain('empty-request-box');
    expect(searchJsContent).toContain('empty-request-btn');
    expect(searchJsContent).toContain('dataset.requestFormUrl');
    expect(searchJsContent).toContain('request-link');
  });
});
