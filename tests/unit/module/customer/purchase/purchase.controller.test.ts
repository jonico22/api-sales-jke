import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { purchaseServiceMock } = vi.hoisted(() => ({
  purchaseServiceMock: {
    getAllPurchases: vi.fn(),
    getPurchaseById: vi.fn(),
    createPurchase: vi.fn(),
    updatePurchase: vi.fn(),
    deletePurchase: vi.fn(),
  },
}));

vi.mock('@/module/customer/purchase/purchase.service', () => purchaseServiceMock);

import * as PurchaseController from '@/module/customer/purchase/purchase.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('purchase.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when getAll receives invalid query params', async () => {
    const req: any = { query: { minAmount: 'oops' } };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseController.getAll(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when getById does not find a purchase', async () => {
    purchaseServiceMock.getPurchaseById.mockResolvedValueOnce(null);
    const req: any = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseController.getById(req, res as any, next);
    await flushAsyncHandler();

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Purchase not found' });
  });

  it('creates a purchase successfully', async () => {
    purchaseServiceMock.createPurchase.mockResolvedValueOnce({ id: 'purchase-1' });
    const req: any = {
      body: {
        societyId: '550e8400-e29b-41d4-a716-446655440000',
        providerId: '550e8400-e29b-41d4-a716-446655440001',
        currencyId: '550e8400-e29b-41d4-a716-446655440002',
        totalAmount: 100,
        branchOfficeId: '550e8400-e29b-41d4-a716-446655440003',
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseController.create(req, res as any, next);
    await flushAsyncHandler();

    expect(purchaseServiceMock.createPurchase).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'purchase-1' });
  });

  it('delegates validation errors from create to next', async () => {
    const req: any = { body: {} };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseController.create(req, res as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError);
  });
});
