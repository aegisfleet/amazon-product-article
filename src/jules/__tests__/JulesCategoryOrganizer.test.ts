import * as fs from 'fs';
import { JulesCategoryOrganizer } from '../JulesCategoryOrganizer';

jest.mock('fs');
jest.mock('axios', () => ({
    create: jest.fn(() => ({
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() }
        },
        post: jest.fn(),
        get: jest.fn()
    }))
}));

describe('JulesCategoryOrganizer', () => {
    let organizer: JulesCategoryOrganizer;
    const mockCredentials = { apiKey: 'test-key' };

    beforeEach(() => {
        organizer = new JulesCategoryOrganizer(mockCredentials);
        jest.clearAllMocks();
    });

    describe('getUnregisteredCategories', () => {
        it('should sort unregistered categories alphabetically', () => {
            // Mock categorygroups.json
            const mockGroups = {
                "家電": { "slug": "appliances", "categories": ["冷蔵庫"] }
            };

            // Mock product cache
            const mockCache = {
                "ASIN1": { "data": { "categoryInfo": { "main": "電子レンジ" } }, "status": "valid" },
                "ASIN2": { "data": { "categoryInfo": { "main": "アイロン" } }, "status": "valid" },
                "ASIN3": { "data": { "categoryInfo": { "main": "冷蔵庫" } }, "status": "valid" }, // Registered
                "ASIN4": { "data": { "categoryInfo": { "main": "カメラ" } }, "status": "valid" }
            };

            (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                if (path.endsWith('categorygroups.json')) return JSON.stringify(mockGroups);
                if (path.endsWith('paapi-product-cache.json')) return JSON.stringify(mockCache);
                return "";
            });
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            const result = organizer.getUnregisteredCategories();

            // Unicode順（デフォルトのsort）で並び替える
            // 'アイロン' (カタカナ), 'カメラ' (カタカナ), '電子レンジ' (漢字)
            // カタカナ間は読み順（Unicode順）で並ぶ
            expect(result).toEqual(["アイロン", "カメラ", "電子レンジ"]);
        });
    });
});
