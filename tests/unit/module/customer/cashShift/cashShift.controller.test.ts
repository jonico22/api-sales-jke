import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { cashShiftServiceMock } = vi.hoisted(() => ({
  cashShiftServiceMock: {
    openShift: vi.fn(),
    closeShift: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    addManualMovement: vi.fn(),
    getCreatedByUsers: vi.fn(),
    getCurrentShift: vi.fn(),
    getForSelect: vi.fn(),
  },
}));

vi.mock('@/module/customer/cashShift/cashShift.service', () => ({
  CashShiftService: cashShiftServiceMock,
}));

import { CashShiftController } from '@/module/customer/cashShift/cashShift.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('CashShiftController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid getAll query', async () => {
    const req: any = { query: { page: 'bad' } };
    const res = createResponse();
    const next = vi.fn();

    await CashShiftController.getAll(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('opens a shift successfully', async () => {
    cashShiftServiceMock.openShift.mockResolvedValueOnce({ id: 'shift-1' });
    const req: any = {
      body: {
        societyId: '550e8400-e29b-41d4-a716-446655440000',
        branchId: '550e8400-e29b-41d4-a716-446655440001',
        userId: 'user-1',
        initialAmount: 100,
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await CashShiftController.openShift(req, res as any, next);
    await flushAsyncHandler();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'shift-1' });
  });

  it('delegates validation errors from closeShift to next', async () => {
    const req: any = {
      params: { id: 'invalid' },
      body: {},
    };
    const res = createResponse();
    const next = vi.fn();

    await CashShiftController.closeShift(req, res as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError);
  });

  it('gets current shift successfully', async () => {
    cashShiftServiceMock.getCurrentShift.mockResolvedValueOnce({ id: 'shift-1' });
    const req: any = {
      query: {
        branchId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'user-1',
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await CashShiftController.getCurrentShift(req, res as any, next);
    await flushAsyncHandler();

    expect(cashShiftServiceMock.getCurrentShift).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'user-1',
      undefined
    );
    expect(res.json).toHaveBeenCalledWith({ id: 'shift-1' });
  });
});
