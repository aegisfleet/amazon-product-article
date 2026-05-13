import fs from 'node:fs/promises';
import path from 'node:path';
import type { Product } from '../../types/Product';
import { saveSessionInfo } from '../SessionManager';

// Mock fs and path
jest.mock('node:fs/promises');
jest.mock('node:path');

// Mock Logger
jest.mock('../../utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

describe('SessionManager', () => {
  const mockProduct = {
    asin: 'B000000000',
    title: 'Test Product',
    price: { amount: 100, currency: 'JPY', formatted: '¥100' },
    images: { primary: 'url', thumbnails: [] },
    specifications: {},
    rating: { average: 4.5, count: 100 },
    category: 'Test Category',
  } as Product;

  const mockSessionInfo = {
    sessionId: 'test-session-id',
    sessionName: 'Test Session',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
  });

  it('should save session info for valid ASIN', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue('/app');

    await saveSessionInfo(mockProduct, mockSessionInfo);

    expect(fs.mkdir).toHaveBeenCalledWith('/app/data/sessions', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalled();

    const [filePath, content] = (fs.writeFile as jest.Mock).mock.calls[0];
    expect(filePath).toMatch(/\/app\/data\/sessions\/B000000000-\d+\.json/);

    const parsedContent = JSON.parse(content);
    expect(parsedContent.product.asin).toBe(mockProduct.asin);
    expect(parsedContent.session.sessionId).toBe(mockSessionInfo.sessionId);
  });

  it('should throw error for invalid ASIN (Path Traversal attempt)', async () => {
    const invalidProduct = { ...mockProduct, asin: '../invalid' };
    await expect(saveSessionInfo(invalidProduct, mockSessionInfo)).rejects.toThrow('Invalid ASIN format');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should throw error for invalid ASIN (Invalid characters)', async () => {
    const invalidProduct = { ...mockProduct, asin: 'INVALID-ASIN' };
    await expect(saveSessionInfo(invalidProduct, mockSessionInfo)).rejects.toThrow('Invalid ASIN format');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should throw error for invalid ASIN (Absolute path attempt)', async () => {
    const invalidProduct = { ...mockProduct, asin: '/tmp/invalid-asin-test' };
    await expect(saveSessionInfo(invalidProduct, mockSessionInfo)).rejects.toThrow('Invalid ASIN format');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should throw error for invalid ASIN (Null byte injection)', async () => {
    const invalidProduct = { ...mockProduct, asin: 'B000000000\0' };
    await expect(saveSessionInfo(invalidProduct, mockSessionInfo)).rejects.toThrow('Invalid ASIN format');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
