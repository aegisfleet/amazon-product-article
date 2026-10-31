import * as fs from 'node:fs/promises';
import { CategoryOrganizer } from '../CategoryOrganizer';

jest.mock('node:fs/promises');

describe('CategoryOrganizer', () => {
  let organizer: CategoryOrganizer;

  beforeEach(() => {
    organizer = new CategoryOrganizer();
    jest.clearAllMocks();
  });

  describe('getUnregisteredCategories', () => {
    it('should sort unregistered categories alphabetically', async () => {
      // Mock categorygroups.json
      const mockGroups = {
        家電: { slug: 'appliances', categories: ['冷蔵庫'] },
      };

      // Mock product cache
      const mockCache = {
        ASIN1: { data: { categoryInfo: { main: '電子レンジ' } }, status: 'valid' },
        ASIN2: { data: { categoryInfo: { main: 'アイロン' } }, status: 'valid' },
        ASIN3: { data: { categoryInfo: { main: '冷蔵庫' } }, status: 'valid' }, // Registered
        ASIN4: { data: { categoryInfo: { main: 'カメラ' } }, status: 'valid' },
      };

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.endsWith('categorygroups.json')) return JSON.stringify(mockGroups);
        if (path.endsWith('paapi-product-cache.json')) return JSON.stringify(mockCache);
        return '';
      });
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await organizer.getUnregisteredCategories();

      // Unicode順（デフォルトのsort）で並び替える
      // 'アイロン' (カタカナ), 'カメラ' (カタカナ), '電子レンジ' (漢字)
      // カタカナ間は読み順（Unicode順）で並ぶ
      expect(result).toEqual(['アイロン', 'カメラ', '電子レンジ']);
    });

    it('should use cached data on subsequent calls', async () => {
      const mockGroups = {
        家電: { slug: 'appliances', categories: ['冷蔵庫'] },
      };
      const mockCache = {
        ASIN1: { data: { categoryInfo: { main: '電子レンジ' } }, status: 'valid' },
      };

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.endsWith('categorygroups.json')) return JSON.stringify(mockGroups);
        if (path.endsWith('paapi-product-cache.json')) return JSON.stringify(mockCache);
        return '';
      });
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      // First call
      await organizer.getUnregisteredCategories();

      // Second call
      await organizer.getUnregisteredCategories();

      // fs.readFile should be called twice (once for categorygroups, once for cache)
      // NOT 4 times (2 for each call).
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should handle missing product cache gracefully', async () => {
      const mockGroups = {
        家電: { slug: 'appliances', categories: ['冷蔵庫'] },
      };

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.endsWith('categorygroups.json')) return JSON.stringify(mockGroups);
        if (path.endsWith('paapi-product-cache.json')) {
          const error: any = new Error('ENOENT: no such file or directory');
          error.code = 'ENOENT';
          throw error;
        }
        return '';
      });

      const result = await organizer.getUnregisteredCategories();
      expect(result).toEqual([]);
    });

    it('should handle new data format (categoryGroups as array)', async () => {
      const mockGroups = {
        categoryGroups: [{ name: '家電', slug: 'appliances', children: ['冷蔵庫'] }],
      };
      const mockCache = {
        ASIN1: { data: { categoryInfo: { main: '電子レンジ' } }, status: 'valid' },
        ASIN2: { data: { categoryInfo: { main: '冷蔵庫' } }, status: 'valid' },
      };

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.endsWith('categorygroups.json')) return JSON.stringify(mockGroups);
        if (path.endsWith('paapi-product-cache.json')) return JSON.stringify(mockCache);
        return '';
      });

      const result = await organizer.getUnregisteredCategories();
      expect(result).toEqual(['電子レンジ']);
    });

    it('should load categories from shards when shard files exist', async () => {
      const mockGroups = {
        categoryGroups: [{ name: '家電', slug: 'appliances', children: ['冷蔵庫'] }],
      };
      const mockShard1 = {
        ASIN1: { data: { categoryInfo: { main: '電子レンジ' } }, status: 'valid' },
        ASIN2: { data: { categoryInfo: { main: 'その他／全般' } }, status: 'valid' },
      };
      const mockShard2 = {
        ASIN3: { data: { categoryInfo: { main: '炊飯器' } }, status: 'valid' },
      };

      (fs.readdir as jest.Mock).mockResolvedValue(['shard1.json', 'shard2.json', 'ignored.txt']);
      (fs.readFile as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('categorygroups.json')) return Promise.resolve(JSON.stringify(mockGroups));
        if (path.endsWith('shard1.json')) return Promise.resolve(JSON.stringify(mockShard1));
        if (path.endsWith('shard2.json')) return Promise.resolve(JSON.stringify(mockShard2));
        return Promise.resolve('');
      });

      const result = await organizer.getUnregisteredCategories();
      expect(result).toEqual(['炊飯器', '電子レンジ']);
    });
  });
});
