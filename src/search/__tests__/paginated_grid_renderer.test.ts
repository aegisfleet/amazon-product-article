import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

interface MockNode {
  nodeType?: number;
  childNodes?: MockNode[];
  tagName?: string;
  id?: number;
}

interface PaginatedRendererInstance {
  setItems: (items: any[]) => void;
  loadMore: () => boolean;
  getRenderedCount: () => number;
  getTotalCount: () => number;
  destroy: () => void;
}

describe('createPaginatedGridRenderer (filter-common.js)', () => {
  let filterCommonJsContent: string;

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../../static/js/filter-common.js');
    filterCommonJsContent = fs.readFileSync(filePath, 'utf8');
  });

  function createTestContext() {
    const children: MockNode[] = [];
    const mockGridEl = {
      children,
      appendChild: jest.fn((node: MockNode) => {
        if (node.nodeType === 11 && node.childNodes) {
          children.push(...node.childNodes);
        } else {
          children.push(node);
        }
      }),
      replaceChildren: jest.fn((...nodes: MockNode[]) => {
        children.length = 0;
        if (nodes.length > 0) {
          for (const node of nodes) {
            if (node.nodeType === 11 && node.childNodes) {
              children.push(...node.childNodes);
            } else {
              children.push(node);
            }
          }
        }
      }),
      parentNode: {
        insertBefore: jest.fn(),
      },
      nextSibling: null,
      innerHTML: '',
    };

    const mockLoadMoreContainer = {
      style: { display: 'none' },
      parentNode: {
        insertBefore: jest.fn(),
      },
    };

    const mockLoadMoreBtn = {
      disabled: false,
      textContent: '',
      addEventListener: jest.fn(),
    };

    const mockDocument = {
      readyState: 'complete',
      createElement: jest.fn((tag: string) => ({
        tagName: tag.toUpperCase(),
        style: {},
        className: '',
        remove: jest.fn(),
      })),
      createDocumentFragment: jest.fn(() => ({
        nodeType: 11,
        childNodes: [] as any[],
        appendChild(child: any) {
          this.childNodes.push(child);
        },
      })),
      querySelectorAll: jest.fn(() => []),
      addEventListener: jest.fn(),
    };

    const context = vm.createContext({
      document: mockDocument,
      window: {
        matchMedia: jest.fn(() => ({ matches: false, addEventListener: jest.fn() })),
      },
      console,
      setTimeout,
      clearTimeout,
    });

    vm.runInContext(filterCommonJsContent, context);

    return {
      context,
      mockGridEl,
      mockLoadMoreContainer,
      mockLoadMoreBtn,
    };
  }

  it('renders only initial batch items when items count exceeds batchSize', () => {
    const { context, mockGridEl, mockLoadMoreContainer, mockLoadMoreBtn } = createTestContext();

    const renderer: PaginatedRendererInstance = (context as any).createPaginatedGridRenderer({
      gridEl: mockGridEl,
      loadMoreContainer: mockLoadMoreContainer,
      loadMoreBtn: mockLoadMoreBtn,
      batchSize: 10,
      renderItem: (item: any) => ({ item, tagName: 'DIV' }),
    });

    const items = Array.from({ length: 35 }, (_, i) => ({ id: i }));
    renderer.setItems(items);

    expect(renderer.getRenderedCount()).toBe(10);
    expect(renderer.getTotalCount()).toBe(35);
    expect(mockGridEl.children).toHaveLength(10);
    expect(mockLoadMoreContainer.style.display).toBe('flex');
    expect(mockLoadMoreBtn.textContent).toContain('10 / 35件');
  });

  it('loads next batch upon calling loadMore()', () => {
    const { context, mockGridEl, mockLoadMoreContainer, mockLoadMoreBtn } = createTestContext();

    const renderer: PaginatedRendererInstance = (context as any).createPaginatedGridRenderer({
      gridEl: mockGridEl,
      loadMoreContainer: mockLoadMoreContainer,
      loadMoreBtn: mockLoadMoreBtn,
      batchSize: 10,
      renderItem: (item: any) => ({ item, tagName: 'DIV' }),
    });

    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
    renderer.setItems(items);

    expect(renderer.getRenderedCount()).toBe(10);

    const hasLoadedMore = renderer.loadMore();
    expect(hasLoadedMore).toBe(true);
    expect(renderer.getRenderedCount()).toBe(20);
    expect(mockGridEl.children).toHaveLength(20);
    expect(mockLoadMoreBtn.textContent).toContain('20 / 25件');

    const hasLoadedFinal = renderer.loadMore();
    expect(hasLoadedFinal).toBe(true);
    expect(renderer.getRenderedCount()).toBe(25);
    expect(mockGridEl.children).toHaveLength(25);
    expect(mockLoadMoreContainer.style.display).toBe('none');
    expect(mockLoadMoreBtn.textContent).toBe('すべて表示済み');

    // Subsequent calls return false
    expect(renderer.loadMore()).toBe(false);
  });

  it('handles empty items array properly', () => {
    const { context, mockGridEl, mockLoadMoreContainer } = createTestContext();

    const renderer: PaginatedRendererInstance = (context as any).createPaginatedGridRenderer({
      gridEl: mockGridEl,
      loadMoreContainer: mockLoadMoreContainer,
      batchSize: 10,
    });

    renderer.setItems([]);
    expect(renderer.getRenderedCount()).toBe(0);
    expect(renderer.getTotalCount()).toBe(0);
    expect(mockGridEl.children).toHaveLength(0);
    expect(mockLoadMoreContainer.style.display).toBe('none');
  });

  it('hides loadMoreContainer when items count is less than batchSize', () => {
    const { context, mockGridEl, mockLoadMoreContainer } = createTestContext();

    const renderer: PaginatedRendererInstance = (context as any).createPaginatedGridRenderer({
      gridEl: mockGridEl,
      loadMoreContainer: mockLoadMoreContainer,
      batchSize: 20,
      renderItem: (item: any) => ({ item }),
    });

    renderer.setItems([{ id: 1 }, { id: 2 }]);
    expect(renderer.getRenderedCount()).toBe(2);
    expect(renderer.getTotalCount()).toBe(2);
    expect(mockGridEl.children).toHaveLength(2);
    expect(mockLoadMoreContainer.style.display).toBe('none');
  });
});
