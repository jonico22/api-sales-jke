import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { purchaseDetailServiceMock } = vi.hoisted(() => ({
  purchaseDetailServiceMock: {
    getAllPurchaseDetails: vi.fn(),
    getPurchaseDetailById: vi.fn(),
    createPurchaseDetail: vi.fn(),
    updatePurchaseDetail: vi.fn(),
    deletePurchaseDetail: vi.fn(),
  },
}));

vi.mock('@/module/customer/purchaseDetail/purchaseDetail.service', () => purchaseDetailServiceMock);

import * as PurchaseDetailController from '@/module/customer/purchaseDetail/purchaseDetail.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('purchaseDetail.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when getAll receives invalid query params', async () => {
    const req: any = { query: { page: '0' } };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseDetailController.getAll(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('creates a purchase detail successfully', async () => {
    purchaseDetailServiceMock.createPurchaseDetail.mockResolvedValueOnce({ id: 'detail-1' });
    const req: any = {
      body: {
        purchaseId: '550e8400-e29b-41d4-a716-446655440000',
        productId: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 2,
        unitPrice: 25,
        subtotal: 50,
        total: 50,
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseDetailController.create(req, res as any, next);
    await flushAsyncHandler();

    expect(purchaseDetailServiceMock.createPurchaseDetail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'detail-1' });
  });

  it('delegates validation errors from create to next', async () => {
    const req: any = { body: {} };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseDetailController.create(req, res as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError);
  });

  it('delegates service errors from remove to next', async () => {
    const error = new Error('boom');
    purchaseDetailServiceMock.deletePurchaseDetail.mockRejectedValueOnce(error);
    const req: any = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
    const res = createResponse();
    const next = vi.fn();

    await PurchaseDetailController.remove(req, res as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalledWith(error);
  });
});
