import { mergeCacheObjects, mergeContent } from '../merge-product-cache';

describe('merge-product-cache', () => {
  describe('mergeCacheObjects', () => {
    it('should add new entries from ours if not present in theirs', () => {
      const ours = {
        ASIN1: { data: { title: 'Item 1' }, timestamp: 1000, status: 'valid' },
      };
      const theirs = {
        ASIN2: { data: { title: 'Item 2' }, timestamp: 1000, status: 'valid' },
      };

      const { merged, addedFromOurs, updatedFromOurs, keptTheirs } = mergeCacheObjects(ours, theirs);

      expect(merged).toHaveProperty('ASIN1');
      expect(merged).toHaveProperty('ASIN2');
      expect(addedFromOurs).toBe(1);
      expect(updatedFromOurs).toBe(0);
      expect(keptTheirs).toBe(0);
    });

    it('should update entry from ours if ours has newer timestamp', () => {
      const ours = {
        ASIN1: { data: { title: 'New Item 1' }, timestamp: 2000, status: 'valid' },
      };
      const theirs = {
        ASIN1: { data: { title: 'Old Item 1' }, timestamp: 1000, status: 'valid' },
      };

      const { merged, addedFromOurs, updatedFromOurs, keptTheirs } = mergeCacheObjects(ours, theirs);

      const entry = merged.ASIN1;
      expect(entry).toBeDefined();
      expect((entry!.data as { title: string }).title).toBe('New Item 1');
      expect(addedFromOurs).toBe(0);
      expect(updatedFromOurs).toBe(1);
      expect(keptTheirs).toBe(0);
    });

    it('should keep entry from theirs if theirs has newer or equal timestamp', () => {
      const ours = {
        ASIN1: { data: { title: 'Old Item 1' }, timestamp: 1000, status: 'valid' },
      };
      const theirs = {
        ASIN1: { data: { title: 'New Item 1' }, timestamp: 2000, status: 'valid' },
      };

      const { merged, addedFromOurs, updatedFromOurs, keptTheirs } = mergeCacheObjects(ours, theirs);

      const entry = merged.ASIN1;
      expect(entry).toBeDefined();
      expect((entry!.data as { title: string }).title).toBe('New Item 1');
      expect(addedFromOurs).toBe(0);
      expect(updatedFromOurs).toBe(0);
      expect(keptTheirs).toBe(1);
    });
  });

  describe('mergeContent', () => {
    it('should correctly merge JSON strings and output sorted JSON', () => {
      const oursStr = JSON.stringify({
        B_ASIN: { data: {}, timestamp: 100, status: 'valid' },
      });
      const theirsStr = JSON.stringify({
        A_ASIN: { data: {}, timestamp: 200, status: 'valid' },
      });

      const { merged, json } = mergeContent(oursStr, theirsStr);

      expect(merged).toHaveProperty('A_ASIN');
      expect(merged).toHaveProperty('B_ASIN');
      expect(json.endsWith('\n')).toBe(true);
      const lines = json.trimEnd().split('\n');
      expect(lines[1]).toContain('"A_ASIN"');
      expect(lines[2]).toContain('"B_ASIN"');
    });

    it('should handle empty or invalid JSON gracefully', () => {
      const oursStr = '';
      const theirsStr = JSON.stringify({
        A_ASIN: { data: {}, timestamp: 200, status: 'valid' },
      });

      const { merged } = mergeContent(oursStr, theirsStr);
      expect(merged).toHaveProperty('A_ASIN');
    });
  });
});
