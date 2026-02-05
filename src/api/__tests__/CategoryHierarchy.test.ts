import { CreatorsAPIClient } from '../CreatorsAPIClient';
import { CreatorsAPIItem } from '../../types/CreatorsAPITypes';

// Mock axios
const mockPost = jest.fn();
jest.mock('axios', () => ({
    create: jest.fn(() => ({
        post: mockPost,
        defaults: { headers: {} } // Add defaults if accessed
    })),
    isAxiosError: jest.fn(() => false),
    post: jest.fn() // For oauth
}));

describe('Category Hierarchy Traversal', () => {
    let client: CreatorsAPIClient;
    let clientAny: any;

    beforeEach(() => {
        client = new CreatorsAPIClient();
        clientAny = client as any;
        jest.clearAllMocks();
    });

    test('should pick ancestor category if leaf is not in valid list but ancestor is', () => {
        // Setup valid categories
        client.setValidCategories(['Known Parent']);

        const item: Partial<CreatorsAPIItem> = {
            browseNodeInfo: {
                browseNodes: [
                    {
                        id: 'leaf',
                        displayName: 'Unknown Leaf',
                        contextFreeName: 'Leaf',
                        ancestor: {
                            id: 'parent',
                            displayName: 'Known Parent',
                            contextFreeName: 'Parent',
                            ancestor: {
                                id: 'root',
                                displayName: 'Root',
                                contextFreeName: 'Root'
                            }
                        }
                    }
                ]
            }
        };

        const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);

        expect(result.category).toBe('Known Parent');
        expect(result.categoryInfo.main).toBe('Known Parent');
        expect(result.categoryInfo.sub).toBe('Unknown Leaf');
    });

    test('should pick closest valid ancestor', () => {
        // Setup valid categories: both Parent and Root are valid
        // Traversing up from Leaf: Leaf -> Parent -> Root
        // Matches Parent first
        client.setValidCategories(['Known Parent', 'Root']);

        const item: Partial<CreatorsAPIItem> = {
            browseNodeInfo: {
                browseNodes: [
                    {
                        id: 'leaf',
                        displayName: 'Unknown Leaf',
                        contextFreeName: 'Leaf',
                        ancestor: {
                            id: 'parent',
                            displayName: 'Known Parent',
                            contextFreeName: 'Parent',
                            ancestor: {
                                id: 'root',
                                displayName: 'Root',
                                contextFreeName: 'Root'
                            }
                        }
                    }
                ]
            }
        };

        const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
        expect(result.category).toBe('Known Parent');
    });

    test('should fallback to leaf if no ancestor matches', () => {
        client.setValidCategories(['Other Category']);

        const item: Partial<CreatorsAPIItem> = {
            browseNodeInfo: {
                browseNodes: [
                    {
                        id: 'leaf',
                        displayName: 'Unknown Leaf',
                        contextFreeName: 'Leaf',
                        ancestor: {
                            id: 'parent',
                            displayName: 'Unknown Parent',
                            contextFreeName: 'Parent'
                        }
                    }
                ]
            }
        };

        const result = clientAny.extractCategoryInfo(item as CreatorsAPIItem);
        expect(result.category).toBe('Unknown Leaf');
    });
});

describe('Integration: Category Loading', () => {
    test('should load categories from file', async () => {
        const client = new CreatorsAPIClient();

        // Mock authentication
        client.authenticate('app', 'cred', 'secret', 'tag');

        // Mock OAuth response (since searchProducts calls makeRequest which calls getAccessToken)
        const axios = require('axios');
        // Mocking the static axios.post for getAccessToken
        axios.post.mockResolvedValue({
            data: { access_token: 'token', expires_in: 3600 }
        });

        // Mock the instance post for searchProducts
        mockPost.mockResolvedValue({
            data: { searchResult: { items: [], totalResultCount: 0 } }
        });

        // Trigger loading
        await client.searchProducts({ keywords: ['test'], category: 'All', maxResults: 1 });

        // Check if categories were loaded
        const count = client.getValidCategoriesCount();
        console.log(`Loaded ${count} categories from file during test`);

        // data/categorygroups.json should exist in the repo
        expect(count).toBeGreaterThan(0);
    });
});
