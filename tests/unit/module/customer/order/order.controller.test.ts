import { beforeEach, describe, expect, it, vi } from 'vitest';

const { orderServiceMock, queueMock } = vi.hoisted(() => ({
  orderServiceMock: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  queueMock: {
    add: vi.fn(),
  },
}));

vi.mock('@/module/customer/order/order.service', () => ({
  OrderService: orderServiceMock,
}));

vi.mock('@/config/queue', () => ({
  reportQueue: queueMock,
}));

import { OrderController } from '@/module/customer/order/order.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('OrderController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when getAll receives invalid query params', async () => {
    const req: any = { query: { page: '0' } };
    const res = createResponse();
    const next = vi.fn();

    await OrderController.getAll(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns data for getAll on valid input', async () => {
    orderServiceMock.getAll.mockResolvedValueOnce({ data: [], pagination: { total: 0 } });
    const req: any = { query: {} };
    const res = createResponse();
    const next = vi.fn();

    await OrderController.getAll(req, res as any, next);
    await flushAsyncHandler();

    expect(orderServiceMock.getAll).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: [], pagination: { total: 0 } });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when getById does not find an order', async () => {
    orderServiceMock.getById.mockResolvedValueOnce(null);
    const req: any = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
    const res = createResponse();
    const next = vi.fn();

    await OrderController.getById(req, res as any, next);
    await flushAsyncHandler();

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Order not found' });
  });

  it('delegates service errors from create to next', async () => {
    const error = new Error('boom');
    orderServiceMock.create.mockRejectedValueOnce(error);
    const req: any = {
      body: {
        currencyId: 'PEN',
        exchangeRate: 1,
        discount: 0,
        status: 'PENDING',
        societyId: '550e8400-e29b-41d4-a716-446655440000',
        partnerId: '550e8400-e29b-41d4-a716-446655440001',
        branchId: '550e8400-e29b-41d4-a716-446655440002',
        orderItems: [{ productId: '550e8400-e29b-41d4-a716-446655440003', quantity: 1, unitPrice: 10 }],
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await OrderController.create(req, res as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalledWith(error);
  });

  it('updates an order successfully', async () => {
    orderServiceMock.update.mockResolvedValueOnce({ id: 'order-1' });
    const req: any = {
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      body: { status: 'CANCELLED' },
    };
    const res = createResponse();
    const next = vi.fn();

    await OrderController.update(req, res as any, next);
    await flushAsyncHandler();

    expect(orderServiceMock.update).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ id: 'order-1' });
  });

  it('deletes an order successfully', async () => {
    orderServiceMock.delete.mockResolvedValueOnce(undefined);
    const req: any = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
    const res = createResponse();
    const next = vi.fn();

    await OrderController.delete(req, res as any, next);
    await flushAsyncHandler();

    expect(orderServiceMock.delete).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('queues report generation', async () => {
    const req: any = {
      query: {},
      user: { id: 'user-1' },
    };
    const res = createResponse();
    const next = vi.fn();

    await OrderController.getReport(req, res as any, next);
    await flushAsyncHandler();

    expect(queueMock.add).toHaveBeenCalledWith('generate-excel', expect.objectContaining({
      userId: 'user-1',
      filters: {},
    }));
    expect(res.status).toHaveBeenCalledWith(202);
  });
});
