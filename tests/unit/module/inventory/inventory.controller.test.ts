import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inventoryServiceMock } = vi.hoisted(() => ({
  inventoryServiceMock: {
    getAll: vi.fn(),
    createAdjustment: vi.fn(),
  },
}));

vi.mock('@/module/inventory/inventory.service', () => ({
  InventoryService: inventoryServiceMock,
}));

import { InventoryController } from '@/module/inventory/inventory.controller';

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('InventoryController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid getAll query', async () => {
    const req: any = { query: { startDate: 'invalid-date' } };
    const res = createResponse();
    const next = vi.fn();

    await InventoryController.getAll(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns kardex data on valid getAll request', async () => {
    inventoryServiceMock.getAll.mockResolvedValueOnce({ data: [], pagination: { total: 0 } });
    const req: any = { query: {} };
    const res = createResponse();
    const next = vi.fn();

    await InventoryController.getAll(req, res as any, next);

    expect(inventoryServiceMock.getAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      sortBy: 'date',
      sortOrder: 'desc',
    }, {});
    expect(res.json).toHaveBeenCalledWith({ data: [], pagination: { total: 0 } });
  });

  it('delegates getAll service errors to next', async () => {
    const error = new Error('boom');
    inventoryServiceMock.getAll.mockRejectedValueOnce(error);
    const req: any = { query: {} };
    const res = createResponse();
    const next = vi.fn();

    await InventoryController.getAll(req, res as any, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('returns 400 for invalid createAdjustment payload', async () => {
    const req: any = { body: {} };
    const res = createResponse();
    const next = vi.fn();

    await InventoryController.createAdjustment(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('creates an adjustment successfully', async () => {
    inventoryServiceMock.createAdjustment.mockResolvedValueOnce({ id: 'trx-1' });
    const req: any = {
      body: {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        branchOfficeId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'ADJUSTMENT_ADD',
        quantity: 2,
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await InventoryController.createAdjustment(req, res as any, next);

    expect(inventoryServiceMock.createAdjustment).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'trx-1' });
  });

  it('delegates createAdjustment service errors to next', async () => {
    const error = new Error('boom');
    inventoryServiceMock.createAdjustment.mockRejectedValueOnce(error);
    const req: any = {
      body: {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        branchOfficeId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'ADJUSTMENT_ADD',
        quantity: 2,
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await InventoryController.createAdjustment(req, res as any, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
